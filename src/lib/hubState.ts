import type { HubEntry } from "../types";

const INSTALLED_KEY = "recode.hub-installed.v1";
const FAVORITES_KEY = "recode.hub-favorites.v1";

export interface HubInstallRecord {
  id: string;
  version: string;
  installedAt: string;
  entry: HubEntry;
}

export function loadHubInstalls(): HubInstallRecord[] {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordHubInstall(entry: HubEntry) {
  const current = loadHubInstalls().filter((item) => item.id !== entry.id);
  const record: HubInstallRecord = {
    id: entry.id,
    version: entry.version || "1.0.0",
    installedAt: new Date().toISOString(),
    entry
  };
  localStorage.setItem(
    INSTALLED_KEY,
    JSON.stringify([record, ...current].slice(0, 100))
  );
  return record;
}

export function loadHubFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : []
    );
  } catch {
    return new Set<string>();
  }
}

export function saveHubFavorites(values: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...values]));
}
