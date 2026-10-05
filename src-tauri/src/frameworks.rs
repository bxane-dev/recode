use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::models::DetectedFramework;

struct FrameworkDefinition {
    id: &'static str,
    name: &'static str,
    capabilities: &'static [&'static str],
    official_url: &'static str,
}

const DEFINITIONS: &[FrameworkDefinition] = &[
    FrameworkDefinition {
        id: "reframework",
        name: "REFramework",
        capabilities: &["lua-autorun", "native-plugins", "re-engine"],
        official_url: "https://github.com/praydog/REFramework/releases",
    },
    FrameworkDefinition {
        id: "bepinex",
        name: "BepInEx",
        capabilities: &["managed-plugins", "config", "unity"],
        official_url: "https://github.com/BepInEx/BepInEx/releases",
    },
    FrameworkDefinition {
        id: "melonloader",
        name: "MelonLoader",
        capabilities: &["mods", "plugins", "unity"],
        official_url: "https://github.com/LavaGang/MelonLoader/releases",
    },
    FrameworkDefinition {
        id: "ue4ss",
        name: "UE4SS",
        capabilities: &["lua-mods", "native-mods", "mods-txt", "unreal"],
        official_url: "https://github.com/UE4SS-RE/RE-UE4SS/releases",
    },
    FrameworkDefinition {
        id: "smapi",
        name: "SMAPI",
        capabilities: &["mods", "content-packs", "stardew-valley"],
        official_url: "https://github.com/Pathoschild/SMAPI/releases",
    },
];

fn push_root(roots: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    if !path.exists() || !path.is_dir() {
        return;
    }
    let key = path.to_string_lossy().to_ascii_lowercase();
    if seen.insert(key) {
        roots.push(path);
    }
}

fn candidate_roots(install_path: &Path, executable: Option<&Path>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    push_root(&mut roots, &mut seen, install_path.to_path_buf());

    if let Some(executable) = executable {
        if let Some(parent) = executable.parent() {
            push_root(&mut roots, &mut seen, parent.to_path_buf());
        }
    }

    for relative in [
        "Binaries/Win64",
        "Binaries/WinGDK",
        "bin/Win64",
        "bin",
    ] {
        push_root(&mut roots, &mut seen, install_path.join(relative));
    }

    if let Ok(children) = std::fs::read_dir(install_path) {
        for child in children.flatten().take(96) {
            let path = child.path();
            if !path.is_dir() {
                continue;
            }
            for relative in ["Binaries/Win64", "Binaries/WinGDK", "bin/Win64"] {
                push_root(&mut roots, &mut seen, path.join(relative));
            }
        }
    }

    roots
}

fn marker(root: &Path, relative: &str) -> Option<String> {
    let path = root.join(relative);
    if path.exists() {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn detect_reframework(root: &Path) -> Option<(String, &'static str)> {
    if let Some(path) = marker(root, "reframework") {
        return Some((path, "high"));
    }
    if let Some(path) = marker(root, "dinput8.dll") {
        return Some((path, "possible"));
    }
    None
}

fn detect_bepinex(root: &Path) -> Option<(String, &'static str)> {
    marker(root, "BepInEx").map(|path| (path, "high"))
}

fn detect_melonloader(root: &Path) -> Option<(String, &'static str)> {
    marker(root, "MelonLoader").map(|path| (path, "high"))
}

fn detect_ue4ss(root: &Path) -> Option<(String, &'static str)> {
    marker(root, "UE4SS.dll")
        .or_else(|| marker(root, "UE4SS-settings.ini"))
        .map(|path| (path, "high"))
}

fn detect_smapi(root: &Path) -> Option<(String, &'static str)> {
    marker(root, "StardewModdingAPI.exe")
        .or_else(|| marker(root, "StardewModdingAPI"))
        .map(|path| (path, "high"))
}

pub fn detect_frameworks(
    install_path: &str,
    executable: Option<&str>,
) -> Result<Vec<DetectedFramework>, String> {
    let install = PathBuf::from(install_path);
    if !install.exists() || !install.is_dir() {
        return Err("Selected game install directory does not exist".to_string());
    }

    let executable_path = executable
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    let roots = candidate_roots(&install, executable_path.as_deref());

    let mut output = Vec::new();

    for definition in DEFINITIONS {
        let mut found: Option<(PathBuf, String, &'static str)> = None;

        for root in &roots {
            let detected = match definition.id {
                "reframework" => detect_reframework(root),
                "bepinex" => detect_bepinex(root),
                "melonloader" => detect_melonloader(root),
                "ue4ss" => detect_ue4ss(root),
                "smapi" => detect_smapi(root),
                _ => None,
            };

            if let Some((marker, confidence)) = detected {
                found = Some((root.clone(), marker, confidence));
                if confidence == "high" {
                    break;
                }
            }
        }

        output.push(DetectedFramework {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            detected: found.is_some(),
            confidence: found
                .as_ref()
                .map(|(_, _, confidence)| (*confidence).to_string())
                .unwrap_or_else(|| "high".to_string()),
            root_path: found
                .as_ref()
                .map(|(root, _, _)| root.to_string_lossy().into_owned()),
            marker: found.as_ref().map(|(_, marker, _)| marker.clone()),
            capabilities: definition
                .capabilities
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            official_url: definition.official_url.to_string(),
        });
    }

    Ok(output)
}
