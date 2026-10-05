import type {
  TrainerEntry,
  TrainerProfile,
  TrainerProfileFile,
  ValueType
} from "../types";

const PROFILE_KEY = "recode.profiles.v1";
const ACTIVE_PROFILE_KEY = "recode.active-profile.v1";
const LEGACY_KEYS = [
  "recode.trainers.v3",
  "recode.trainers.v2",
  "recode.trainers.v1"
];

const VALUE_TYPES = new Set<ValueType>(["i32", "u32", "i64", "u64", "f32", "f64"]);

const now = () => new Date().toISOString();

export function makeProfile(name: string, processName = ""): TrainerProfile {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled profile",
    processName,
    trainers: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    formatVersion: 1
  };
}

export function loadProfiles(): TrainerProfile[] {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeProfile);
      }
    }
  } catch {
    // fall through to legacy migration
  }

  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const trainers = JSON.parse(raw);
      if (!Array.isArray(trainers)) continue;

      const profile = makeProfile("Default");
      profile.trainers = trainers
        .map(normalizeTrainer)
        .filter((entry): entry is TrainerEntry => Boolean(entry));
      profile.processName = profile.trainers[0]?.processName ?? "";
      return [profile];
    } catch {
      // try the next legacy key
    }
  }

  return [makeProfile("Default")];
}

export function saveProfiles(profiles: TrainerProfile[]) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

export function loadActiveProfileId(profiles: TrainerProfile[]) {
  const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
  return profiles.some((profile) => profile.id === stored)
    ? stored!
    : profiles[0]?.id ?? "";
}

export function saveActiveProfileId(id: string) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

export function profileToFile(profile: TrainerProfile): TrainerProfileFile {
  return {
    schema: "recode.trainer-profile",
    version: 1,
    profile: {
      ...profile,
      updatedAt: now()
    }
  };
}

export function parseProfileFile(raw: string): TrainerProfile {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid Recode profile");
  }

  const envelope = parsed as Partial<TrainerProfileFile>;
  const source =
    envelope.schema === "recode.trainer-profile" && envelope.version === 1
      ? envelope.profile
      : parsed;

  const normalized = normalizeProfile(source);
  return {
    ...normalized,
    id: crypto.randomUUID(),
    name: normalized.name.endsWith(" (imported)")
      ? normalized.name
      : `${normalized.name} (imported)`,
    trainers: normalized.trainers.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
      enabled: false
    })),
    createdAt: now(),
    updatedAt: now()
  };
}

function normalizeProfile(input: unknown): TrainerProfile {
  if (!input || typeof input !== "object") {
    throw new Error("Profile data is not an object");
  }

  const value = input as Partial<TrainerProfile>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) throw new Error("Profile has no name");

  const trainers = Array.isArray(value.trainers)
    ? value.trainers
        .map(normalizeTrainer)
        .filter((entry): entry is TrainerEntry => Boolean(entry))
    : [];

  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    name,
    processName: typeof value.processName === "string" ? value.processName : "",
    trainers,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now(),
    formatVersion: 1
  };
}

function normalizeTrainer(input: unknown): TrainerEntry | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<TrainerEntry>;

  if (
    typeof value.label !== "string" ||
    typeof value.processName !== "string" ||
    typeof value.address !== "string" ||
    typeof value.value !== "string" ||
    !VALUE_TYPES.has(value.valueType as ValueType)
  ) {
    return null;
  }

  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    label: value.label,
    pid: typeof value.pid === "number" ? value.pid : 0,
    processName: value.processName,
    address: value.address,
    valueType: value.valueType as ValueType,
    value: value.value,
    enabled: Boolean(value.enabled),
    hotkey: typeof value.hotkey === "string" ? value.hotkey : undefined,
    pointerChain: value.pointerChain,
    signature: value.signature
  };
}
