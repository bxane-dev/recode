import { recodeSupabase } from "./supabase";
import type { HubEntry, TrainerProfile } from "../types";
import { parseProfileFile } from "./profiles";

interface DbGame {
  id: string;
  title: string;
  process_names: string[];
}

interface DbProfile {
  id: string;
  title: string;
  description: string;
  author_name: string;
  profile: unknown;
  verified: boolean;
  source: string;
  game_id: string;
}

function normalizeProcess(value: string) {
  return value.trim().toLowerCase().replace(/\.(exe|bin)$/i, "");
}

export async function searchSupabaseHub(processName: string): Promise<HubEntry[]> {
  if (!recodeSupabase) return [];

  const { data: games, error: gameError } = await recodeSupabase
    .from("recode_games")
    .select("id,title,process_names");

  if (gameError) throw gameError;

  const target = normalizeProcess(processName);
  const matched = (games as DbGame[] | null)?.filter((game) =>
    game.process_names.some((name) => normalizeProcess(name) === target)
  ) ?? [];

  if (!matched.length) return [];

  const gameIds = matched.map((game) => game.id);
  const { data: profiles, error: profileError } = await recodeSupabase
    .from("recode_profiles")
    .select("id,title,description,author_name,profile,verified,source,game_id")
    .in("game_id", gameIds)
    .eq("published", true);

  if (profileError) throw profileError;

  const gameById = new Map(matched.map((game) => [game.id, game]));
  return ((profiles as DbProfile[] | null) ?? []).map((profile) => {
    const game = gameById.get(profile.game_id);
    return {
      id: profile.id,
      title: profile.title,
      game: game?.title ?? processName,
      processNames: game?.process_names ?? [processName],
      description: profile.description,
      author: profile.author_name,
      profileUrl: `supabase://recode_profiles/${profile.id}`,
      verified: profile.verified,
      tags: [profile.source, "supabase"]
    };
  });
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
