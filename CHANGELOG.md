# Changelog

## 1.2.0 — 2026-10-05

### Added
- Automatic Steam library discovery from local Steam manifests and additional Steam library folders.
- Automatic Epic Games detection from launcher manifests on Windows and Legendary/Heroic data on Linux.
- GOG detection from common GOG Galaxy/GOG install locations and Heroic data.
- Installed-game library panel with running-game matching.
- Automatic refresh of running processes so detected games can bind without using a terminal.
- Manual rescan and library filtering controls.

### Changed
- Recode Hub no longer shows the compatibility warning paragraph in the main UI.
- Release remains fully installable through the Windows installer, Linux DEB, or AppImage.
## 1.1.0 — 2026-10-05

### Added
- Recode Hub online trainer catalog.
- One-click profile import and apply for a selected offline game.
- Safe Cheat Engine `.CT` import for numeric address and pointer entries.
- Direct GitHub Raw/Gist trainer URL import and apply.
- Hub profile matching by game process name.
- Strict data-only remote trainer handling; no downloaded executables or scripts are run.

### Compatibility
- Native Recode profiles are fully supported.
- Cheat Engine Auto Assembler/Lua/script entries are intentionally skipped.
- Wand/WeMod trainers are proprietary/encrypted and remain in the official Wand application.

## 1.0.1 — 2026-10-05

### Added
- Automatic update checks shortly after startup.
- Manual **Check updates** control.
- Signed Tauri updater downloads and installation.
- GitHub Releases `latest.json` updater manifest.
- Signed Windows NSIS and Linux AppImage updater artifacts.
- Signed-version enforcement to prevent manifest/version mismatch attacks.

### Notes
- v1.0.0 users need one manual upgrade to v1.0.1+ because the updater plugin was not included in v1.0.0.
- Future updates can be installed from inside Recode.


## 1.0.0 — 2026-10-05

First stable release.

### Added
- Windows and Linux desktop application.
- Exact-value memory scanning and rescanning.
- Direct writes and frozen trainer values.
- Module enumeration and module-relative addresses.
- Multi-level pointer-chain resolution.
- AOB/signature scanning with wildcards, occurrence selection and signed offsets.
- Trainer profile library.
- JSON profile import/export.
- Global hotkeys for trainer entries.
- Native Windows NSIS, Linux DEB and Linux AppImage packaging.
- Automated GitHub release publishing and SHA-256 checksums.

### Safety scope
- Offline/single-player acknowledgement required before memory operations.
- Known anti-cheat/security processes are filtered and blocked.
- No kernel driver, anti-cheat bypass, stealth injection, DRM bypass or network manipulation features.
