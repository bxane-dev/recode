# Contributing to Recode

Thanks for contributing.

## Ground rules

Recode is scoped to offline and single-player game tooling. Pull requests must not add:

- anti-cheat bypass or evasion
- kernel drivers intended to defeat protections
- stealth/injection mechanisms for competitive multiplayer games
- network manipulation against game services
- DRM or licensing bypasses
- credential/token theft

## Development

```bash
npm install
npm run tauri dev
```

Before opening a pull request:

```bash
npm run build
cd src-tauri && cargo test
```

Keep changes focused and explain the user-facing behavior in the PR description.
