# Recode

Recode is an open-source desktop trainer and memory-inspection toolkit for **offline and single-player games**.

> Recode is not intended for competitive multiplayer cheating, anti-cheat bypassing, DRM circumvention, or interfering with online services.

## Download & install

GitHub Actions produces ready-to-install packages:

### Windows

Download **`Recode-Setup-Windows-x64.exe`** from the latest successful **installers** workflow artifact named **Recode-Windows-Installer**.

Run the setup program normally. It installs Recode for the current Windows user, adds an uninstall entry, and creates a Start Menu shortcut without requiring a system-wide installation.

### Linux

The Linux artifact contains:

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
- Offline-use acknowledgement and anti-cheat process guardrails
- GitHub Actions installer builds for Windows and Linux
- Tag-based GitHub releases

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

Every push/PR runs `.github/workflows/build.yml` and produces installable Windows/Linux artifacts. Tags matching `v*` run `.github/workflows/release.yml`.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes within the offline/single-player scope.

## License

MIT © 2026 bxane-dev. See [LICENSE](LICENSE).
