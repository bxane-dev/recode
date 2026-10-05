# Recode Hub

Recode Hub is the reviewed, data-only catalog used by Recode's **Search game** and **1-Click Apply** features.

## Entry format

Each item in `catalog.json` points to a Recode JSON profile or a compatible Cheat Engine `.CT` file hosted on GitHub Raw/Gist.

Recode never executes trainer binaries, DLLs, Auto Assembler scripts, or Lua from Hub entries.

Example catalog item:

```json
{
  "id": "game-profile-id",
  "title": "Game trainer",
  "game": "Game Name",
  "processNames": ["Game.exe"],
  "description": "Offline single-player profile.",
  "author": "contributor",
  "profileUrl": "https://raw.githubusercontent.com/OWNER/REPO/main/profile.recode.json",
  "sourceUrl": "https://github.com/OWNER/REPO",
  "verified": true
}
```

Only submit profiles for offline/single-player games and only when redistribution is permitted.
