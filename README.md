# Recode

Recode is an open-source desktop trainer and memory-inspection toolkit for **offline and single-player games**.

> Recode is not intended for competitive multiplayer cheating, anti-cheat bypassing, DRM circumvention, or interfering with online services.

## Features

- Native Windows and Linux desktop application using Tauri 2 + Rust
- React + TypeScript interface
- Running-process browser and filtering
- Exact-value scans for i32, u32, i64, u64, f32 and f64
- Rescans to narrow addresses after values change
- Direct value editing
- Saved trainer entries with optional freeze toggles
- Offline-use acknowledgement and anti-cheat process guardrails
- GitHub Actions builds for Windows and Linux
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

Build a native bundle:

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

Every push/PR runs `.github/workflows/build.yml` on Windows and Linux. Tags matching `v*` run `.github/workflows/release.yml` and create downloadable native release assets.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes within the offline/single-player scope.

## License

MIT © 2026 bxane-dev. See [LICENSE](LICENSE).
