# Recode v1.1.0

Recode 1.1 adds one-click online trainer discovery and broader safe trainer compatibility.

## Added

- Recode Hub online trainer catalog
- **1-Click Apply** for profiles matching the selected offline game
- Cheat Engine `.CT` import for compatible numeric addresses and pointer chains
- Direct Recode/CT import from GitHub Raw and GitHub Gist URLs
- Automatic profile installation and enablement after one-click apply
- Input normalization and validation for imported pointer/signature data
- Existing signed auto-updater support remains built in

## Compatibility limits

Recode does not execute arbitrary trainer EXEs, DLLs, Cheat Engine Auto Assembler scripts or Lua code. Wand/WeMod uses a proprietary encrypted trainer architecture, so its trainers are not extracted or redistributed by Recode.

## Upgrade note

v1.0.0 users need to install v1.1.0 manually once because v1.0.0 did not include the updater plugin. Future signed releases can update from inside Recode.

## Scope

Offline/single-player games only. No anti-cheat bypassing, DRM circumvention or online-service manipulation.
