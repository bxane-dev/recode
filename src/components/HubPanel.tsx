import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readProfileFile, writeProfileFile } from "../lib/api";
import { parseCheatEngineTable } from "../lib/cheatEngine";
import { loadHubCatalog, loadRemoteTrainer } from "../lib/hub";
import {
  browseSupabaseHub,
  loadSupabaseProfile,
  searchSupabaseHub,
  trackSupabaseDownload
} from "../lib/hubDb";
import { cacheHubProfile, getCachedHubProfile } from "../lib/hubCache";
import {
  loadHubFavorites,
  loadHubInstalls,
  recordHubInstall,
  saveHubFavorites
} from "../lib/hubState";
import { profileToFile } from "../lib/profiles";
import type {
  HubEntry,
  InstalledGame,
  ProcessInfo,
  TrainerProfile
} from "../types";
import "./HubPanel.css";

interface Props {
  selected: ProcessInfo | null;
  selectedGame: InstalledGame | null;
  autoDownloadCompatible: boolean;
  offlineConfirmed: boolean;
  onInstall: (profile: TrainerProfile, autoApply: boolean) => void;
  onStatus: (message: string) => void;
}

type HubTab = "browse" | "installed" | "updates" | "favorites";
type HubSort = "updated" | "new" | "downloads" | "endorsed" | "title";

const HUB_UI_KEY = "recode.hub.ui.v2";
const RAW_IMPORT_HOSTS = new Set([
  "raw.githubusercontent.com",
  "gist.githubusercontent.com"
]);

function loadHubUi() {
  try {
    return JSON.parse(localStorage.getItem(HUB_UI_KEY) || "{}") as Partial<{
      tab: HubTab;
      query: string;
      category: string;
      sort: HubSort;
      verifiedOnly: boolean;
    }>;
  } catch {
    return {};
  }
}

function validateRemoteImportUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "Remote imports must use HTTPS.";
    if (!RAW_IMPORT_HOSTS.has(url.hostname.toLowerCase())) {
      return "Use a raw GitHub or raw Gist URL for remote imports.";
    }
    return null;
  } catch {
    return "Enter a valid remote trainer URL.";
  }
}

function isNewerVersion(latest: string, installed: string) {
  if (latest === installed) return false;

  const parse = (value: string) => {
    const match = value
      .trim()
      .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i);
    if (!match) return null;
    return {
      parts: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)],
      prerelease: match[4] || ""
    };
  };

  const next = parse(latest);
  const current = parse(installed);
  if (!next || !current) return latest !== installed;

  for (let index = 0; index < 3; index += 1) {
    if (next.parts[index] !== current.parts[index]) {
      return next.parts[index] > current.parts[index];
    }
  }

  if (!next.prerelease && current.prerelease) return true;
  if (next.prerelease && !current.prerelease) return false;
  return next.prerelease.localeCompare(current.prerelease, undefined, {
    numeric: true
  }) > 0;
}

function normalizeProcess(value: string) {
  return value.trim().toLowerCase().replace(/\.(exe|bin)$/i, "");
}

function compactNumber(value = 0) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(value);
}

function dateLabel(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}

function cardInitial(title: string) {
  return title.trim().slice(0, 2).toUpperCase() || "RC";
}

