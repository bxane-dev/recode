# Recode v1.6.0

Recode 1.6 upgrades Recode Hub into a game-first community trainer browser and tightens the install/update workflow across Windows and Linux.

## Highlights
- Recode Hub 2.0 with a Nexus-style, game-first browsing experience while keeping Recode's own design.
- Browse, Installed, Updates, and Favorites tabs.
- Search by trainer, game, author, description, tags, and framework.
- Category, verified-only, and sorting controls for updated date, newest, downloads, endorsements, and title.
- Rich trainer cards with versions, game versions, authors, frameworks, option counts, downloads, endorsements, and update dates.
- Persistent Hub tab/search/filter/sort state between sessions.
- Installed, Update, Verified, Featured, and compatibility status badges.
- Per-trainer install progress instead of locking the entire Hub.
- Compatible-only **Update all** for installed trainers.
- Proper version comparison so older trainer versions are not incorrectly offered as updates.
- Trainer details view with process targets, required frameworks, source link, and changelog.
- Better loading skeletons, empty states, result counts, and filter reset behavior.

## Trainer workflow
- Native Recode `.rc` trainer format.
- Cheat Engine `.CT` → `.rc` conversion for supported data-only entries.
- Slider controls for editable trainer values.
- Framework Bridge support for REFramework, BepInEx, MelonLoader, UE4SS, and SMAPI.
- AI Builder support for ChatGPT/OpenAI, Claude, Gemini, local/custom OpenAI-compatible providers.
- Supabase-backed Recode Hub community publishing and discovery.
- Steam, GOG, and Epic Games library matching.

## Safety and reliability
- Offline/single-player confirmation is still required before applying trainers.
- Recode blocks applying a Hub trainer when a different game is selected.
- Remote trainer imports are restricted to HTTPS raw GitHub/Gist URLs.
- Community source links are validated before opening.
- Updater release endpoint now points to the current `bxanedot/recode` repository.
- No anti-cheat bypass, DRM bypass, kernel driver, or online-service manipulation features.

## Downloads
- **Windows x64:** `Recode-Setup-Windows-x64.exe`
- **Linux x64 (Debian/Ubuntu):** `Recode-Linux-x64.deb`
- **Linux x64 portable:** `Recode-Linux-x64.AppImage`
- SHA-256 checksums are included with the release assets.

## Changelog
This release includes the Hub 2.0 work from October 5, 2026 plus the Hub UX, compatibility, versioning, safer import, and updater fixes completed on October 7, 2026.
