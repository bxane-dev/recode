import { useEffect, useMemo, useState } from "react";
import { scanInstalledGames } from "../lib/api";
import type { InstalledGame, ProcessInfo, RecodeSettings } from "../types";

interface Props {
  processes: ProcessInfo[];
  selectedProcess: ProcessInfo | null;
  selectedGame: InstalledGame | null;
  settings: RecodeSettings;
  onSettings: (settings: RecodeSettings) => void;
  onSelectProcess: (process: ProcessInfo) => void;
  onSelectGame: (game: InstalledGame) => void;
  onStatus: (message: string) => void;
}

function normalizePath(value: string) {
  return value.replace(/\\\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function findRunningProcess(game: InstalledGame, processes: ProcessInfo[]) {
  const root = normalizePath(game.installPath);
  const executable = game.executable ? normalizePath(game.executable).split("/").pop() : null;
  return processes.find((process) => {
    const path = process.path ? normalizePath(process.path) : "";
    if (path && (path === root || path.startsWith(root + "/"))) return true;
    if (executable && process.name.toLowerCase() === executable) return true;
    return false;
  });
}

export default function StoreLibraryPanel(props: Props) {
  const { processes, selectedProcess, selectedGame, settings, onSettings, onSelectProcess, onSelectGame, onStatus } = props;
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return games;
    return games.filter((game) => game.name.toLowerCase().includes(needle) || game.store.toLowerCase().includes(needle));
  }, [games, query]);

  const scan = async (automatic = false) => {
    setLoading(true);
    try {
      const result = await scanInstalledGames();
      setGames(result);
      const running = result.map((game) => ({ game, process: findRunningProcess(game, processes) })).find((item) => item.process);
      if (automatic && running?.process) {
        onSelectGame(running.game);
        if (selectedProcess?.pid !== running.process.pid) onSelectProcess(running.process);
      }
      if (!automatic) onStatus("Detected " + result.length + " installed Steam/GOG/Epic games");
    } catch (error) {
      onStatus("Game library scan failed: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (settings.autoDetectStores) void scan(true);
  }, []);

  useEffect(() => {
    if (!settings.autoDetectStores || !games.length) return;
    const running = games.map((game) => ({ game, process: findRunningProcess(game, processes) })).find((item) => item.process);
    if (running?.process && selectedProcess?.pid !== running.process.pid) {
      onSelectGame(running.game);
      onSelectProcess(running.process);
    }
  }, [processes]);

  const choose = (game: InstalledGame) => {
    onSelectGame(game);
    const running = findRunningProcess(game, processes);
    if (running) {
      onSelectProcess(running);
      onStatus(game.name + " is running as " + running.name);
    } else {
      onStatus(game.name + " detected from " + game.store + ". Start it to apply trainer values.");
    }
  };

  const setOption = (key: keyof RecodeSettings, value: boolean) => onSettings({ ...settings, [key]: value });

  return (
    <section className="library-card">
      <div className="library-heading">
        <div><span className="eyebrow">GAME LIBRARIES</span><h2>Steam · GOG · Epic</h2></div>
        <button disabled={loading} onClick={() => void scan(false)}>{loading ? "Scanning…" : "Rescan"}</button>
      </div>
      <div className="library-settings">
        <label><input type="checkbox" checked={settings.autoDetectStores} onChange={(event) => setOption("autoDetectStores", event.target.checked)} />Auto-detect libraries</label>
        <label><input type="checkbox" checked={settings.autoDownloadCompatible} onChange={(event) => setOption("autoDownloadCompatible", event.target.checked)} />Auto-download compatible profiles</label>
        <label><input type="checkbox" checked={settings.rememberCheatSelection} onChange={(event) => setOption("rememberCheatSelection", event.target.checked)} />Remember selected trainer toggles</label>
      </div>
      <input className="input" placeholder="Filter installed games" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="library-list">
        {visible.slice(0, 40).map((game) => {
          const running = findRunningProcess(game, processes);
          return (
            <button key={game.id} className={selectedGame?.id === game.id ? "library-game selected" : "library-game"} onClick={() => choose(game)}>
              <span><strong>{game.name}</strong><small>{game.store}</small></span>
              <span className={running ? "running-dot online" : "running-dot"} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
