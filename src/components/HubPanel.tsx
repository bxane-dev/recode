import { useEffect, useMemo, useState } from "react";
import { loadHubCatalog, loadRemoteTrainer } from "../lib/hub";
import type { HubEntry, InstalledGame, ProcessInfo, TrainerProfile } from "../types";

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
    selectedGame?.executable?.split(/[\\\\/]/).pop() ||
    "";

  const matches = useMemo(() => {
    if (!selectedTarget) return [];
    const target = normalizeProcess(selectedTarget);
    return entries.filter((entry) =>
      entry.processNames.some(
        (processName) => normalizeProcess(processName) === target
      )
    );
  }, [entries, selectedTarget]);

  const search = async () => {
    if (!selectedTarget) {
      onStatus("Select a detected game or running process before searching Recode Hub");
      return;
    }
    setLoading(true);
    try {
      const catalog = await loadHubCatalog();
      setEntries(catalog.entries);
      const count = catalog.entries.filter((entry) =>
        entry.processNames.some(
          (processName) =>
            normalizeProcess(processName) === normalizeProcess(selectedTarget)
        )
      ).length;
      onStatus(
        count
          ? `Recode Hub found ${count} compatible trainer profile(s)`
          : "No indexed Recode Hub profile matches this game yet"
      );
    } catch (error) {
      onStatus(`Hub search failed: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoDownloadCompatible && selectedTarget) {
      void search();
    }
  }, [selectedTarget, autoDownloadCompatible]);

  const installEntry = async (entry: HubEntry) => {
    if (!selectedTarget || !offlineConfirmed) {
      onStatus("Select the offline game and confirm offline/single-player use first");
      return;
    }
    setLoading(true);
    try {
      const profile = await loadRemoteTrainer(entry.profileUrl, selectedTarget);
      onInstall(profile, true);
    } catch (error) {
      onStatus(`Hub install failed: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const importUrl = async () => {
    if (!selectedTarget || !offlineConfirmed) {
      onStatus("Select the offline game and confirm offline/single-player use first");
      return;
    }
    if (!remoteUrl.trim()) return;

    setLoading(true);
    try {
      const profile = await loadRemoteTrainer(remoteUrl.trim(), selectedTarget);
      onInstall(profile, true);
      setRemoteUrl("");
    } catch (error) {
      onStatus(`Remote import failed: ${String(error)}`);
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
            Data-only Recode profiles and compatible Cheat Engine tables for
            offline/single-player games.
          </p>
        </div>
        <button className="primary" disabled={loading} onClick={() => void search()}>
          {loading ? "Searching…" : "Search game"}
        </button>
      </div>

      {matches.length > 0 && (
        <div className="hub-results">
          {matches.map((entry) => (
            <article className="hub-entry" key={entry.id}>
              <div>
                <strong>{entry.title}</strong>
                <small>
                  {entry.game}
                  {entry.author ? ` · ${entry.author}` : ""}
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
          placeholder="Direct .recode.json or .CT raw GitHub/Gist URL"
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
