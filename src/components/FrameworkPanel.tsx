import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  DetectedFramework,
  FrameworkRequirement,
  InstalledGame,
  ProcessInfo
} from "../types";

interface Props {
  selectedGame: InstalledGame | null;
  selectedProcess: ProcessInfo | null;
  frameworks: DetectedFramework[];
  requirements?: FrameworkRequirement[];
  loading: boolean;
  onRefresh: () => void;
}

export default function FrameworkPanel({
  selectedGame,
  selectedProcess,
  frameworks,
  requirements,
  loading,
  onRefresh
}: Props) {
  if (!selectedGame) return null;

  const required = requirements?.filter((item) => item.required !== false) ?? [];
  const missing = required.filter(
    (requirement) =>
      !frameworks.some(
        (framework) =>
          framework.detected &&
          framework.id.toLowerCase() === requirement.id.toLowerCase()
      )
  );

  return (
    <section className="framework-card">
      <div className="framework-heading">
        <div>
          <span className="eyebrow">FRAMEWORK BRIDGE</span>
          <h2>REFramework · BepInEx · MelonLoader · UE4SS · SMAPI</h2>
          <p>
            Detects mod frameworks in the selected game's files and checks .rc
            framework requirements before trainer values are applied.
          </p>
        </div>
        <button disabled={loading} onClick={onRefresh}>
          {loading ? "Detecting…" : "Detect frameworks"}
        </button>
      </div>

      {missing.length > 0 && (
        <div className="framework-warning">
          This profile requires:{" "}
          {missing.map((item) => item.name || item.id).join(", ")}. Recode keeps
          its trainer entries disabled until the required framework is detected.
        </div>
      )}

      <div className="framework-grid">
        {frameworks.map((framework) => {
          const isRequired = required.some(
            (item) => item.id.toLowerCase() === framework.id.toLowerCase()
          );
          return (
            <article
              className={
                framework.detected
                  ? "framework-item detected"
                  : "framework-item"
              }
              key={framework.id}
            >
              <div>
                <strong>{framework.name}</strong>
                <small>
                  {framework.detected
                    ? framework.confidence === "possible"
                      ? "Possible install"
                      : "Detected"
                    : "Not detected"}
                  {isRequired ? " · REQUIRED" : ""}
                </small>
                {framework.marker && <code>{framework.marker}</code>}
              </div>
              <button onClick={() => void openUrl(framework.officialUrl)}>
                Official
              </button>
            </article>
          );
        })}
      </div>

      {selectedProcess?.path && (
        <div className="framework-footnote">
          Running executable: {selectedProcess.path}
        </div>
      )}
    </section>
  );
}
