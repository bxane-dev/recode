import fs from "node:fs";
import path from "node:path";

const body = process.env.ISSUE_BODY || "";
const issueNumber = process.env.ISSUE_NUMBER || "";
const issueUser = process.env.ISSUE_USER || "community";

function field(label) {
  const marker = `### ${label}\n\n`;
  const start = body.indexOf(marker);
  if (start < 0) return "";
  const rest = body.slice(start + marker.length);
  const end = rest.indexOf("\n\n### ");
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
}

function cleanText(value, max = 160) {
  return value.replace(/[\r\n\0]/g, " ").trim().slice(0, max);
}

const game = cleanText(field("Game"), 120);
const processName = cleanText(field("Process executable"), 120);
const profileUrl = field("Raw profile URL").trim();
const description = cleanText(field("Description"), 240);

if (!game || !processName || !profileUrl) throw new Error("Missing required issue fields");

const url = new URL(profileUrl);
if (url.protocol !== "https:" || !["raw.githubusercontent.com", "gist.githubusercontent.com"].includes(url.hostname)) {
  throw new Error("Profile URL must be an HTTPS GitHub Raw or Gist URL");
}
if (!url.pathname.toLowerCase().endsWith(".json")) throw new Error("Hub submissions must be JSON Recode profiles");

const response = await fetch(url, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Profile download failed: HTTP ${response.status}`);
const raw = await response.text();
if (Buffer.byteLength(raw, "utf8") > 2 * 1024 * 1024) throw new Error("Profile is larger than 2 MB");

const parsed = JSON.parse(raw);
if (parsed?.schema !== "recode.trainer-profile" || parsed?.version !== 1 || !parsed.profile) {
  throw new Error("Invalid Recode trainer profile envelope");
}

const source = parsed.profile;
if (!Array.isArray(source.trainers) || source.trainers.length < 1 || source.trainers.length > 500) {
  throw new Error("Profile must contain 1 to 500 trainer entries");
}

const allowedTypes = new Set(["i32","u32","i64","u64","f32","f64"]);
const trainers = source.trainers.map((entry, index) => {
  if (!entry || typeof entry !== "object") throw new Error(`Trainer ${index + 1} is invalid`);
  if (typeof entry.label !== "string" || !entry.label.trim()) throw new Error(`Trainer ${index + 1} has no label`);
  if (typeof entry.address !== "string") throw new Error(`Trainer ${index + 1} has no address`);
  if (!allowedTypes.has(entry.valueType)) throw new Error(`Trainer ${index + 1} has unsupported valueType`);
  if (typeof entry.value !== "string") throw new Error(`Trainer ${index + 1} has no value`);

  const clean = {
    id: `hub-${issueNumber}-${index + 1}`,
    label: cleanText(entry.label, 120),
    pid: 0,
    processName,
    address: entry.address.slice(0, 80),
    valueType: entry.valueType,
    value: entry.value.slice(0, 80),
    enabled: false
  };

  if (typeof entry.hotkey === "string") clean.hotkey = entry.hotkey.slice(0, 60);

  if (entry.pointerChain) {
    if (
      typeof entry.pointerChain.moduleName !== "string" ||
      typeof entry.pointerChain.baseOffset !== "string" ||
      !Array.isArray(entry.pointerChain.offsets) ||
      entry.pointerChain.offsets.length > 16
    ) throw new Error(`Trainer ${index + 1} has an invalid pointer chain`);
    clean.pointerChain = {
      moduleName: entry.pointerChain.moduleName.slice(0, 160),
      baseOffset: entry.pointerChain.baseOffset.slice(0, 40),
      offsets: entry.pointerChain.offsets.map((value) => String(value).slice(0, 40))
    };
  }

  if (entry.signature) {
    if (
      typeof entry.signature.moduleName !== "string" ||
      typeof entry.signature.pattern !== "string" ||
      typeof entry.signature.matchOffset !== "string" ||
      typeof entry.signature.occurrence !== "number"
    ) throw new Error(`Trainer ${index + 1} has an invalid signature`);
    clean.signature = {
      moduleName: entry.signature.moduleName.slice(0, 160),
      pattern: entry.signature.pattern.slice(0, 1000),
      matchOffset: entry.signature.matchOffset.slice(0, 40),
      occurrence: Math.max(0, Math.min(127, Math.trunc(entry.signature.occurrence)))
    };
  }

  return clean;
});

const timestamp = new Date().toISOString();
const slugBase = `${game}-${processName}-${issueNumber}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 90);
const slug = slugBase || `submission-${issueNumber}`;
const profilePath = path.join("hub", "profiles", `${slug}.recode.json`);

const output = {
  schema: "recode.trainer-profile",
  version: 1,
  profile: {
    id: `hub-${issueNumber}`,
    name: cleanText(source.name || `${game} community trainer`, 120),
    processName,
    trainers,
    createdAt: timestamp,
    updatedAt: timestamp,
    formatVersion: 1
  }
};

fs.mkdirSync(path.dirname(profilePath), { recursive: true });
fs.writeFileSync(profilePath, JSON.stringify(output, null, 2) + "\n");

const catalogPath = path.join("hub", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
if (catalog?.schema !== "recode.hub" || catalog?.version !== 1 || !Array.isArray(catalog.entries)) {
  throw new Error("Invalid Hub catalog");
}

const rawProfileUrl = `https://raw.githubusercontent.com/bxane-dev/recode/main/${profilePath.replaceAll(path.sep, "/")}`;
catalog.entries = catalog.entries.filter((entry) => entry.id !== `community-${issueNumber}`);
catalog.entries.push({
  id: `community-${issueNumber}`,
  title: output.profile.name,
  game,
  processNames: [processName],
  description,
  author: issueUser,
  profileUrl: rawProfileUrl,
  sourceUrl: `https://github.com/bxane-dev/recode/issues/${issueNumber}`,
  verified: false,
  tags: ["community", "ai-compatible"]
});
catalog.entries.sort((a, b) => a.game.localeCompare(b.game) || a.title.localeCompare(b.title));
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");

console.log(`Published ${profilePath}`);
