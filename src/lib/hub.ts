import type { HubCatalog, TrainerProfile } from "../types";
import { parseCheatEngineTable } from "./cheatEngine";
import { parseProfileFile } from "./profiles";

export const HUB_CATALOG_URL =
  "https://raw.githubusercontent.com/bxane-dev/recode/main/hub/catalog.json";

const MAX_REMOTE_BYTES = 2 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  "raw.githubusercontent.com",
  "gist.githubusercontent.com"
]);

function validateRemoteUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      "Only HTTPS trainer files from raw.githubusercontent.com or gist.githubusercontent.com are accepted"
    );
  }

  const lower = url.pathname.toLowerCase();
  if (!lower.endsWith(".rc") && !lower.endsWith(".json") && !lower.endsWith(".ct")) {
    throw new Error("Remote trainer must be a .rc, .json, or .ct file");
  }
  return url.toString();
}

async function fetchLimited(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json, application/xml, text/xml, text/plain" }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading trainer data`);
  }

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_REMOTE_BYTES) {
    throw new Error("Remote trainer file is larger than 2 MB");
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_BYTES) {
    throw new Error("Remote trainer file is larger than 2 MB");
  }
  return text;
}

export async function loadHubCatalog(): Promise<HubCatalog> {
  const raw = await fetchLimited(HUB_CATALOG_URL);
  const parsed = JSON.parse(raw) as HubCatalog;
  if (
    parsed?.schema !== "recode.hub" ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.entries)
  ) {
    throw new Error("Recode Hub catalog has an unsupported format");
  }
  return parsed;
}

export async function loadRemoteTrainer(
  rawUrl: string,
  processName: string
): Promise<TrainerProfile> {
  const url = validateRemoteUrl(rawUrl);
  const raw = await fetchLimited(url);

  if (new URL(url).pathname.toLowerCase().endsWith(".ct")) {
    return parseCheatEngineTable(raw, processName);
  }
  return parseProfileFile(raw);
}
