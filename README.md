# Recode

Recode is an open-source desktop trainer and memory-inspection toolkit for **offline and single-player games**.

> Recode is not intended for competitive multiplayer cheating, anti-cheat bypassing, DRM circumvention, or interfering with online services.

## What is included

- Windows and Linux desktop application built with Tauri 2, Rust, React and TypeScript
- Running-process browser with search
- Exact-value memory scans for signed/unsigned integers and floating-point values
- Rescan support to narrow results after an in-game value changes
- Direct value editing for selected addresses
- Saved trainer entries stored locally in the UI
- Offline-use acknowledgement and anti-cheat-process guardrails
- GitHub Actions builds for Windows and Linux
- Tag-based release workflow

## Current status

The first usable milestone is an MVP memory scanner/trainer. It deliberately does **not** contain anti-cheat bypasses, kernel drivers, stealth/injection mechanisms, network manipulation, or DRM bypasses.

## Development

Requirements:

- Node.js 20+
- Rust stable
- Tauri 2 system prerequisites for your OS

Install and run:

```bash
npm install
npm run tauri dev
```

Build a native desktop bundle:

```bash
npm run tauri build
```

### Linux

Tauri requires WebKitGTK and related system packages. On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Depending on your distro security settings, reading/writing another process may require permission changes or launching both Recode and the target game under the same user/session.

### Windows

Run Recode and the target game at the same privilege level. Recode does not request a kernel driver or attempt to bypass protected processes.

## Releases

Every push and pull request runs the Windows/Linux build workflow. Version tags matching `v*` run the release workflow and attach native bundles to a GitHub Release.

## Contributing

Issues and pull requests are welcome. Keep contributions within Recode's offline/single-player scope.

## License

MIT © 2026 bxane-dev. See [LICENSE](LICENSE).
