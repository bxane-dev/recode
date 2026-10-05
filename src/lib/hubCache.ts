import type { TrainerProfile } from "../types";

const CACHE_KEY = "recode.hub-cache.v1";
const MAX_ENTRIES = 24;

interface CachedProfile {
  id: string;
  storedAt: number;
  profile: TrainerProfile;
}

function loadAll(): CachedProfile[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCachedHubProfile(id: string) {
  return loadAll().find((entry) => entry.id === id)?.profile ?? null;
}

export function cacheHubProfile(id: string, profile: TrainerProfile) {
  const current = loadAll().filter((entry) => entry.id !== id);
  current.unshift({
    id,
    storedAt: Date.now(),
    profile: {
      ...profile,
      trainers: profile.trainers.map((entry) => ({ ...entry, enabled: false }))
    }
  });
  localStorage.setItem(CACHE_KEY, JSON.stringify(current.slice(0, MAX_ENTRIES)));
}
