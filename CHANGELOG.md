# Changelog

## 1.6.0 — 2026-10-05

### Recode Hub 2.0
- Nexus-style game-first Hub browser while retaining Recode branding.
- Browse, Installed, Updates, and Favorites tabs.
- Search by trainer, author, description, tags, and framework.
- Category and verified-only filters.
- Sort by recently updated, newest, downloads, endorsements, or title.
- Rich trainer cards with author, category, version, game version, framework tags, option count, download/endorsement counts, and update date.
- Local install registry and update detection by Hub profile version.
- Local favorites.
- Supabase metadata for categories, versions, tags, download counts, endorsements, changelog, and featured status.
- Server-side download counter for successful Supabase Hub installs.
- All-games Hub browsing when no local game is selected.
- Existing 1-click install/apply, .CT conversion, automatic compatible-profile caching, and GitHub fallback remain available.


## 1.5.0 — 2026-10-05

### Added
- Framework Bridge for REFramework, BepInEx, MelonLoader, UE4SS, and SMAPI.
- Automatic framework detection from selected game/install and running executable paths.
- Framework requirement metadata inside native `.rc` profiles.
- Required-framework compatibility checks before 1-click trainer activation.
- Official framework links directly from the Recode UI.
- AI Builder support for declaring framework dependencies in generated `.rc` profiles.
- Extensible framework detector architecture for adding more mod loaders later.

### Changed
- Trainers with missing required frameworks install safely but remain disabled until the framework is detected.
- Framework requirements survive `.rc` import/export and Hub distribution.


## 1.4.0 — 2026-10-05

### Added
- Native Recode `.rc` trainer files.
- Cheat Engine `.CT` → `.rc` conversion inside Recode.
- `.rc` import/export and remote Hub URL support.
- Game-aware **Cheat Engine Web** search for the selected Steam/GOG/Epic title.
- Direct **OK · Send** AI request flow.
- OpenAI/ChatGPT API adapter using the Responses API.
- Claude/Anthropic Messages API adapter.
- Google Gemini API adapter.
- Custom OpenAI-compatible/local endpoint support.
- AI response validation before a trainer can be applied.
- AI API keys remain session-only and are not included in `.rc` files or Supabase.

### Compatibility
- Older Recode JSON profiles continue to import.
- Compatible numeric Cheat Engine entries convert to `.rc`.
- Unsupported/script-based CT entries are excluded from the data-only conversion.


## 1.3.0 — 2026-10-05

### Added
- AI-assisted trainer builder workflow compatible with ChatGPT, Claude, Gemini, local models, and other assistants.
- Upload + Apply for generated Recode profiles and compatible Cheat Engine tables.
- Recode Hub one-click trainer discovery and apply flow.
- Automatic Steam, GOG, and Epic game detection integration with Hub matching.
- Optional automatic compatible-trainer discovery.
- Remember-enabled-cheats setting for the next session.
- Explicit opt-in consent before publishing community trainer profiles.
- Dedicated Supabase-backed Recode Hub database with RLS-protected published profiles and private submission records.
- Live Supabase Hub lookup with GitHub catalog fallback.
- Rotated Tauri updater verification key for future signed Windows/Linux updates.

### Desktop packages
- Windows x64 NSIS installer with no console/terminal window.
- Linux x64 Debian package.
- Linux x64 AppImage.

### Safety
- Hub/community data is restricted to validated data-only trainer profiles.
- Offline/single-player confirmation remains required for memory operations.
- No anti-cheat bypass, DRM bypass, or online-service manipulation.


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
