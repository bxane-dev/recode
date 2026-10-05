use std::collections::{BTreeSet, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::models::InstalledGame;

fn push_unique(output: &mut Vec<InstalledGame>, seen: &mut HashSet<String>, game: InstalledGame) {
    let key = format!("{}|{}", game.store.to_ascii_lowercase(), game.install_path.to_ascii_lowercase());
    if seen.insert(key) {
        output.push(game);
    }
}

fn vdf_value(raw: &str, key: &str) -> Option<String> {
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('"').collect();
        if parts.len() >= 4 && parts[1].eq_ignore_ascii_case(key) {
            return Some(parts[3].replace("\\\\", "\\"));
        }
    }
    None
}

fn steam_roots() -> Vec<PathBuf> {
    let mut roots = BTreeSet::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(path) = env::var("PROGRAMFILES(X86)") {
            roots.insert(PathBuf::from(path).join("Steam").join("steamapps"));
        }
        if let Ok(path) = env::var("PROGRAMFILES") {
            roots.insert(PathBuf::from(path).join("Steam").join("steamapps"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let home = PathBuf::from(home);
            roots.insert(home.join(".local/share/Steam/steamapps"));
            roots.insert(home.join(".steam/steam/steamapps"));
        }
    }

    let mut all: Vec<PathBuf> = roots.into_iter().collect();
    let mut index = 0;
    while index < all.len() {
        let current = all[index].clone();
        index += 1;
        let Ok(raw) = fs::read_to_string(current.join("libraryfolders.vdf")) else { continue };
        for line in raw.lines() {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 4 && parts[1].eq_ignore_ascii_case("path") {
                let candidate = PathBuf::from(parts[3].replace("\\\\", "\\")).join("steamapps");
                if !all.iter().any(|item| item == &candidate) {
                    all.push(candidate);
                }
            }
        }
    }
    all
}

fn scan_steam(output: &mut Vec<InstalledGame>, seen: &mut HashSet<String>) {
    for steamapps in steam_roots() {
        let Ok(entries) = fs::read_dir(&steamapps) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else { continue };
            if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") { continue }

            let Ok(raw) = fs::read_to_string(&path) else { continue };
            let Some(name) = vdf_value(&raw, "name") else { continue };
            let Some(install_dir) = vdf_value(&raw, "installdir") else { continue };
            let app_id = vdf_value(&raw, "appid").unwrap_or_else(|| {
                file_name.trim_start_matches("appmanifest_").trim_end_matches(".acf").to_string()
            });
            let install_path = steamapps.join("common").join(install_dir);
            if !install_path.exists() { continue }

            push_unique(output, seen, InstalledGame {
                id: format!("steam:{app_id}"),
                store: "Steam".to_string(),
                name,
                install_path: install_path.to_string_lossy().into_owned(),
                executable: None,
            });
        }
    }
}

#[cfg(target_os = "windows")]
fn scan_epic(output: &mut Vec<InstalledGame>, seen: &mut HashSet<String>) {
    let Ok(program_data) = env::var("PROGRAMDATA") else { return };
    let root = PathBuf::from(program_data).join("Epic/EpicGamesLauncher/Data/Manifests");
    let Ok(entries) = fs::read_dir(root) else { return };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("item") { continue }
        let Ok(raw) = fs::read_to_string(path) else { continue };
        let Ok(json) = serde_json::from_str::<Value>(&raw) else { continue };

        let install_path = json.get("InstallLocation").and_then(Value::as_str).unwrap_or("").trim();
        if install_path.is_empty() { continue }

        let name = json.get("DisplayName").and_then(Value::as_str)
            .or_else(|| json.get("AppName").and_then(Value::as_str))
            .unwrap_or("Epic game").to_string();
        let id = json.get("CatalogItemId").and_then(Value::as_str)
            .or_else(|| json.get("AppName").and_then(Value::as_str))
            .unwrap_or(&name).to_string();
        let executable = json.get("LaunchExecutable").and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| PathBuf::from(install_path).join(value).to_string_lossy().into_owned());

        push_unique(output, seen, InstalledGame {
            id: format!("epic:{id}"),
            store: "Epic Games".to_string(),
            name,
            install_path: install_path.to_string(),
            executable,
        });
    }
}

