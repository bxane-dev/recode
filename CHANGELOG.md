# Changelog

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
