import { useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readProfileFile, writeProfileFile } from "../lib/api";
import { parseCheatEngineTable } from "../lib/cheatEngine";
import { parseProfileFile, profileToFile } from "../lib/profiles";
import type { InstalledGame, ProcessInfo, TrainerProfile } from "../types";

interface Props {
  selectedProcess: ProcessInfo | null;
  selectedGame: InstalledGame | null;
  activeProfile: TrainerProfile | undefined;
  onInstall: (profile: TrainerProfile, autoApply: boolean) => void;
  onStatus: (message: string) => void;
}

function basename(value: string | null | undefined) {
  if (!value) return "";
  return value.split(/[\\/]/).pop() ?? value;
}

export default function AiBuilderPanel({
  selectedProcess,
  selectedGame,
  activeProfile,
  onInstall,
  onStatus
}: Props) {
  const [goal, setGoal] = useState("");
  const target = selectedProcess?.name || basename(selectedGame?.executable) || "";
  const gameName = selectedGame?.name || target || "the selected offline game";

  const prompt = useMemo(() => {
    const requested = goal.trim() || "the user's requested offline single-player trainer feature";
    return [
      "You are creating a data-only Recode trainer profile for an offline/single-player game.",
      `Game: ${gameName}`,
      `Target process: ${target || "ASK THE USER FOR THE GAME EXECUTABLE NAME"}`,
      `Requested cheat: ${requested}`,
      "",
      "Return ONE JSON object only using this envelope:",
      '{"schema":"recode.trainer-profile","version":1,"profile":{...}}',
      "",
      "The profile must use only Recode data fields: name, processName, trainers, createdAt, updatedAt, formatVersion.",
      "Each trainer may use: label, processName, address, valueType, value, enabled, hotkey, pointerChain, signature.",
      'valueType must be one of: i32, u32, i64, u64, f32, f64.',
      "Prefer stable module-relative pointer chains or AOB signatures over raw addresses.",
      "Do not invent addresses, offsets, signatures, or values. If the user has not supplied enough technical information, ask them for a compatible Cheat Engine table, scan results, pointer chain, AOB signature, or exact known address/value data before producing the JSON.",
      "Do not include executable code, shell commands, DLL injection, Lua, Auto Assembler, anti-cheat bypasses, DRM bypasses, networking attacks, or multiplayer/competitive cheats.",
      "Set enabled=false for every trainer in the file. Recode will let the user apply them after import."
    ].join("\n");
  }, [gameName, target, goal]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      onStatus("AI Builder prompt copied — paste it into ChatGPT, Claude, Gemini, or another AI");
    } catch {
      onStatus("Could not access the clipboard");
    }
  };

  const uploadAiFile = async () => {
    try {
      const path = await open({
        title: "Upload AI-created trainer",
        multiple: false,
        directory: false,
        filters: [{ name: "Recode / Cheat Engine", extensions: ["json", "ct"] }]
      });
      if (!path || Array.isArray(path)) return;

      const raw = await readProfileFile(path);
      const profile = path.toLowerCase().endsWith(".ct")
        ? parseCheatEngineTable(raw, target)
        : parseProfileFile(raw);

      onInstall(profile, true);
      onStatus(`Imported and applied AI trainer: ${profile.name}`);
    } catch (error) {
      onStatus(`AI trainer import failed: ${String(error)}`);
    }
  };

  const submitToHub = async () => {
    if (!activeProfile) {
      onStatus("Import or create a trainer profile first");
      return;
    }

    const agreed = window.confirm(
      "Share this trainer with the Recode community? If you continue, Recode will prepare the profile and open a GitHub submission form. Nothing is uploaded unless you submit that form."
    );
    if (!agreed) {
      onStatus("Hub sharing cancelled");
      return;
    }

    try {
      const safeName =
        activeProfile.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() ||
        "trainer";

      const path = await save({
        title: "Save Hub submission profile",
        defaultPath: `${safeName}.recode.json`,
        filters: [{ name: "Recode trainer profile", extensions: ["json"] }]
      });
      if (!path) return;

      await writeProfileFile(path, JSON.stringify(profileToFile(activeProfile), null, 2));
      await navigator.clipboard.writeText(JSON.stringify(profileToFile(activeProfile), null, 2)).catch(() => {});
      await openUrl("https://github.com/bxane-dev/recode/issues/new?template=trainer_submission.yml");
      onStatus("Profile prepared. Nothing is shared until you submit the GitHub form.");
    } catch (error) {
      onStatus(`Could not prepare Hub submission: ${String(error)}`);
    }
  };

  return (
    <section className="ai-card">
      <div className="ai-heading">
        <div>
          <span className="eyebrow">AI BUILDER</span>
          <h2>Make a trainer with any AI</h2>
          <p>Generate a strict Recode profile prompt, then upload the AI-produced file and apply it.</p>
        </div>
        <div className="ai-actions">
          <button onClick={() => void copyPrompt()}>Copy AI prompt</button>
          <button className="primary" onClick={() => void uploadAiFile()}>Upload + Apply</button>
          <button onClick={() => void submitToHub()}>Submit to Hub</button>
        </div>
      </div>

      <textarea
        className="input ai-goal"
        placeholder="Example: infinite stamina, 9999 coins, lock health at 100..."
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
      />

      <details className="ai-prompt-preview">
        <summary>Preview generated prompt</summary>
        <pre>{prompt}</pre>
      </details>
    </section>
  );
}
