import { useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  generateAiTrainer,
  readProfileFile,
  writeProfileFile
} from "../lib/api";
import { parseCheatEngineTable } from "../lib/cheatEngine";
import { parseProfileFile, profileToFile } from "../lib/profiles";
import { submitCommunityProfile } from "../lib/hubDb";
import type { InstalledGame, ProcessInfo, TrainerProfile } from "../types";

interface Props {
  selectedProcess: ProcessInfo | null;
  selectedGame: InstalledGame | null;
  activeProfile: TrainerProfile | undefined;
  onInstall: (profile: TrainerProfile, autoApply: boolean) => void;
  onStatus: (message: string) => void;
}

type AiProvider = "openai" | "anthropic" | "gemini" | "compatible";

const PROVIDER_DEFAULTS: Record<AiProvider, { model: string; endpoint: string }> = {
  openai: { model: "gpt-5.6-sol", endpoint: "" },
  anthropic: { model: "claude-sonnet-4-5", endpoint: "" },
  gemini: { model: "gemini-3.8-flash", endpoint: "" },
  compatible: {
    model: "",
    endpoint: "http://127.0.0.1:11434/v1/chat/completions"
  }
};

function basename(value: string | null | undefined) {
  if (!value) return "";
  return value.split(/[\\/]/).pop() ?? value;
}

function extractJson(raw: string) {
  const trimmed = raw.trim();

  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.stringify(JSON.parse(trimmed.slice(start, end + 1)));
    }
    throw new Error("AI did not return JSON");
  }
}

