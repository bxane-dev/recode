import { recodeSupabase } from "./supabase";
import type { HubEntry, InstalledGame, TrainerProfile } from "../types";
import { parseProfileFile, profileToFile } from "./profiles";

interface DbGame {
  id: string;
  title: string;
  process_names: string[];
  steam_app_id: string | null;
  gog_product_id: string | null;
  epic_catalog_id: string | null;
}

interface DbProfile {
  id: string;
  title: string;
  description: string;
  author_name: string;
  profile: unknown;
  verified: boolean;
  published: boolean;
  source: string;
  game_id: string;
  category: string;
  version: string;
  game_version: string | null;
  tags: string[];
  downloads: number | string;
  endorsements: number | string;
  changelog: string;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

const PROFILE_SELECT =
  "id,title,description,author_name,profile,verified,published,source,game_id,category,version,game_version,tags,downloads,endorsements,changelog,featured,created_at,updated_at";

function normalizeProcess(value: string) {
  return value.trim().toLowerCase().replace(/\.(exe|bin)$/i, "");
}

function inspectProfile(raw: unknown) {
  const envelope = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  const profile =
    envelope?.profile && typeof envelope.profile === "object"
      ? envelope.profile as Record<string, unknown>
      : null;
  const trainers = Array.isArray(profile?.trainers) ? profile!.trainers : [];
  const frameworks = Array.isArray(profile?.frameworks)
    ? profile!.frameworks
        .map((item) =>
          item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string"
            ? String((item as Record<string, unknown>).id)
            : ""
        )
        .filter(Boolean)
    : [];
  return { trainerCount: trainers.length, frameworks };
}

function mapProfile(
  profile: DbProfile,
  game: DbGame | undefined,
  fallbackProcess = ""
): HubEntry {
  const inspected = inspectProfile(profile.profile);
  return {
    id: profile.id,
    title: profile.title,
    game: game?.title ?? fallbackProcess || "Unknown game",
    processNames: game?.process_names ?? (fallbackProcess ? [fallbackProcess] : []),
    description: profile.description,
    author: profile.author_name,
    profileUrl: `supabase://recode_profiles/${profile.id}`,
    verified: profile.verified,
    featured: profile.featured,
    category: profile.category || "Gameplay",
    version: profile.version || "1.0.0",
    gameVersion: profile.game_version || undefined,
    downloads: Number(profile.downloads || 0),
    endorsements: Number(profile.endorsements || 0),
    trainerCount: inspected.trainerCount,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    changelog: profile.changelog,
    tags: [...new Set([profile.source, "supabase", ...(profile.tags || [])])],
    frameworks: inspected.frameworks
  };
}

async function loadGames(): Promise<DbGame[]> {
  if (!recodeSupabase) return [];
  const { data, error } = await recodeSupabase
    .from("recode_games")
    .select("id,title,process_names,steam_app_id,gog_product_id,epic_catalog_id");
  if (error) throw error;
  return (data as DbGame[] | null) ?? [];
}

export async function browseSupabaseHub(): Promise<HubEntry[]> {
  if (!recodeSupabase) return [];
  const games = await loadGames();
  const gameById = new Map(games.map((game) => [game.id, game]));

  const { data, error } = await recodeSupabase
    .from("recode_profiles")
    .select(PROFILE_SELECT)
    .eq("published", true)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (error) throw error;
  return ((data as DbProfile[] | null) ?? []).map((profile) =>
    mapProfile(profile, gameById.get(profile.game_id))
  );
}

export async function searchSupabaseHub(
  processName: string,
  installedGame?: InstalledGame | null
): Promise<HubEntry[]> {
  if (!recodeSupabase) return [];

  const games = await loadGames();
  const target = normalizeProcess(processName);
  const storeId = installedGame?.id.split(":").slice(1).join(":") ?? "";
  const store = installedGame?.store.toLowerCase() ?? "";
  const title = installedGame?.name.trim().toLowerCase() ?? "";

  const matched = games.filter((game) => {
    const processMatch =
      Boolean(target) &&
      game.process_names.some((name) => normalizeProcess(name) === target);
    const titleMatch =
      Boolean(title) && game.title.trim().toLowerCase() === title;
    const storeMatch =
      Boolean(storeId) &&
      ((store.includes("steam") && game.steam_app_id === storeId) ||
        (store.includes("gog") && game.gog_product_id === storeId) ||
        (store.includes("epic") && game.epic_catalog_id === storeId));

    return processMatch || titleMatch || storeMatch;
  });

  if (!matched.length) return [];

  const gameIds = matched.map((game) => game.id);
  const gameById = new Map(matched.map((game) => [game.id, game]));
  const { data, error } = await recodeSupabase
    .from("recode_profiles")
    .select(PROFILE_SELECT)
    .in("game_id", gameIds)
    .eq("published", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data as DbProfile[] | null) ?? []).map((profile) =>
    mapProfile(profile, gameById.get(profile.game_id), processName)
  );
}

export async function loadSupabaseProfile(profileId: string): Promise<TrainerProfile> {
  if (!recodeSupabase) {
    throw new Error("Recode Hub database is not configured");
  }

  const { data, error } = await recodeSupabase
    .from("recode_profiles")
    .select("profile")
    .eq("id", profileId)
    .eq("published", true)
    .single();

  if (error) throw error;
  return parseProfileFile(JSON.stringify(data.profile));
}

export async function trackSupabaseDownload(profileId: string) {
  if (!recodeSupabase) return;
  const { error } = await recodeSupabase.functions.invoke(
    "track-recode-download",
    { body: { profileId } }
  );
  if (error) throw error;
}

export interface CommunitySubmissionInput {
  gameName: string;
  processName: string;
  requestedFeature?: string;
  aiProvider?: string;
  authorName?: string;
  profile: TrainerProfile;
  publishConsent: boolean;
}

export async function submitCommunityProfile(input: CommunitySubmissionInput) {
  if (!input.publishConsent) {
    throw new Error("Explicit publication consent is required");
  }
  if (!recodeSupabase) {
    throw new Error("Recode Hub database is not configured");
  }

  const { data, error } = await recodeSupabase.functions.invoke(
    "submit-recode-trainer",
    {
      body: {
        gameName: input.gameName,
        processName: input.processName,
        requestedFeature: input.requestedFeature ?? "",
        aiProvider: input.aiProvider ?? "",
        authorName: input.authorName ?? "community",
        profile: profileToFile(input.profile),
        publishConsent: true
      }
    }
  );

  if (error) throw error;
  if (!data?.ok || typeof data.profileId !== "string") {
    throw new Error(data?.error || "Hub publication failed");
  }

  return data as {
    ok: true;
    profileId: string;
    submissionId: string;
    trainerCount: number;
    verified: boolean;
  };
}
