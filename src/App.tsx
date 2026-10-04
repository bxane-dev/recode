import { useEffect, useMemo, useState } from "react";
import { clearScan, listProcesses, rescan, startScan, writeValue } from "./lib/api";
import type { ProcessInfo, ScanSummary, TrainerEntry, ValueType } from "./types";

const TRAINER_KEY = "recode.trainers.v1";

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

function loadTrainers(): TrainerEntry[] {
  try {
    const raw = localStorage.getItem(TRAINER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processFilter, setProcessFilter] = useState("");
  const [selected, setSelected] = useState<ProcessInfo | null>(null);
  const [offlineConfirmed, setOfflineConfirmed] = useState(false);
  const [valueType, setValueType] = useState<ValueType>("i32");
  const [scanValue, setScanValue] = useState("100");
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [trainers, setTrainers] = useState<TrainerEntry[]>(loadTrainers);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");

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

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    localStorage.setItem(TRAINER_KEY, JSON.stringify(trainers));
  }, [trainers]);

  useEffect(() => {
    const enabled = trainers.filter((entry) => entry.enabled);
    if (!enabled.length || !offlineConfirmed) return;

    const timer = window.setInterval(() => {
      for (const entry of enabled) {
        void writeValue(
          entry.pid,
          entry.address,
          entry.value,
          entry.valueType,
          true
        ).catch(() => {
          setTrainers((current) =>
            current.map((item) =>
              item.id === entry.id ? { ...item, enabled: false } : item
            )
          );
        });
      }
    }, 350);

    return () => window.clearInterval(timer);
  }, [trainers, offlineConfirmed]);

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
    if (scan) void clearScan(scan.session_id).catch(() => {});
    setScan(null);
    setStatus(`Attached selection: ${process.name} (PID ${process.pid})`);
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
    if (!selected) return;
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
  };

  const updateTrainer = (id: string, patch: Partial<TrainerEntry>) => {
    setTrainers((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">RECODE</div>
          <div className="subtitle">offline trainer toolkit · v0.1.0</div>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          {status}
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
            <button className="ghost" onClick={refresh}>
              Refresh
            </button>
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
                className={
                  selected?.pid === process.pid ? "process selected" : "process"
                }
                onClick={() => attach(process)}
              >
                <span className="process-icon">
                  {process.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="process-copy">
                  <strong>{process.name}</strong>
                  <small>PID {process.pid}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="content">
          <div className="target-card">
            <div>
              <span className="eyebrow">SELECTED PROCESS</span>
              <h1>{selected?.name ?? "No process selected"}</h1>
              <p>
                {selected
                  ? selected.path || `PID ${selected.pid}`
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
                        <button onClick={() => editAddress(match.address)}>
                          Write
                        </button>
                        <button onClick={() => saveTrainer(match.address)}>
                          Save
                        </button>
                      </div>
                    </div>
                  ))}
                  {scan.matches.length > 300 && (
                    <div className="notice">
                      Showing the first 300 stored addresses. Rescan to narrow the
                      list.
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
                  <h2>Saved cheats</h2>
                </div>
                <span className="match-count">{trainers.length}</span>
              </div>

              <div className="trainer-list">
                {trainers.length === 0 && (
                  <div className="empty">
                    Save a scan result to turn it into a trainer entry.
                  </div>
                )}

                {trainers.map((entry) => (
                  <article className="trainer-card" key={entry.id}>
                    <div className="trainer-top">
                      <div>
                        <strong>{entry.label}</strong>
                        <small>
                          {entry.processName} · {entry.address}
                        </small>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(event) =>
                            updateTrainer(entry.id, {
                              enabled: event.target.checked
                            })
                          }
                        />
                        <span />
                      </label>
                    </div>
                    <div className="trainer-edit">
                      <input
                        className="input"
                        value={entry.value}
                        onChange={(event) =>
                          updateTrainer(entry.id, { value: event.target.value })
                        }
                      />
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