export default function AiBuilderPanel({
  selectedProcess,
  selectedGame,
  activeProfile,
  onInstall,
  onStatus
}: Props) {
  const [goal, setGoal] = useState("");
  const [publishConsent, setPublishConsent] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState(PROVIDER_DEFAULTS.openai.model);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sending, setSending] = useState(false);
  const [aiReply, setAiReply] = useState("");
  const [generatedProfile, setGeneratedProfile] =
    useState<TrainerProfile | null>(null);

  const target =
    selectedProcess?.name || basename(selectedGame?.executable) || "";
  const gameName =
    selectedGame?.name || target || "the selected offline game";

  const prompt = useMemo(() => {
    const requested =
      goal.trim() ||
      "the user's requested offline single-player trainer feature";

    return [
      "Create a data-only Recode trainer profile for an offline/single-player game.",
      "The result will be parsed directly by the Recode desktop app.",
      "Game: " + gameName,
      "Target process: " + (target || "unknown"),
      "Requested cheat: " + requested,
      "",
      "Return exactly ONE JSON object and no Markdown.",
      "If enough technical address data exists, return:",
      '{"schema":"recode.trainer-profile","version":1,"profile":{...}}',
      "If the request cannot be made reliably without more game-specific memory information, return:",
      '{"needs_input":"Explain exactly what data the user must provide."}',
      "",
      "Allowed profile fields: name, processName, frameworks, trainers, createdAt, updatedAt, formatVersion.",
      "If the trainer requires an existing mod framework, add frameworks:[{id,name,required:true}] using ids such as reframework, bepinex, melonloader, ue4ss, or smapi.",
      "Allowed trainer fields: label, processName, address, valueType, value, enabled, control, hotkey, pointerChain, signature.",
      "For an adjustable numeric amount, control may be {kind:\"slider\",min:\"0\",max:\"999999\",step:\"1\"}; Recode renders a slider plus editable number box.",
      "valueType must be one of i32, u32, i64, u64, f32, f64.",
      "Prefer stable module-relative pointer chains or AOB signatures over raw addresses.",
      "Do not invent addresses, pointer offsets, signatures, or values.",
      "Do not output executable code, DLL injection, Lua, Auto Assembler, anti-cheat bypasses, DRM bypasses, networking attacks, or multiplayer/competitive cheats.",
      "Set enabled=false for each generated trainer."
    ].join("\n");
  }, [gameName, target, goal]);

  const changeProvider = (next: AiProvider) => {
    setProvider(next);
    setModel(PROVIDER_DEFAULTS[next].model);
    setEndpoint(PROVIDER_DEFAULTS[next].endpoint);
    setAiReply("");
  };

  const sendRequest = async () => {
    if (!goal.trim()) {
      onStatus("Enter what cheat you want the AI to create");
      return;
    }
    if (!model.trim()) {
      onStatus("Enter the AI model name");
      return;
    }
    if (provider !== "compatible" && !apiKey.trim()) {
      onStatus("Enter the provider API key");
      return;
    }
    if (provider === "compatible" && !endpoint.trim()) {
      onStatus("Enter the OpenAI-compatible endpoint");
      return;
    }

    setSending(true);
    setAiReply("");
    setGeneratedProfile(null);
    onStatus("Sending request to " + provider + "…");

    try {
      const raw = await generateAiTrainer(
        provider,
        apiKey,
        model.trim(),
        provider === "compatible" ? endpoint.trim() : null,
        prompt
      );

      setAiReply(raw);
      const jsonText = extractJson(raw);
      const decoded = JSON.parse(jsonText) as { needs_input?: unknown };

      if (typeof decoded.needs_input === "string") {
        onStatus("AI needs more information: " + decoded.needs_input);
        return;
      }

      const profile = parseProfileFile(jsonText);
      setGeneratedProfile(profile);
      onInstall(profile, true);
      onStatus("AI trainer created and applied: " + profile.name);
    } catch (error) {
      onStatus("AI request failed: " + String(error));
    } finally {
      setSending(false);
    }
  };

  const saveGeneratedRc = async () => {
    if (!generatedProfile) return;

    try {
      const safeName =
        generatedProfile.name
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "trainer";

      const path = await save({
        title: "Save AI-created Recode trainer",
        defaultPath: safeName + ".rc",
        filters: [{ name: "Recode trainer", extensions: ["rc"] }]
      });
      if (!path) return;

      await writeProfileFile(
        path,
        JSON.stringify(profileToFile(generatedProfile), null, 2)
      );
      onStatus("Saved Recode trainer: " + safeName + ".rc");
    } catch (error) {
      onStatus("Could not save .rc trainer: " + String(error));
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      onStatus("AI Builder prompt copied");
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
        filters: [
          { name: "Recode / Cheat Engine", extensions: ["rc", "json", "ct"] }
        ]
      });
      if (!path || Array.isArray(path)) return;

      const raw = await readProfileFile(path);
      const profile = path.toLowerCase().endsWith(".ct")
        ? parseCheatEngineTable(raw, target)
        : parseProfileFile(raw);

      onInstall(profile, true);
      onStatus("Imported and applied trainer: " + profile.name);
    } catch (error) {
      onStatus("Trainer import failed: " + String(error));
    }
  };

  const submitToHub = async () => {
    if (!publishConsent) {
      onStatus("Enable public sharing consent before publishing to Recode Hub");
      return;
    }
    if (!activeProfile) {
      onStatus("Import or create a trainer profile first");
      return;
    }

    const confirmed = window.confirm(
      "Publish this trainer profile publicly to Recode Hub? It can become available to other Recode users after validation."
    );
    if (!confirmed) return;

    const processName = target || activeProfile.processName;
    if (!processName) {
      onStatus("Select the game/process before publishing to Recode Hub");
      return;
    }

    try {
      const result = await submitCommunityProfile({
        gameName,
        processName,
        requestedFeature: goal.trim(),
        aiProvider: generatedProfile ? provider : "",
        profile: activeProfile,
        publishConsent: true
      });

      onStatus(
        "Published to Recode Hub · " +
          result.trainerCount +
          " trainer entries · community/unverified"
      );
    } catch (error) {
      const useFallback = window.confirm(
        "Supabase publication failed. Prepare the .rc file and open the GitHub submission fallback instead?"
      );
      if (!useFallback) {
        onStatus("Hub publication failed: " + String(error));
        return;
      }

      try {
        const safeName =
          activeProfile.name
            .replace(/[^a-z0-9-_]+/gi, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "trainer";

        const path = await save({
          title: "Save Hub submission profile",
          defaultPath: safeName + ".rc",
          filters: [{ name: "Recode trainer profile", extensions: ["rc"] }]
        });
        if (!path) return;

        const serialized = JSON.stringify(profileToFile(activeProfile), null, 2);
        await writeProfileFile(path, serialized);
        await navigator.clipboard.writeText(serialized).catch(() => {});
        await openUrl(
          "https://github.com/bxane-dev/recode/issues/new?template=trainer_submission.yml"
        );
        onStatus("Opened GitHub Hub-submission fallback.");
      } catch (fallbackError) {
        onStatus("Could not prepare Hub fallback: " + String(fallbackError));
      }
    }
  };

  return (
    <section className="ai-card">
      <div className="ai-heading">
        <div>
          <span className="eyebrow">AI BUILDER</span>
          <h2>Make a trainer with AI</h2>
          <p>
            Send the selected game's request directly to OpenAI/ChatGPT,
            Claude, Gemini, or an OpenAI-compatible/local AI.
          </p>
        </div>

        <div className="ai-actions">
          <button onClick={() => void copyPrompt()}>Copy prompt</button>
          <button onClick={() => void uploadAiFile()}>Upload</button>
          <button
            className="primary"
            disabled={sending}
            onClick={() => void sendRequest()}
          >
            {sending ? "Sending…" : "OK · Send"}
          </button>
          {generatedProfile && (
            <button onClick={() => void saveGeneratedRc()}>Save .rc</button>
          )}
          <button
            disabled={!publishConsent}
            onClick={() => void submitToHub()}
          >
            Publish to Hub
          </button>
        </div>
      </div>

      <div className="ai-provider-grid">
        <select
          className="input"
          value={provider}
          onChange={(event) => changeProvider(event.target.value as AiProvider)}
        >
          <option value="openai">OpenAI / ChatGPT API</option>
          <option value="anthropic">Anthropic / Claude API</option>
          <option value="gemini">Google Gemini API</option>
          <option value="compatible">OpenAI-compatible / local / other</option>
        </select>

        <input
          className="input"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Model name"
        />

        <input
          className="input"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            provider === "compatible"
              ? "API key (optional for local)"
              : "API key"
          }
          autoComplete="off"
        />
      </div>

      {provider === "compatible" && (
        <input
          className="input ai-endpoint"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="https://provider.example/v1/chat/completions"
        />
      )}

      <textarea
        className="input ai-goal"
        placeholder="Example: infinite stamina, 9999 coins, lock health at 100..."
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
      />

      <label className="ai-publish-consent">
        <input
          type="checkbox"
          checked={publishConsent}
          onChange={(event) => setPublishConsent(event.target.checked)}
        />
        I agree to publish this trainer publicly only if I press Publish to Hub.
      </label>

      {aiReply && (
        <details className="ai-prompt-preview" open>
          <summary>AI response</summary>
          <pre>{aiReply}</pre>
        </details>
      )}

      <details className="ai-prompt-preview">
        <summary>Request sent to AI</summary>
        <pre>{prompt}</pre>
      </details>
    </section>
  );
}
