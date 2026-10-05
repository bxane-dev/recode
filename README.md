# Recode

Recode is an open-source desktop trainer and memory-inspection toolkit for **offline and single-player games**.

> Recode is not intended for competitive multiplayer cheating, anti-cheat bypassing, DRM circumvention, or interfering with online services.

## Download & install

Stable installers are published on the GitHub **Releases** page.

### Windows

Download **`Recode-Setup-Windows-x64.exe`** from the latest release.

Run the setup program normally. It installs Recode for the current Windows user, adds an uninstall entry, and creates a Start Menu shortcut without requiring a system-wide installation.

### Linux

The latest release contains:

- **`Recode-Linux-x64.deb`** — install on Debian/Ubuntu-based distributions.
- **`Recode-Linux-x64.AppImage`** — portable build for many Linux distributions.

Install the Debian package with:

```bash
sudo apt install ./Recode-Linux-x64.deb
```

For AppImage:

```bash
chmod +x Recode-Linux-x64.AppImage
./Recode-Linux-x64.AppImage
```

## Features

- Native Windows and Linux desktop application using Tauri 2 + Rust
- React + TypeScript interface
- Running-process browser and filtering
- Exact-value scans for i32, u32, i64, u64, f32 and f64
- Rescans to narrow addresses after values change
- Direct value editing
- Saved trainer entries with optional freeze toggles
- Loaded-module detection on Windows and Linux
- Module-relative addresses and multi-level pointer-chain resolution for restart-stable trainers
- AOB/signature scanning with `?` / `??` wildcard bytes
- Signature occurrence selection and signed result offsets
- Offline-use acknowledgement and anti-cheat process guardrails
- GitHub Actions installer builds for Windows and Linux
- Trainer profile library with per-game collections
- JSON profile import/export
- Global trainer hotkeys on Windows and Linux
- Tag-based GitHub releases

## Stable trainers

### Pointer chains

Recode can resolve trainers from a loaded module plus a base offset and optional pointer offsets. When a trainer is enabled, Recode rebinds it to the currently running process with the same executable name and resolves the chain again before writing.

```text
Game.exe + 0x01F0A120 → 0x18 → 0x30 → 0x8
```

### AOB signatures

Recode can scan a selected loaded module for an array-of-bytes signature. Wildcards allow bytes that may change between builds:

```text
48 8B ?? ?? 89 45 ?? 48 85 C0
```

A trainer can use a signed result offset from the matched signature, such as `+0x18` or `-0x10`. Signatures are resolved again when a frozen trainer is applied. A signature only remains update-stable when the chosen byte pattern itself remains sufficiently unique across game versions.

## Profiles and hotkeys

Recode stores trainers in named profiles. A profile contains its game executable binding plus all saved raw addresses, pointer chains, AOB signatures, values and optional hotkeys.

Profiles can be exported as `*.recode.json` files and imported on another Recode installation. Imported entries are disabled by default until the user explicitly enables them.

Hotkeys use Tauri's native global-shortcut support. Examples include `F6`, `Control+Shift+H` and `Alt+F8`. Recode registers only the active profile's shortcuts.

## Scope

Recode is for local experimentation, modding and accessibility in offline/single-player games you are allowed to modify. The project intentionally does not include anti-cheat bypasses, kernel drivers, stealth/injection mechanisms, network manipulation, credential access, or DRM bypasses.

## Run locally

Requirements:

- Node.js 20+
- Rust stable
- Tauri 2 system prerequisites

```bash
npm install
npm run tauri dev
```

Build native installers:

```bash
npm run tauri build
```

### Linux prerequisites

On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Linux process-memory access is subject to your distro's ptrace/security policy. Recode does not weaken those controls.

### Windows

Run Recode and the target game at the same privilege level. Recode uses documented user-mode Windows APIs and does not install a driver.

## Builds

Every push/PR runs `.github/workflows/build.yml` and produces installable Windows/Linux artifacts. Release branches named `release/v*` run `.github/workflows/release.yml`, which creates the matching GitHub release and attaches Windows/Linux installers plus SHA-256 checksums.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes within the offline/single-player scope.

## License

MIT © 2026 bxane-dev. See [LICENSE](LICENSE).
