import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import HubPanel from "./components/HubPanel";
import AiBuilderPanel from "./components/AiBuilderPanel";
import StoreLibraryPanel from "./components/StoreLibraryPanel";
import FrameworkPanel from "./components/FrameworkPanel";
import { parseCheatEngineTable } from "./lib/cheatEngine";
import { loadSettings, saveSettings } from "./lib/settings";
import {
  register,
  unregisterAll
} from "@tauri-apps/plugin-global-shortcut";
import {
  clearScan,
  detectModFrameworks,
  findSignature,
  listModules,
  listProcesses,
  readProfileFile,
  rescan,
  resolvePointerChain,
  startScan,
  writeProfileFile,
  writeValue
} from "./lib/api";
import {
  loadActiveProfileId,
  loadProfiles,
  makeProfile,
  parseProfileFile,
  profileToFile,
  saveActiveProfileId,
  saveProfiles
} from "./lib/profiles";
import type {
  DetectedFramework,
  InstalledGame,
  ProcessInfo,
  ProcessModule,
  RecodeSettings,
  ScanSummary,
  TrainerEntry,
  TrainerProfile,
  ValueType
} from "./types";

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit++;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function parseHex(value: string) {
  return BigInt(value);
}

function normalizeHotkey(raw: string) {
  const aliases: Record<string, string> = {
    ctrl: "Control",
    control: "Control",
    alt: "Alt",
    shift: "Shift",
    super: "Super",
    meta: "Super",
    cmdorctrl: "CommandOrControl",
    commandorcontrol: "CommandOrControl"
  };

  return raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index, all) => {
      if (index === all.length - 1) {
        if (/^f\d{1,2}$/i.test(part)) return part.toUpperCase();
        if (part.length === 1) return part.toUpperCase();
      }
      return aliases[part.toLowerCase()] ?? part;
    })
    .join("+");
}

function hotkeyLooksValid(value: string) {
  if (/^F(?:[1-9]|1\d|2[0-4])$/i.test(value)) return true;
  const parts = value.split("+");
  return parts.length >= 2 && parts.every(Boolean);
}

