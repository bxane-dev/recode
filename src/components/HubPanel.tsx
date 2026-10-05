import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readProfileFile, writeProfileFile } from "../lib/api";
import { parseCheatEngineTable } from "../lib/cheatEngine";
import { loadHubCatalog, loadRemoteTrainer } from "../lib/hub";
import { loadSupabaseProfile, searchSupabaseHub } from "../lib/hubDb";
import { cacheHubProfile, getCachedHubProfile } from "../lib/hubCache";
import { profileToFile } from "../lib/profiles";
import type {
  HubEntry,
  InstalledGame,
  ProcessInfo,
  TrainerProfile
} from "../types";

interface Props {
  selected: ProcessInfo | null;
  selectedGame: InstalledGame | null;
  autoDownloadCompatible: boolean;
  offlineConfirmed: boolean;
  onInstall: (profile: TrainerProfile, autoApply: boolean) => void;
  onStatus: (message: string) => void;
}

function normalizeProcess(value: string) {
  return value.trim().toLowerCase().replace(/\.(exe|bin)$/i, "");
}

export default function HubPanel({
  selected,
  selectedGame,
  autoDownloadCompatible,
  offlineConfirmed,
  onInstall,
  onStatus
}: Props) {
  const [entries, setEntries] = useState<HubEntry[]>([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedTarget =
    selected?.name ||
    selectedGame?.executable?.split(/[\\/]/).pop() ||
    "";
  const selectedGameName = selectedGame?.name || selectedTarget;

  const matches = useMemo(() => {
    const target = normalizeProcess(selectedTarget);
    const gameTitle = selectedGameName.trim().toLowerCase();

    return entries.filter((entry) => {
      const processMatch =
        Boolean(target) &&
        entry.processNames.some(
          (processName) => normalizeProcess(processName) === target
        );
      const titleMatch =
        Boolean(gameTitle) && entry.game.trim().toLowerCase() === gameTitle;
      return processMatch || titleMatch;
    });
  }, [entries, selectedTarget, selectedGameName]);

  const search = async () => {
    if (!selectedTarget && !selectedGame) {
      onStatus(
        "Select a detected game or running process before searching Recode Hub"
      );
      return;
    }

    setLoading(true);
    try {
      let combined: HubEntry[] = [];

      try {
        combined = await searchSupabaseHub(selectedTarget, selectedGame);
      } catch {
        combined = [];
      }

      const catalog = await loadHubCatalog().catch(() => null);
      if (catalog) {
        const seen = new Set(combined.map((entry) => entry.id));
        combined = [
          ...combined,
          ...catalog.entries.filter((entry) => !seen.has(entry.id))
        ];
      }

      setEntries(combined);

      const target = normalizeProcess(selectedTarget);
      const gameTitle = selectedGameName.trim().toLowerCase();
      const compatible = combined.filter((entry) => {
        const processMatch =
          Boolean(target) &&
          entry.processNames.some(
            (processName) => normalizeProcess(processName) === target
          );
        const titleMatch =
          Boolean(gameTitle) && entry.game.trim().toLowerCase() === gameTitle;
        return processMatch || titleMatch;
      });

      let cached = 0;
      if (autoDownloadCompatible) {
        for (const entry of compatible.slice(0, 12)) {
          if (getCachedHubProfile(entry.id)) continue;
          try {
            const profile = entry.profileUrl.startsWith("supabase://")
              ? await loadSupabaseProfile(entry.id)
              : await loadRemoteTrainer(
                  entry.profileUrl,
                  selectedTarget || entry.processNames[0] || ""
                );
            cacheHubProfile(entry.id, profile);
            cached += 1;
          } catch {
            // Keep search results even when one remote trainer cannot be cached.
          }
        }
      }

      onStatus(
        compatible.length
          ? "Recode Hub found " +
              compatible.length +
              " compatible trainer profile(s)" +
              (cached ? " · cached " + cached + " for 1-click use" : "")
          : "No indexed Recode Hub profile matches this game yet"
      );
    } catch (error) {
      onStatus("Hub search failed: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoDownloadCompatible && (selectedTarget || selectedGame)) {
      void search();
    }
  }, [selectedTarget, selectedGame?.id, autoDownloadCompatible]);

  const searchCheatEngineWeb = async () => {
    if (!selectedGameName) {
      onStatus("Select a game before searching public Cheat Engine pages");
      return;
    }

    const query = encodeURIComponent(
      'site:cheatengine.org "' +
        selectedGameName +
        '" Cheat Engine table CT'
    );

    await openUrl("https://www.google.com/search?q=" + query);
    onStatus("Opened Cheat Engine web results for " + selectedGameName);
  };

  const convertCtToRc = async () => {
    try {
      const path = await open({
        title: "Choose Cheat Engine table to convert",
        multiple: false,
        directory: false,
        filters: [{ name: "Cheat Engine table", extensions: ["ct"] }]
      });
      if (!path || Array.isArray(path)) return;

      const raw = await readProfileFile(path);
      const profile = parseCheatEngineTable(raw, selectedTarget);

      const safeName =
        (selectedGameName || "trainer")
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "trainer";

      const destination = await save({
        title: "Save converted Recode trainer",
        defaultPath: safeName + ".rc",
        filters: [{ name: "Recode trainer", extensions: ["rc"] }]
      });
      if (!destination) return;

      await writeProfileFile(
        destination,
        JSON.stringify(profileToFile(profile), null, 2)
      );

      onInstall(profile, false);
      onStatus("Converted .CT to .rc: " + profile.name);
    } catch (error) {
      onStatus("CT conversion failed: " + String(error));
    }
  };

  const installEntry = async (entry: HubEntry) => {
    if ((!selectedTarget && !selectedGame) || !offlineConfirmed) {
      onStatus(
        "Select the offline game and confirm offline/single-player use first"
      );
      return;
    }

    setLoading(true);
    try {
      let profile = getCachedHubProfile(entry.id);
      if (!profile) {
        profile = entry.profileUrl.startsWith("supabase://")
          ? await loadSupabaseProfile(entry.id)
          : await loadRemoteTrainer(
              entry.profileUrl,
              selectedTarget || entry.processNames[0] || ""
            );
        cacheHubProfile(entry.id, profile);
      }

      onInstall(profile, true);
    } catch (error) {
      onStatus("Hub install failed: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const importUrl = async () => {
    if (!selectedTarget || !offlineConfirmed) {
      onStatus(
        "Select the offline game and confirm offline/single-player use first"
      );
      return;
    }
    if (!remoteUrl.trim()) return;

    setLoading(true);
    try {
      const profile = await loadRemoteTrainer(
        remoteUrl.trim(),
        selectedTarget
      );
      onInstall(profile, true);
      setRemoteUrl("");
    } catch (error) {
      onStatus("Remote import failed: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="hub-card">
      <div className="hub-heading">
        <div>
          <span className="eyebrow">RECODE HUB</span>
          <h2>1-click trainers</h2>
          <p>
            Recode .rc profiles and compatible Cheat Engine table data for the
            selected offline/single-player game.
          </p>
        </div>

        <div className="hub-heading-actions">
          <button onClick={() => void searchCheatEngineWeb()}>
            Cheat Engine Web
          </button>
          <button onClick={() => void convertCtToRc()}>
            Convert .CT → .rc
          </button>
          <button
            className="primary"
            disabled={loading}
            onClick={() => void search()}
          >
            {loading ? "Searching…" : "Search game"}
          </button>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="hub-results">
          {matches.map((entry) => (
            <article className="hub-entry" key={entry.id}>
              <div>
                <strong>{entry.title}</strong>
                <small>
                  {entry.game}
                  {entry.author ? " · " + entry.author : ""}
                  {entry.verified ? " · VERIFIED" : ""}
                </small>
                {entry.description && <p>{entry.description}</p>}
              </div>

              <button
                className="primary"
                disabled={loading}
                onClick={() => void installEntry(entry)}
              >
                1-Click Apply
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="hub-url">
        <input
          className="input"
          placeholder="Direct .rc, .json, or .CT raw GitHub/Gist URL"
          value={remoteUrl}
          onChange={(event) => setRemoteUrl(event.target.value)}
        />
        <button disabled={loading} onClick={() => void importUrl()}>
          Import + Apply
        </button>
      </div>
    </section>
  );
}
