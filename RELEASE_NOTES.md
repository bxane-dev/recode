# Recode v1.5.0

Recode 1.5 adds a Framework Bridge for common offline-game mod frameworks.

## Frameworks

- REFramework
- BepInEx
- MelonLoader
- UE4SS
- SMAPI

Recode detects installed frameworks from the selected game's files and running executable location. Native `.rc` profiles can declare framework requirements, and one-click apply keeps trainer entries disabled when a required framework is missing.

The Framework Bridge is dependency-aware rather than a generic arbitrary-code executor. Framework-specific scripts/plugins stay under their framework's normal installation model, while Recode handles detection, compatibility metadata, trainer selection, Hub distribution, and data-only trainer application.

## Existing v1.4 features

- Native `.rc` files
- Compatible `.CT` → `.rc` conversion
- Steam/GOG/Epic detection
- Recode Hub + Supabase
- AI Builder
- One-click apply
- Optional remembered cheat selections
- Windows/Linux installers and updater wiring
