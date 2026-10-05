# Recode v1.0.0

Recode 1.0 is the first stable release of the open-source offline/single-player trainer toolkit.

## Included

- Windows and Linux native desktop builds
- Exact-value memory scanning and rescanning for signed/unsigned 32/64-bit integers and 32/64-bit floats
- Direct value editing and freeze-style trainer entries
- Loaded-module detection
- Module-relative addresses and multi-level pointer chains
- AOB/signature scanning with wildcard bytes and result offsets
- Per-game trainer profiles
- JSON profile import/export
- Global trainer hotkeys
- Offline/single-player confirmation and known anti-cheat/security-process guardrails
- Windows NSIS installer
- Linux Debian package and AppImage
- SHA-256 checksums for release assets

## Downloads

- `Recode-Setup-Windows-x64.exe`
- `Recode-Linux-x64.deb`
- `Recode-Linux-x64.AppImage`
- `SHA256SUMS.txt`

## Scope

Recode is intended only for local experimentation, accessibility and modding in offline/single-player games you are allowed to modify. It does not include anti-cheat bypasses, protection evasion, kernel drivers, DRM bypasses or online-service manipulation.

Windows release binaries are currently not code-signed, so Windows SmartScreen may display an unknown-publisher warning.
