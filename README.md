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
- Automatic Steam, GOG and Epic Games library detection\n- Direct AI Builder with OK/Send support for OpenAI/ChatGPT API, Claude/Anthropic, Gemini, and OpenAI-compatible/local AI endpoints
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
- Signed automatic updates through GitHub Releases
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

Recode's native trainer file is `*.rc`. Profiles export as `.rc` and can be imported on another Recode installation. Older JSON profiles remain supported for compatibility. Imported entries are disabled by default until the user explicitly enables them.

Hotkeys use Tauri's native global-shortcut support. Examples include `F6`, `Control+Shift+H` and `Alt+F8`. Recode registers only the active profile's shortcuts.

## Recode Hub and trainer compatibility

### Hub 2.0

Recode Hub uses a game-first community browser with Browse, Installed, Updates and Favorites views. Published trainers can carry category, version, game-version, tags, framework requirements, verification state, download/endorsement counters and changelog metadata. Recode tracks installed Hub versions locally and surfaces newer published versions in the Updates tab.



Recode includes **Recode Hub**, a data-only online trainer catalog for offline/single-player games. **Cheat Engine Web** automatically searches public Cheat Engine pages using the currently selected game's name. After selecting a game, **Search game** checks the maintained Hub index and **1-Click Apply** imports the matching profile and enables its entries.

Supported import paths:

- Native Recode `*.rc` trainer profiles.
- Older Recode JSON trainer profiles for compatibility.
- Cheat Engine `*.CT` tables for compatible numeric address/pointer entries, including **Convert .CT → .rc**.
- Direct HTTPS `.rc`, `.json`, or `.ct` files hosted on GitHub Raw or GitHub Gist.

For safety, Recode deliberately skips Cheat Engine Auto Assembler scripts, Lua, DLL injection, executable trainers, and other arbitrary code. Wand/WeMod uses its own proprietary encrypted trainer architecture, so Recode does not extract, crack or execute Wand trainers; users can continue using those through the official Wand application.

The public Hub index lives in `hub/catalog.json`. AI/user-created profiles remain local unless the user explicitly opts in to public sharing. When the user enables publishing consent and submits the GitHub Hub form, the repository workflow validates the data-only profile and, if valid, commits it to `hub/profiles/` and updates `hub/catalog.json` on `main`, making it available to other Recode users.

## AI Builder and community Hub submissions

Recode 1.4 includes a direct **AI Builder**. Choose OpenAI/ChatGPT API, Claude/Anthropic, Gemini, or an OpenAI-compatible/local endpoint, enter the model and API key, describe the trainer feature, then press **OK · Send**. Recode validates the returned profile before applying it. API keys are not written into `.rc` files or Supabase.

The prompt explicitly tells the AI not to invent addresses or signatures. If technical address data is missing, the AI should ask the user for scan results, a compatible table, a pointer chain, an AOB signature or other known game-specific data.

**Submit to Hub** exports the active Recode profile and opens the GitHub Hub-submission form. Community submissions are automatically schema-checked and normalized by GitHub Actions before a data-only profile is committed into `hub/profiles/` and added to `hub/catalog.json`. Published profiles become available to every Recode installation through Hub search.

## Recode Supabase Hub

Recode includes a dedicated Supabase schema for the shared trainer database. The desktop client uses only a Supabase **publishable key** and receives read-only access to published games and profiles through RLS. Community/AI submissions are not writable through the public Data API; publishing requires explicit user consent and a validated server-side submission path.

Database schema: `supabase/recode_hub.sql`

Recode is currently wired to the dedicated Supabase project `recode` (`qmhbkpqpaixxddasosqy`). The desktop client embeds only the project's publishable key, which is safe for public clients and remains constrained by RLS.

Optional build-time overrides:

```env
VITE_RECODE_SUPABASE_URL=...
VITE_RECODE_SUPABASE_PUBLISHABLE_KEY=...
```

Never place a Supabase service-role or secret key in the desktop application.

## Automatic updates

Recode 1.1.0+ checks the latest GitHub Release shortly after startup. Users can also press **Check updates** in the header. When a newer signed release is available, Recode offers to download and install it, then restarts where the platform requires it.

Updates are verified with Tauri's updater signature before installation. The release workflow publishes `latest.json`, the Windows/Linux updater signatures, the normal installers and SHA-256 checksums.

The original v1.0.0 release did not contain the updater plugin, so v1.0.0 users must install v1.1.0 (or newer) manually once. After that, future signed releases can update in-app.

### Maintainer signing setup

The repository needs these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The private updater key must never be committed. Losing the key prevents future signed updates to existing installations.

Current updater signing key ID: `1C8ADB2BAA177B4D`.

The release workflow now requires both updater signing secrets, so Windows/Linux releases cannot be published without signed updater artifacts. macOS is not currently part of Recode's build matrix.

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