#[cfg(not(target_os = "windows"))]
fn scan_epic(_output: &mut Vec<InstalledGame>, _seen: &mut HashSet<String>) {}

fn scan_directory_store(output: &mut Vec<InstalledGame>, seen: &mut HashSet<String>, store: &str, root: &Path) {
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue }
        let name = entry.file_name().to_string_lossy().trim().to_string();
        if name.is_empty() { continue }
        push_unique(output, seen, InstalledGame {
            id: format!("{}:{}", store.to_ascii_lowercase().replace(' ', "-"), name),
            store: store.to_string(),
            name,
            install_path: path.to_string_lossy().into_owned(),
            executable: None,
        });
    }
}

fn scan_gog(output: &mut Vec<InstalledGame>, seen: &mut HashSet<String>) {
    #[cfg(target_os = "windows")]
    {
        scan_directory_store(output, seen, "GOG", Path::new(r"C:\GOG Games"));
        if let Ok(path) = env::var("PROGRAMFILES(X86)") {
            scan_directory_store(output, seen, "GOG", &PathBuf::from(path).join("GOG Galaxy/Games"));
        }
        if let Ok(path) = env::var("PROGRAMFILES") {
            scan_directory_store(output, seen, "GOG", &PathBuf::from(path).join("GOG Galaxy/Games"));
        }
    }

    #[cfg(target_os = "linux")]
    if let Ok(home) = env::var("HOME") {
        let home = PathBuf::from(home);
        scan_directory_store(output, seen, "GOG", &home.join("GOG Games"));
        scan_directory_store(output, seen, "GOG", &home.join("Games/GOG"));
    }
}

#[cfg(target_os = "linux")]
fn scan_linux_launchers(output: &mut Vec<InstalledGame>, seen: &mut HashSet<String>) {
    let Ok(home) = env::var("HOME") else { return };
    let home = PathBuf::from(home);

    if let Ok(raw) = fs::read_to_string(home.join(".config/legendary/installed.json")) {
        if let Ok(json) = serde_json::from_str::<Value>(&raw) {
            if let Some(entries) = json.as_object() {
                for (app_name, item) in entries {
                    let install_path = item.get("install_path").and_then(Value::as_str).unwrap_or("").trim();
                    if install_path.is_empty() { continue }
                    let name = item.get("title").and_then(Value::as_str).unwrap_or(app_name).to_string();
                    push_unique(output, seen, InstalledGame {
                        id: format!("epic:{app_name}"),
                        store: "Epic Games".to_string(),
                        name,
                        install_path: install_path.to_string(),
                        executable: None,
                    });
                }
            }
        }
    }

    let heroic = home.join(".config/heroic/GamesConfig");
    if let Ok(entries) = fs::read_dir(heroic) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") { continue }
            let Ok(raw) = fs::read_to_string(&path) else { continue };
            let Ok(json) = serde_json::from_str::<Value>(&raw) else { continue };

            let install_path = json.pointer("/install/install_path").and_then(Value::as_str)
                .or_else(|| json.get("install_path").and_then(Value::as_str))
                .unwrap_or("").trim();
            if install_path.is_empty() { continue }

            let name = json.get("title").and_then(Value::as_str)
                .or_else(|| json.get("app_name").and_then(Value::as_str))
                .or_else(|| path.file_stem().and_then(|value| value.to_str()))
                .unwrap_or("Heroic game").to_string();
            let platform = json.get("platform").and_then(Value::as_str).unwrap_or("epic").to_ascii_lowercase();
            let store = if platform.contains("gog") { "GOG" } else { "Epic Games" };

            push_unique(output, seen, InstalledGame {
                id: format!("heroic:{}:{}", store.to_ascii_lowercase(), name),
                store: store.to_string(),
                name,
                install_path: install_path.to_string(),
                executable: None,
            });
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn scan_linux_launchers(_output: &mut Vec<InstalledGame>, _seen: &mut HashSet<String>) {}

pub fn scan_installed_games() -> Vec<InstalledGame> {
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    scan_steam(&mut output, &mut seen);
    scan_epic(&mut output, &mut seen);
    scan_gog(&mut output, &mut seen);
    scan_linux_launchers(&mut output, &mut seen);
    output.sort_by(|a, b| a.store.to_ascii_lowercase().cmp(&b.store.to_ascii_lowercase())
        .then(a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())));
    output
}