export default function HubPanel({
  selected,
  selectedGame,
  autoDownloadCompatible,
  offlineConfirmed,
  onInstall,
  onStatus
}: Props) {
  const initialUi = useMemo(loadHubUi, []);
  const [entries, setEntries] = useState<HubEntry[]>([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [tab, setTab] = useState<HubTab>(initialUi.tab || "browse");
  const [query, setQuery] = useState(initialUi.query || "");
  const [category, setCategory] = useState(initialUi.category || "All");
  const [sort, setSort] = useState<HubSort>(initialUi.sort || "updated");
  const [verifiedOnly, setVerifiedOnly] = useState(Boolean(initialUi.verifiedOnly));
  const [installs, setInstalls] = useState(() => loadHubInstalls());
  const [favorites, setFavorites] = useState(() => loadHubFavorites());

  const selectedTarget =
    selected?.name ||
    selectedGame?.executable?.split(/[\\/]/).pop() ||
    "";
  const selectedGameName = selectedGame?.name || selectedTarget;

  const isCompatible = (entry: HubEntry) => {
    if (!selectedTarget && !selectedGameName) return true;
    const target = normalizeProcess(selectedTarget);
    const gameTitle = selectedGameName.trim().toLowerCase();
    const processMatch =
      Boolean(target) &&
      entry.processNames.some(
        (processName) => normalizeProcess(processName) === target
      );
    const titleMatch =
      Boolean(gameTitle) && entry.game.trim().toLowerCase() === gameTitle;
    return processMatch || titleMatch;
  };

  const compatibleEntries = useMemo(
    () => entries.filter(isCompatible),
    [entries, selectedTarget, selectedGameName]
  );

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          compatibleEntries
            .map((entry) => entry.category || "Gameplay")
            .filter(Boolean)
        )
      ).sort()
    ],
    [compatibleEntries]
  );

  useEffect(() => {
    if (entries.length && category !== "All" && !categories.includes(category)) {
      setCategory("All");
    }
  }, [entries.length, category, categories]);

  useEffect(() => {
    try {
      localStorage.setItem(
        HUB_UI_KEY,
        JSON.stringify({ tab, query, category, sort, verifiedOnly })
      );
    } catch {
      // Hub preferences are optional.
    }
  }, [tab, query, category, sort, verifiedOnly]);

  const updateIds = useMemo(() => {
    const current = new Map(entries.map((entry) => [entry.id, entry]));
    return new Set(
      installs
        .filter((installed) => {
          const latest = current.get(installed.id);
          return Boolean(
            latest &&
              isNewerVersion(latest.version || "1.0.0", installed.version)
          );
        })
        .map((installed) => installed.id)
    );
  }, [entries, installs]);

  const visibleEntries = useMemo(() => {
    let source: HubEntry[];

    if (tab === "installed") {
      source = installs.map(
        (item) => entries.find((entry) => entry.id === item.id) || item.entry
      );
    } else if (tab === "updates") {
      source = installs
        .filter((item) => updateIds.has(item.id))
        .map((item) => entries.find((entry) => entry.id === item.id) || item.entry);
    } else if (tab === "favorites") {
      source = entries.filter((entry) => favorites.has(entry.id));
    } else {
      source = compatibleEntries;
    }

    const needle = query.trim().toLowerCase();
    source = source.filter((entry) => {
      if (
        category !== "All" &&
        (entry.category || "Gameplay") !== category
      ) {
        return false;
      }
      if (verifiedOnly && !entry.verified) return false;
      if (!needle) return true;
      return [
        entry.title,
        entry.game,
        entry.author || "",
        entry.description || "",
        ...(entry.tags || []),
        ...(entry.frameworks || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return [...source].sort((a, b) => {
      if (sort === "downloads") return (b.downloads || 0) - (a.downloads || 0);
      if (sort === "endorsed") return (b.endorsements || 0) - (a.endorsements || 0);
      if (sort === "new") {
        return Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
      }
      if (sort === "title") return a.title.localeCompare(b.title);
      return Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "");
    });
  }, [
    tab,
    compatibleEntries,
    entries,
    installs,
    updateIds,
    favorites,
    query,
    category,
    verifiedOnly,
    sort
  ]);

  const search = async (automatic = false) => {
    setLoading(true);
    try {
      let combined: HubEntry[] = [];

      try {
        combined =
          selectedTarget || selectedGame
            ? await searchSupabaseHub(selectedTarget, selectedGame)
            : await browseSupabaseHub();
      } catch {
        combined = [];
      }

      const catalog = await loadHubCatalog().catch(() => null);
      if (catalog) {
        const seen = new Set(combined.map((entry) => entry.id));
        combined = [
          ...combined,
          ...catalog.entries
            .filter((entry) => !seen.has(entry.id))
            .map((entry) => ({
              ...entry,
              category: entry.category || "Gameplay",
              version: entry.version || "1.0.0",
              downloads: entry.downloads || 0,
              endorsements: entry.endorsements || 0
            }))
        ];
      }

      setEntries(combined);

      const compatible = combined.filter(isCompatible);
      let cached = 0;
      if (
        autoDownloadCompatible &&
        (selectedTarget || selectedGame) &&
        compatible.length
      ) {
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
            // One broken community item should not break the catalog.
          }
        }
      }

      if (!automatic) {
        onStatus(
          selectedGameName
            ? `Loaded ${compatible.length} Hub item(s) for ${selectedGameName}${
                cached ? ` · cached ${cached}` : ""
              }`
            : `Loaded ${combined.length} published Hub item(s)`
        );
      }
    } catch (error) {
      onStatus("Hub search failed: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void search(true);
  }, []);

  useEffect(() => {
    if (selectedTarget || selectedGame) {
      void search(true);
    }
  }, [selectedTarget, selectedGame?.id]);

  const searchCheatEngineWeb = async () => {
    if (!selectedGameName) {
      onStatus("Select a game before searching public Cheat Engine pages");
      return;
    }
    const query = encodeURIComponent(
      'site:cheatengine.org "' + selectedGameName + '" Cheat Engine table CT'
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

  const installEntry = async (entry: HubEntry, quiet = false) => {
    if ((!selectedTarget && !selectedGame) || !offlineConfirmed) {
      onStatus(
        "Select the offline game and confirm offline/single-player use first"
      );
      return false;
    }

    if (selectedGameName && !isCompatible(entry)) {
      onStatus(`Select ${entry.game} before installing this trainer`);
      return false;
    }

    setBusyEntryId(entry.id);
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
      recordHubInstall(entry);
      setInstalls(loadHubInstalls());

      if (entry.profileUrl.startsWith("supabase://")) {
        void trackSupabaseDownload(entry.id).catch(() => {});
        setEntries((current) =>
          current.map((item) =>
            item.id === entry.id
              ? { ...item, downloads: (item.downloads || 0) + 1 }
              : item
          )
        );
      }

      if (!quiet) {
        onStatus(
          `${updateIds.has(entry.id) ? "Updated" : "Installed"} ${entry.title} v${
            entry.version || "1.0.0"
          }`
        );
      }
      return true;
    } catch (error) {
      onStatus("Hub install failed: " + String(error));
      return false;
    } finally {
      setBusyEntryId(null);
    }
  };

  const updateAll = async () => {
    if ((!selectedTarget && !selectedGame) || !offlineConfirmed) {
      onStatus(
        "Select the offline game and confirm offline/single-player use first"
      );
      return;
    }

    const pending = entries.filter(
      (entry) => updateIds.has(entry.id) && isCompatible(entry)
    );
    if (!pending.length) return;

    setBulkUpdating(true);
    let completed = 0;
    for (const entry of pending) {
      if (await installEntry(entry, true)) completed += 1;
    }
    setBulkUpdating(false);
    onStatus(`Updated ${completed}/${pending.length} Hub trainer(s)`);
  };

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveHubFavorites(next);
      return next;
    });
  };

  const openEntrySource = async (entry: HubEntry) => {
    if (!entry.sourceUrl) return;
    try {
      const url = new URL(entry.sourceUrl);
      if (url.protocol !== "https:") {
        onStatus("Blocked a non-HTTPS community source link");
        return;
      }
      await openUrl(url.toString());
    } catch {
      onStatus("This trainer has an invalid source link");
    }
  };

  const importUrl = async () => {
    if (!selectedTarget || !offlineConfirmed) {
      onStatus(
        "Select the offline game and confirm offline/single-player use first"
      );
      return;
    }
    const url = remoteUrl.trim();
    if (!url) return;

    const validation = validateRemoteImportUrl(url);
    if (validation) {
      onStatus(validation);
      return;
    }

    setLoading(true);
    try {
      const profile = await loadRemoteTrainer(url, selectedTarget);
      onInstall(profile, true);
      setRemoteUrl("");
    } catch (error) {
      onStatus("Remote import failed: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const installedIds = new Set(installs.map((item) => item.id));
  const hasFilters =
    Boolean(query.trim()) || category !== "All" || verifiedOnly || sort !== "updated";
  const actionableUpdates = entries.filter(
    (entry) => updateIds.has(entry.id) && isCompatible(entry)
  );
  const heroTitle = selectedGameName || "Browse Recode Hub";
  const heroSubtitle = selectedGame
    ? `${selectedGame.store} · ${compatibleEntries.length} published item(s)`
    : "Community .rc trainers for offline/single-player games";

  return (
    <section className="hub-market">
      <div className="hub-market-hero">
        <div className="hub-game-mark">{cardInitial(heroTitle)}</div>
        <div className="hub-hero-copy">
          <span className="eyebrow">RECODE HUB</span>
          <h2>{heroTitle}</h2>
          <p>{heroSubtitle}</p>
          <div className="hub-hero-stats">
            <span>{compatibleEntries.length} trainers</span>
            <span>{installs.length} installed</span>
            <span>{updateIds.size} updates</span>
          </div>
        </div>
        <div className="hub-heading-actions">
          <button onClick={() => void searchCheatEngineWeb()}>
            Cheat Engine Web
          </button>
          <button onClick={() => void convertCtToRc()}>Convert .CT → .rc</button>
          <button
            className="primary"
            disabled={loading}
            onClick={() => void search(false)}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="hub-tabs-row">
        <div className="hub-tabs">
          {(["browse", "installed", "updates", "favorites"] as HubTab[]).map(
            (value) => (
              <button
                key={value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {value === "browse"
                  ? "Browse"
                  : value === "installed"
                    ? `Installed (${installs.length})`
                    : value === "updates"
                      ? `Updates (${updateIds.size})`
                      : `Favorites (${favorites.size})`}
              </button>
            )
          )}
        </div>
        {actionableUpdates.length > 0 && (
          <button
            className="primary hub-update-all"
            disabled={bulkUpdating || busyEntryId !== null}
            onClick={() => void updateAll()}
          >
            {bulkUpdating ? "Updating…" : `Update all (${actionableUpdates.length})`}
          </button>
        )}
      </div>

      <div className="hub-toolbar hub-toolbar-v2">
        <div className="hub-search-wrap">
          <input
            className="input"
            placeholder="Search title, author, description, tags, framework…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              className="hub-inline-clear"
              title="Clear search"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </div>
        <select
          className="input"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={sort}
          onChange={(event) => setSort(event.target.value as HubSort)}
        >
          <option value="updated">Recently updated</option>
          <option value="new">Newest</option>
          <option value="downloads">Most downloaded</option>
          <option value="endorsed">Most endorsed</option>
          <option value="title">Title</option>
        </select>
        <label className="hub-verified-filter">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(event) => setVerifiedOnly(event.target.checked)}
          />
          Verified only
        </label>
      </div>

      <div className="hub-results-bar">
        <span>
          {loading && entries.length ? "Refreshing · " : ""}
          {visibleEntries.length} result{visibleEntries.length === 1 ? "" : "s"}
        </span>
        {hasFilters && (
          <button className="ghost" onClick={() => {
            setQuery("");
            setCategory("All");
            setVerifiedOnly(false);
            setSort("updated");
          }}>
            Clear filters
          </button>
        )}
      </div>

      {loading && entries.length === 0 ? (
        <div className="hub-mod-grid">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div className="hub-mod-card hub-skeleton" key={index}>
              <div className="hub-mod-cover" />
              <div className="hub-mod-body">
                <i />
                <i />
                <i />
              </div>
            </div>
          ))}
        </div>
      ) : visibleEntries.length ? (
        <div className="hub-mod-grid">
          {visibleEntries.map((entry) => {
            const installed = installedIds.has(entry.id);
            const hasUpdate = updateIds.has(entry.id);
            return (
              <article
                className={`hub-mod-card ${installed ? "is-installed" : ""}`}
                key={entry.id}
              >
                <div className="hub-mod-cover">
                  <span>{cardInitial(entry.title)}</span>
                  <div className="hub-cover-badges">
                    {entry.featured && <b>FEATURED</b>}
                    {entry.verified && <b>VERIFIED</b>}
                    {hasUpdate && <b>UPDATE</b>}
                    {installed && !hasUpdate && <b>INSTALLED</b>}
                  </div>
                </div>

                <div className="hub-mod-body">
                  <div className="hub-mod-kicker">
                    <span>{entry.category || "Gameplay"}</span>
                    <span>v{entry.version || "1.0.0"}</span>
                  </div>
                  <h3>{entry.title}</h3>
                  <div className="hub-mod-author">
                    {entry.game}
                    {entry.author ? " · by " + entry.author : ""}
                  </div>
                  <p>
                    {entry.description ||
                      "Community Recode trainer profile for this game."}
                  </p>

                  <div className="hub-chip-row">
                    {(entry.frameworks || []).slice(0, 3).map((framework) => (
                      <span className="hub-chip" key={framework}>
                        {framework}
                      </span>
                    ))}
                    {(entry.tags || [])
                      .filter((tag) => tag !== "supabase")
                      .slice(0, 3)
                      .map((tag) => (
                        <span className="hub-chip muted" key={tag}>
                          {tag}
                        </span>
                      ))}
                  </div>

                  <div className="hub-compat-row">
                    {selectedGameName && (
                      <span className={isCompatible(entry) ? "compatible" : "incompatible"}>
                        {isCompatible(entry) ? "✓ Compatible" : "Different game"}
                      </span>
                    )}
                    {entry.gameVersion && <span>Game {entry.gameVersion}</span>}
                  </div>

                  <div className="hub-mod-stats">
                    <span>↓ {compactNumber(entry.downloads)}</span>
                    <span>♥ {compactNumber(entry.endorsements)}</span>
                    <span>{entry.trainerCount || 0} options</span>
                    <span>Updated {dateLabel(entry.updatedAt)}</span>
                  </div>

                  <details className="hub-entry-details">
                    <summary>Details & changelog</summary>
                    <div className="hub-detail-row">
                      <b>Processes</b>
                      <span>{entry.processNames.join(", ") || "Not specified"}</span>
                    </div>
                    <div className="hub-detail-row">
                      <b>Frameworks</b>
                      <span>{(entry.frameworks || []).join(", ") || "None required"}</span>
                    </div>
                    {entry.changelog && <pre>{entry.changelog}</pre>}
                    {entry.sourceUrl && (
                      <button onClick={() => void openEntrySource(entry)}>
                        View source
                      </button>
                    )}
                  </details>

                  <div className="hub-mod-actions">
                    <button
                      className={favorites.has(entry.id) ? "favorite active" : "favorite"}
                      onClick={() => toggleFavorite(entry.id)}
                      title="Favorite"
                    >
                      {favorites.has(entry.id) ? "♥" : "♡"}
                    </button>
                    <button
                      className="primary"
                      disabled={
                        busyEntryId !== null ||
                        bulkUpdating ||
                        Boolean(selectedGameName && !isCompatible(entry))
                      }
                      onClick={() => void installEntry(entry)}
                    >
                      {busyEntryId === entry.id
                        ? "Installing…"
                        : selectedGameName && !isCompatible(entry)
                          ? "Select game"
                          : hasUpdate
                            ? "Update"
                          : installed
                            ? "Reinstall"
                            : "1-Click Install"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="hub-empty hub-empty-v2">
          <strong>
            {tab === "updates"
              ? "Everything is current"
              : tab === "installed"
                ? "No installed Hub trainers"
                : tab === "favorites"
                  ? "No favorite trainers yet"
                  : "No matching trainers"}
          </strong>
          <span>
            {tab === "updates"
              ? "Installed trainers have no newer Hub versions."
              : "Try Browse, clear the filters, or refresh the catalog."}
          </span>
          {hasFilters && (
            <button onClick={() => {
              setQuery("");
              setCategory("All");
              setVerifiedOnly(false);
              setSort("updated");
            }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <details className="hub-tools">
        <summary>Advanced import tools</summary>
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
        <p className="hub-import-note">
          Remote imports are restricted to HTTPS raw GitHub/Gist URLs.
        </p>
      </details>
    </section>
  );
}