export default function App() {
  const initialProfiles = useMemo(() => loadProfiles(), []);
  const [profiles, setProfiles] = useState<TrainerProfile[]>(initialProfiles);
  const [activeProfileId, setActiveProfileId] = useState(() =>
    loadActiveProfileId(initialProfiles)
  );
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [modules, setModules] = useState<ProcessModule[]>([]);
  const [processFilter, setProcessFilter] = useState("");
  const [selected, setSelected] = useState<ProcessInfo | null>(null);
  const [selectedGame, setSelectedGame] = useState<InstalledGame | null>(null);
  const [detectedFrameworks, setDetectedFrameworks] = useState<DetectedFramework[]>([]);
  const [frameworksLoading, setFrameworksLoading] = useState(false);
  const [settings, setSettings] = useState<RecodeSettings>(() => loadSettings());
  const [offlineConfirmed, setOfflineConfirmed] = useState(false);
  const [valueType, setValueType] = useState<ValueType>("i32");
  const [scanValue, setScanValue] = useState("100");
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [status, setStatus] = useState("Ready");

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const trainers = activeProfile?.trainers ?? [];

  const updateProfile = (
    profileId: string,
    updater: (profile: TrainerProfile) => TrainerProfile
  ) => {
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === profileId
          ? { ...updater(profile), updatedAt: new Date().toISOString() }
          : profile
      )
    );
  };

  const setTrainers = (
    updater: TrainerEntry[] | ((current: TrainerEntry[]) => TrainerEntry[])
  ) => {
    if (!activeProfile) return;
    updateProfile(activeProfile.id, (profile) => ({
      ...profile,
      trainers:
        typeof updater === "function" ? updater(profile.trainers) : updater
    }));
  };

  const checkForUpdates = async (manual = false) => {
    if (checkingUpdate) return;

    setCheckingUpdate(true);
    if (manual) setStatus("Checking for updates…");

    try {
      const update = await check();

      if (!update) {
        if (manual) setStatus("Recode is up to date");
        return;
      }

      setStatus(`Recode ${update.version} is available`);

      const install = window.confirm(
        `Recode ${update.version} is available. Download and install it now?`
      );

      if (!install) {
        await update.close();
        setStatus(`Update ${update.version} is available`);
        return;
      }

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setStatus(`Downloading Recode ${update.version}…`);
        } else if (event.event === "Finished") {
          setStatus("Installing update…");
        }
      });

      setStatus("Update installed. Restarting…");
      await relaunch();
    } catch (error) {
      if (manual) {
        setStatus(`Update check failed: ${String(error)}`);
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const refresh = async () => {
    try {
      setStatus("Reading processes…");
      const result = await listProcesses();
      setProcesses(result);
      setStatus(`${result.length} processes detected`);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const refreshFrameworks = async () => {
    if (!selectedGame) {
      setDetectedFrameworks([]);
      return;
    }

    setFrameworksLoading(true);
    try {
      const result = await detectModFrameworks(
        selectedGame.installPath,
        selected?.path ?? selectedGame.executable
      );
      setDetectedFrameworks(result);
    } catch (error) {
      setStatus("Framework detection failed: " + String(error));
    } finally {
      setFrameworksLoading(false);
    }
  };

  const refreshModules = async (process: ProcessInfo) => {
    if (!offlineConfirmed) {
      setModules([]);
      return;
    }

    try {
      const result = await listModules(process.pid, true);
      setModules(result);
    } catch {
      setModules([]);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkForUpdates(false);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void listProcesses().then(setProcesses).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const persisted = settings.rememberCheatSelection
      ? profiles
      : profiles.map((profile) => ({
          ...profile,
          trainers: profile.trainers.map((entry) => ({ ...entry, enabled: false }))
        }));
    saveProfiles(persisted);
  }, [profiles, settings.rememberCheatSelection]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (activeProfileId) saveActiveProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    if (!activeProfile) return;
    const match = processes.find(
      (process) =>
        process.name.toLowerCase() === activeProfile.processName.toLowerCase()
    );
    if (match && selected?.pid !== match.pid) {
      setSelected(match);
    }
  }, [activeProfileId, processes]);

  useEffect(() => {
    if (selected && offlineConfirmed) {
      void refreshModules(selected);
    } else {
      setModules([]);
    }
  }, [selected?.pid, offlineConfirmed]);

  useEffect(() => {
    void refreshFrameworks();
  }, [selectedGame?.id, selected?.path]);

  const hotkeyDefinition = useMemo(
    () =>
      trainers
        .filter((entry) => entry.hotkey)
        .map((entry) => `${entry.id}:${entry.hotkey}`)
        .sort()
        .join("|"),
    [trainers]
  );

  useEffect(() => {
    let active = true;

    const configure = async () => {
      try {
        await unregisterAll();
        const hotkeys = [
          ...new Set(
            trainers
              .map((entry) => entry.hotkey)
              .filter((value): value is string => Boolean(value))
          )
        ];

        if (!hotkeys.length) return;

        await register(hotkeys, (event) => {
          if (!active || event.state !== "Pressed") return;
          const triggered = event.shortcut.toLowerCase();

          setTrainers((current) =>
            current.map((entry) =>
              entry.hotkey?.toLowerCase() === triggered
                ? { ...entry, enabled: !entry.enabled }
                : entry
            )
          );
        });
      } catch (error) {
        if (active) setStatus(`Hotkey registration failed: ${String(error)}`);
      }
    };

    void configure();
    return () => {
      active = false;
      void unregisterAll();
    };
  }, [activeProfileId, hotkeyDefinition]);

  useEffect(() => {
    const enabled = trainers.filter((entry) => entry.enabled);
    if (!enabled.length || !offlineConfirmed) return;

    let cancelled = false;
    let running = false;

    const applyEnabled = async () => {
      if (running) return;
      running = true;

      try {
        for (const entry of enabled) {
          if (cancelled) break;

          const liveProcess = processes.find(
            (process) =>
              process.name.toLowerCase() === entry.processName.toLowerCase()
          );

          if (!liveProcess) continue;

          try {
            let address = entry.address;

            if (entry.signature) {
              const resolved = await findSignature(
                liveProcess.pid,
                entry.signature.moduleName,
                entry.signature.pattern,
                entry.signature.matchOffset,
                entry.signature.occurrence,
                true
              );
              address = resolved.address;
            } else if (entry.pointerChain) {
              const resolved = await resolvePointerChain(
                liveProcess.pid,
                entry.pointerChain.moduleName,
                entry.pointerChain.baseOffset,
                entry.pointerChain.offsets,
                true
              );
              address = resolved.address;
            }

            await writeValue(
              liveProcess.pid,
              address,
              entry.value,
              entry.valueType,
              true
            );
          } catch {
            setTrainers((current) =>
              current.map((item) =>
                item.id === entry.id ? { ...item, enabled: false } : item
              )
            );
          }
        }
      } finally {
        running = false;
      }
    };

    void applyEnabled();
    const timer = window.setInterval(() => void applyEnabled(), 650);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [trainers, offlineConfirmed, processes]);

  const filteredProcesses = useMemo(() => {
    const needle = processFilter.trim().toLowerCase();
    if (!needle) return processes;
    return processes.filter(
      (process) =>
        process.name.toLowerCase().includes(needle) ||
        String(process.pid).includes(needle) ||
        process.path?.toLowerCase().includes(needle)
    );
  }, [processes, processFilter]);

  const attach = (process: ProcessInfo) => {
    setSelected(process);
    if (activeProfile && !activeProfile.processName) {
      updateProfile(activeProfile.id, (profile) => ({
        ...profile,
        processName: process.name
      }));
    }
    if (scan) void clearScan(scan.session_id).catch(() => {});
    setScan(null);
    setStatus(`Attached selection: ${process.name} (PID ${process.pid})`);
  };

  const createProfile = () => {
    const name = window.prompt("Profile name", selected?.name ?? "New profile")?.trim();
    if (!name) return;

    const profile = makeProfile(name, selected?.name ?? "");
    setProfiles((current) => [...current, profile]);
    setActiveProfileId(profile.id);
    setStatus(`Created profile: ${profile.name}`);
  };

  const renameProfile = () => {
    if (!activeProfile) return;
    const name = window.prompt("Rename profile", activeProfile.name)?.trim();
    if (!name) return;
    updateProfile(activeProfile.id, (profile) => ({ ...profile, name }));
  };

  const deleteProfile = () => {
    if (!activeProfile) return;
    if (profiles.length === 1) {
      setStatus("Keep at least one profile");
      return;
    }

    const ok = window.confirm(
      `Delete profile "${activeProfile.name}" and its ${activeProfile.trainers.length} trainer entries?`
    );
    if (!ok) return;

    const remaining = profiles.filter((profile) => profile.id !== activeProfile.id);
    setProfiles(remaining);
    setActiveProfileId(remaining[0]?.id ?? "");
  };

  const exportProfile = async () => {
    if (!activeProfile) return;

    try {
      const safeName = activeProfile.name
        .replace(/[^a-z0-9-_]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "profile";

      const path = await save({
        title: "Export Recode profile",
        defaultPath: `${safeName}.rc`,
        filters: [{ name: "Recode profile", extensions: ["rc"] }]
      });
      if (!path) return;

      await writeProfileFile(
        path,
        JSON.stringify(profileToFile(activeProfile), null, 2)
      );
      setStatus(`Exported ${activeProfile.name}`);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const importProfile = async () => {
    try {
      const path = await open({
        title: "Import trainer profile",
        multiple: false,
        directory: false,
        filters: [
          { name: "Recode / Cheat Engine", extensions: ["rc", "json", "ct"] }
        ]
      });
      if (!path || Array.isArray(path)) return;

      const raw = await readProfileFile(path);
      const imported = path.toLowerCase().endsWith(".ct")
        ? parseCheatEngineTable(
            raw,
            selected?.name ?? activeProfile?.processName ?? ""
          )
        : parseProfileFile(raw);
      setProfiles((current) => [...current, imported]);
      setActiveProfileId(imported.id);
      setStatus(
        `Imported ${imported.name} with ${imported.trainers.length} trainer entries`
      );
    } catch (error) {
      setStatus(`Import failed: ${String(error)}`);
    }
  };

  const installHubProfile = (
    profile: TrainerProfile,
    autoApply: boolean
  ) => {
    const targetProcess =
      selected?.name ||
      selectedGame?.executable?.split(/[\\\\/]/).pop() ||
      profile.processName ||
      profile.trainers[0]?.processName ||
      "";

    if (!targetProcess) {
      setStatus("Select a detected game or running process first");
      return;
    }

    const target = targetProcess.toLowerCase();
    const profileTarget = profile.processName.toLowerCase();
    if (profileTarget && profileTarget !== target) {
      setStatus(
        `Trainer targets ${profile.processName}, not ${targetProcess}`
      );
      return;
    }

    const missingFrameworks =
      profile.frameworks?.filter(
        (requirement) =>
          requirement.required !== false &&
          !detectedFrameworks.some(
            (framework) =>
              framework.detected &&
              framework.id.toLowerCase() === requirement.id.toLowerCase()
          )
      ) ?? [];
    const canAutoApply =
      autoApply && offlineConfirmed && missingFrameworks.length === 0;

    const installed: TrainerProfile = {
      ...profile,
      id: crypto.randomUUID(),
      name: profile.name.includes("(Hub)")
        ? profile.name
        : `${profile.name} (Hub)`,
      processName: targetProcess,
      trainers: profile.trainers.map((entry) => ({
        ...entry,
        id: crypto.randomUUID(),
        pid: selected?.pid ?? 0,
        processName: targetProcess,
        enabled: Boolean(canAutoApply)
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setProfiles((current) => [...current, installed]);
    setActiveProfileId(installed.id);
    setStatus(
      missingFrameworks.length
        ? "Installed " +
            installed.name +
            " but kept cheats disabled; missing framework(s): " +
            missingFrameworks.map((item) => item.name || item.id).join(", ")
        : autoApply
          ? `Applied ${installed.trainers.length} trainer entries from ${installed.name}`
          : `Installed ${installed.name}`
    );
  };

  const configureHotkey = (entry: TrainerEntry) => {
    const raw = window
      .prompt(
        "Global hotkey. Examples: F6, Control+Shift+H, Alt+F8. Leave blank to remove.",
        entry.hotkey ?? "F6"
      );
    if (raw === null) return;

    const hotkey = normalizeHotkey(raw.trim());
    if (!hotkey) {
      setTrainers((current) =>
        current.map((item) =>
          item.id === entry.id ? { ...item, hotkey: undefined } : item
        )
      );
      return;
    }

    if (!hotkeyLooksValid(hotkey)) {
      setStatus("Hotkey format is invalid");
      return;
    }

    const duplicate = trainers.find(
      (item) =>
        item.id !== entry.id &&
        item.hotkey?.toLowerCase() === hotkey.toLowerCase()
    );
    if (duplicate) {
      setStatus(`${hotkey} is already assigned to ${duplicate.label}`);
      return;
    }

    setTrainers((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, hotkey } : item
      )
    );
    setStatus(`${entry.label} hotkey → ${hotkey}`);
  };

  const doFirstScan = async () => {
    if (!selected) {
      setStatus("Choose a process first");
      return;
    }
    if (!offlineConfirmed) {
      setStatus("Confirm offline/single-player use first");
      return;
    }

    setBusy(true);
    try {
      if (scan) await clearScan(scan.session_id).catch(() => {});
      const result = await startScan(
        selected.pid,
        scanValue,
        valueType,
        offlineConfirmed
      );
      setScan(result);
      setStatus(
        `Found ${result.total_matches.toLocaleString()} matches after scanning ${formatBytes(
          result.scanned_bytes
        )}`
      );
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const doRescan = async () => {
    if (!scan) return;
    setBusy(true);
    try {
      const result = await rescan(scan.session_id, scanValue);
      setScan(result);
      setStatus(`Narrowed to ${result.total_matches.toLocaleString()} matches`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const editAddress = async (address: string) => {
    if (!selected) return;
    try {
      await writeValue(
        selected.pid,
        address,
        scanValue,
        valueType,
        offlineConfirmed
      );
      setStatus(`Wrote ${scanValue} to ${address}`);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const saveTrainer = (address: string) => {
    if (!selected || !activeProfile) return;
    const label = window.prompt("Trainer name", "New cheat")?.trim();
    if (!label) return;

    const entry: TrainerEntry = {
      id: crypto.randomUUID(),
      label,
      pid: selected.pid,
      processName: selected.name,
      address,
      valueType,
      value: scanValue,
      enabled: false
    };
    setTrainers((current) => [entry, ...current]);

    if (!activeProfile.processName) {
      updateProfile(activeProfile.id, (profile) => ({
        ...profile,
        processName: selected.name
      }));
    }
  };

  const updateTrainer = (id: string, patch: Partial<TrainerEntry>) => {
    setTrainers((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  const liveProcessFor = (entry: TrainerEntry) =>
    processes.find(
      (process) =>
        process.name.toLowerCase() === entry.processName.toLowerCase()
    ) ?? selected;

  const availableModulesFor = async (process: ProcessInfo) => {
    if (selected?.pid === process.pid && modules.length) return modules;
    return listModules(process.pid, offlineConfirmed);
  };

  const stabilizeTrainer = async (entry: TrainerEntry) => {
    const liveProcess = liveProcessFor(entry);
    if (!liveProcess) {
      setStatus("Start the game and select its process before stabilizing");
      return;
    }

    let availableModules: ProcessModule[];
    try {
      availableModules = await availableModulesFor(liveProcess);
    } catch (error) {
      setStatus(String(error));
      return;
    }

    const target = parseHex(entry.address);
    const containing = availableModules.find((module) => {
      const base = parseHex(module.base_address);
      return target >= base && target < base + BigInt(module.size);
    });

    if (containing) {
      const offset = target - parseHex(containing.base_address);
      updateTrainer(entry.id, {
        pid: liveProcess.pid,
        signature: undefined,
        pointerChain: {
          moduleName: containing.name,
          baseOffset: `0x${offset.toString(16).toUpperCase()}`,
          offsets: []
        }
      });
      setStatus(
        `${entry.label} is now module-relative: ${containing.name}+0x${offset
          .toString(16)
          .toUpperCase()}`
      );
      return;
    }

    const defaultModule =
      availableModules.find(
        (module) =>
          module.name.toLowerCase() === liveProcess.name.toLowerCase()
      )?.name ??
      availableModules[0]?.name ??
      "";

    const moduleName = window.prompt("Base module name", defaultModule)?.trim();
    if (!moduleName) return;

    const baseOffset = window
      .prompt("Base offset from the module (example: 0x1A2B30)", "0x0")
      ?.trim();
    if (!baseOffset) return;

    const rawOffsets = window
      .prompt(
        "Pointer offsets, comma separated (example: 0x18, 0x30, 0x8). Leave blank for module-relative only.",
        ""
      )
      ?.trim();

    if (rawOffsets === undefined) return;

    const offsets = rawOffsets
      ? rawOffsets.split(",").map((value) => value.trim()).filter(Boolean)
      : [];

    try {
      const resolved = await resolvePointerChain(
        liveProcess.pid,
        moduleName,
        baseOffset,
        offsets,
        offlineConfirmed
      );

      updateTrainer(entry.id, {
        pid: liveProcess.pid,
        address: resolved.address,
        signature: undefined,
        pointerChain: { moduleName, baseOffset, offsets }
      });
      setStatus(`Pointer chain resolved to ${resolved.address}`);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const configureSignature = async (entry: TrainerEntry) => {
    const liveProcess = liveProcessFor(entry);
    if (!liveProcess) {
      setStatus("Start the game and select its process before adding a signature");
      return;
    }

    let availableModules: ProcessModule[];
    try {
      availableModules = await availableModulesFor(liveProcess);
    } catch (error) {
      setStatus(String(error));
      return;
    }

    const defaultModule =
      availableModules.find(
        (module) =>
          module.name.toLowerCase() === liveProcess.name.toLowerCase()
      )?.name ??
      availableModules[0]?.name ??
      "";

    const moduleName = window
      .prompt("Signature module", entry.signature?.moduleName ?? defaultModule)
      ?.trim();
    if (!moduleName) return;

    const pattern = window
      .prompt(
        "AOB signature (use ? or ?? for wildcard bytes)",
        entry.signature?.pattern ?? "48 8B ?? ?? 89 45 ??"
      )
      ?.trim();
    if (!pattern) return;

    const matchOffset = window
      .prompt(
        "Result offset from the signature match (example: 0x8 or -0x10)",
        entry.signature?.matchOffset ?? "0x0"
      )
      ?.trim();
    if (matchOffset === undefined || matchOffset === "") return;

    const occurrenceInput = window
      .prompt(
        "Which match? 1 = first, 2 = second, etc.",
        String((entry.signature?.occurrence ?? 0) + 1)
      )
      ?.trim();
    if (!occurrenceInput) return;

    const occurrenceNumber = Number.parseInt(occurrenceInput, 10);
    if (
      !Number.isInteger(occurrenceNumber) ||
      occurrenceNumber < 1 ||
      occurrenceNumber > 128
    ) {
      setStatus("Signature occurrence must be between 1 and 128");
      return;
    }
    const occurrence = occurrenceNumber - 1;

    try {
      const resolved = await findSignature(
        liveProcess.pid,
        moduleName,
        pattern,
        matchOffset,
        occurrence,
        offlineConfirmed
      );

      updateTrainer(entry.id, {
        pid: liveProcess.pid,
        address: resolved.address,
        pointerChain: undefined,
        signature: { moduleName, pattern, matchOffset, occurrence }
      });
      setStatus(
        `Signature matched at ${resolved.match_address}; trainer target → ${resolved.address}`
      );
    } catch (error) {
      setStatus(String(error));
    }
  };

  const testStableTrainer = async (entry: TrainerEntry) => {
    const liveProcess = processes.find(
      (process) =>
        process.name.toLowerCase() === entry.processName.toLowerCase()
    );
    if (!liveProcess) {
      setStatus("Target game is not currently running");
      return;
    }

    try {
      if (entry.signature) {
        const resolved = await findSignature(
          liveProcess.pid,
          entry.signature.moduleName,
          entry.signature.pattern,
          entry.signature.matchOffset,
          entry.signature.occurrence,
          offlineConfirmed
        );
        updateTrainer(entry.id, { pid: liveProcess.pid, address: resolved.address });
        setStatus(
          `Signature test passed: ${resolved.match_address} → ${resolved.address}`
        );
        return;
      }

      if (entry.pointerChain) {
        const resolved = await resolvePointerChain(
          liveProcess.pid,
          entry.pointerChain.moduleName,
          entry.pointerChain.baseOffset,
          entry.pointerChain.offsets,
          offlineConfirmed
        );
        updateTrainer(entry.id, { pid: liveProcess.pid, address: resolved.address });
        setStatus(
          `Pointer test passed: ${resolved.address} in ${resolved.steps.length} step(s)`
        );
      }
    } catch (error) {
      setStatus(String(error));
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">RECODE</div>
          <div className="subtitle">offline trainer toolkit · v1.6.0</div>
        </div>
        <div className="topbar-actions">
          <button
            className="ghost update-button"
            disabled={checkingUpdate}
            onClick={() => void checkForUpdates(true)}
          >
            {checkingUpdate ? "Checking…" : "Check updates"}
          </button>
          <div className="status-pill">
            <span className="status-dot" />
            {status}
          </div>
        </div>
      </header>

      <section className="safety">
        <label>
          <input
            type="checkbox"
            checked={offlineConfirmed}
            onChange={(event) => setOfflineConfirmed(event.target.checked)}
          />
          I am using Recode only with an offline/single-player game I am allowed
          to modify.
        </label>
      </section>

      <div className="workspace">
        <aside className="panel process-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">TARGET</span>
              <h2>Processes</h2>
            </div>
            <button className="ghost" onClick={refresh}>Refresh</button>
          </div>

          <input
            className="input"
            placeholder="Search process or PID"
            value={processFilter}
            onChange={(event) => setProcessFilter(event.target.value)}
          />

          <div className="process-list">
            {filteredProcesses.map((process) => (
              <button
                key={process.pid}
                className={selected?.pid === process.pid ? "process selected" : "process"}
                onClick={() => attach(process)}
              >
                <span className="process-icon">{process.name.slice(0, 1).toUpperCase()}</span>
                <span className="process-copy">
                  <strong>{process.name}</strong>
                  <small>PID {process.pid}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="content">
          <StoreLibraryPanel
            processes={processes}
            selectedProcess={selected}
            selectedGame={selectedGame}
            settings={settings}
            onSettings={setSettings}
            onSelectProcess={attach}
            onSelectGame={setSelectedGame}
            onStatus={setStatus}
          />

          <FrameworkPanel
            selectedGame={selectedGame}
            selectedProcess={selected}
            frameworks={detectedFrameworks}
            requirements={activeProfile?.frameworks}
            loading={frameworksLoading}
            onRefresh={() => void refreshFrameworks()}
          />

          <div className="profile-bar">
            <div className="profile-select-wrap">
              <span className="eyebrow">PROFILE</span>
              <select
                className="input profile-select"
                value={activeProfile?.id ?? ""}
                onChange={(event) => setActiveProfileId(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <span className="profile-summary">
                {activeProfile?.processName || "No game bound"} · {trainers.length} entries
              </span>
            </div>
            <div className="profile-actions">
              <button onClick={createProfile}>New</button>
              <button onClick={renameProfile}>Rename</button>
              <button onClick={() => void importProfile()}>Import</button>
              <button onClick={() => void exportProfile()}>Export</button>
              <button className="danger" onClick={deleteProfile}>Delete</button>
            </div>
          </div>

          <HubPanel
            selected={selected}
            selectedGame={selectedGame}
            autoDownloadCompatible={settings.autoDownloadCompatible}
            offlineConfirmed={offlineConfirmed}
            onInstall={installHubProfile}
            onStatus={setStatus}
          />

          <AiBuilderPanel
            selectedProcess={selected}
            selectedGame={selectedGame}
            activeProfile={activeProfile}
            onInstall={installHubProfile}
            onStatus={setStatus}
          />

          <div className="target-card">
            <div>
              <span className="eyebrow">SELECTED PROCESS</span>
              <h1>{selected?.name ?? "No process selected"}</h1>
              <p>
                {selected
                  ? `${selected.path || `PID ${selected.pid}`} · ${modules.length} modules`
                  : "Choose a local game process from the list."}
              </p>
            </div>
            {selected && <div className="pid-badge">PID {selected.pid}</div>}
          </div>

          <div className="grid">
            <section className="panel scanner">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">MEMORY</span>
                  <h2>Exact value scanner</h2>
                </div>
                {scan && (
                  <span className="match-count">
                    {scan.total_matches.toLocaleString()} matches
                  </span>
                )}
              </div>

              <div className="scan-controls">
                <select
                  className="input"
                  value={valueType}
                  disabled={Boolean(scan)}
                  onChange={(event) => setValueType(event.target.value as ValueType)}
                >
                  <option value="i32">32-bit integer</option>
                  <option value="u32">32-bit unsigned</option>
                  <option value="i64">64-bit integer</option>
                  <option value="u64">64-bit unsigned</option>
                  <option value="f32">32-bit float</option>
                  <option value="f64">64-bit float</option>
                </select>
                <input
                  className="input"
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  placeholder="Value"
                />
                {!scan ? (
                  <button className="primary" disabled={busy} onClick={doFirstScan}>
                    {busy ? "Scanning…" : "First scan"}
                  </button>
                ) : (
                  <>
                    <button className="primary" disabled={busy} onClick={doRescan}>
                      {busy ? "Rescanning…" : "Next scan"}
                    </button>
                    <button
                      className="ghost"
                      onClick={() => {
                        void clearScan(scan.session_id).catch(() => {});
                        setScan(null);
                      }}
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>

              {scan ? (
                <div className="results">
                  {scan.truncated && (
                    <div className="notice">
                      Result storage is capped to keep the app responsive. Change
                      the in-game value and rescan to narrow it.
                    </div>
                  )}
                  <div className="result-head">
                    <span>Address</span>
                    <span>Actions</span>
                  </div>
                  {scan.matches.slice(0, 300).map((match) => (
                    <div className="result-row" key={match.address}>
                      <code>{match.address}</code>
                      <div className="row-actions">
                        <button onClick={() => editAddress(match.address)}>Write</button>
                        <button onClick={() => saveTrainer(match.address)}>Save</button>
                      </div>
                    </div>
                  ))}
                  {scan.matches.length > 300 && (
                    <div className="notice">
                      Showing the first 300 stored addresses. Rescan to narrow the list.
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty">
                  Enter the value currently shown in your game, scan, change the
                  value in-game, then scan again with the new value.
                </div>
              )}
            </section>

            <section className="panel trainer">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">TRAINER</span>
                  <h2>{activeProfile?.name ?? "Saved cheats"}</h2>
                </div>
                <span className="match-count">
                  {trainers.filter((entry) => entry.enabled).length} active
                </span>
              </div>

              <div className="trainer-list">
                {trainers.length === 0 && (
                  <div className="empty">
                    Save a scan result to this profile to create a trainer entry.
                  </div>
                )}

                {trainers.map((entry) => (
                  <article className="trainer-card" key={entry.id}>
                    <div className="trainer-top">
                      <div>
                        <strong>{entry.label}</strong>
                        <small>{entry.processName} · {entry.address}</small>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(event) =>
                            updateTrainer(entry.id, { enabled: event.target.checked })
                          }
                        />
                        <span />
                      </label>
                    </div>

                    <div className="trainer-meta">
                      {entry.signature ? (
                        <span className="signature-badge">
                          AOB · {entry.signature.moduleName} · {entry.signature.pattern}
                        </span>
                      ) : entry.pointerChain ? (
                        <span className="stable-badge">
                          POINTER · {entry.pointerChain.moduleName}
                          {entry.pointerChain.baseOffset.startsWith("-") ? "" : "+"}
                          {entry.pointerChain.baseOffset}
                          {entry.pointerChain.offsets.length
                            ? ` → ${entry.pointerChain.offsets.join(" → ")}`
                            : ""}
                        </span>
                      ) : (
                        <span className="raw-badge">RAW ADDRESS</span>
                      )}
                      {entry.hotkey && <span className="hotkey-badge">{entry.hotkey}</span>}
                    </div>

                    <div className="trainer-edit">
                      {entry.control?.kind === "slider" ? (
                        <div className="trainer-value-control">
                          <input
                            className="trainer-slider"
                            type="range"
                            min={entry.control.min}
                            max={entry.control.max}
                            step={entry.control.step}
                            value={entry.value}
                            onChange={(event) =>
                              updateTrainer(entry.id, { value: event.target.value })
                            }
                          />
                          <input
                            className="input trainer-number-box"
                            type="number"
                            min={entry.control.min}
                            max={entry.control.max}
                            step={entry.control.step}
                            value={entry.value}
                            onChange={(event) =>
                              updateTrainer(entry.id, { value: event.target.value })
                            }
                          />
                        </div>
                      ) : (
                        <input
                          className="input"
                          value={entry.value}
                          onChange={(event) =>
                            updateTrainer(entry.id, { value: event.target.value })
                          }
                        />
                      )}
                      <select
                        className="input"
                        value={entry.valueType}
                        onChange={(event) =>
                          updateTrainer(entry.id, {
                            valueType: event.target.value as ValueType
                          })
                        }
                      >
                        <option value="i32">i32</option>
                        <option value="u32">u32</option>
                        <option value="i64">i64</option>
                        <option value="u64">u64</option>
                        <option value="f32">f32</option>
                        <option value="f64">f64</option>
                      </select>
                      <button onClick={() => configureHotkey(entry)}>Hotkey</button>
                      <button onClick={() => void stabilizeTrainer(entry)}>Pointer</button>
                      <button onClick={() => void configureSignature(entry)}>Signature</button>
                      {(entry.pointerChain || entry.signature) && (
                        <button onClick={() => void testStableTrainer(entry)}>Test</button>
                      )}
                      <button
                        className="danger"
                        onClick={() =>
                          setTrainers((current) =>
                            current.filter((item) => item.id !== entry.id)
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
