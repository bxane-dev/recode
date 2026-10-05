import type { RecodeSettings } from "../types";

const SETTINGS_KEY = "recode.settings.v1";

export const DEFAULT_SETTINGS: RecodeSettings = {
  autoDetectStores: true,
  autoDownloadCompatible: true,
  rememberCheatSelection: true
};

export function loadSettings(): RecodeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const value = JSON.parse(raw) as Partial<RecodeSettings>;
    return {
      autoDetectStores: typeof value.autoDetectStores === "boolean" ? value.autoDetectStores : DEFAULT_SETTINGS.autoDetectStores,
      autoDownloadCompatible: typeof value.autoDownloadCompatible === "boolean" ? value.autoDownloadCompatible : DEFAULT_SETTINGS.autoDownloadCompatible,
      rememberCheatSelection: typeof value.rememberCheatSelection === "boolean" ? value.rememberCheatSelection : DEFAULT_SETTINGS.rememberCheatSelection
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: RecodeSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
