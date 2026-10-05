import fs from "node:fs";
import path from "node:path";

const versionTag = process.env.VERSION;
const repository = process.env.GITHUB_REPOSITORY;

if (!versionTag || !repository) {
  throw new Error("VERSION and GITHUB_REPOSITORY are required");
}

const version = versionTag.replace(/^v/, "");
const dir = path.resolve("release-assets");

const readSignature = (name) => {
  const signaturePath = path.join(dir, `${name}.sig`);
  if (!fs.existsSync(signaturePath)) return null;
  return fs.readFileSync(signaturePath, "utf8").trim();
};

const releaseUrl = (name) =>
  `https://github.com/${repository}/releases/download/${versionTag}/${name}`;

const windowsSignature = readSignature("Recode-Setup-Windows-x64.exe");
const linuxSignature = readSignature("Recode-Linux-x64.AppImage");

if (!windowsSignature || !linuxSignature) {
  console.log("Updater signatures are not present; skipping latest.json.");
  process.exit(0);
}

const manifest = {
  version,
  notes: `Recode ${versionTag} update`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: windowsSignature,
      url: releaseUrl("Recode-Setup-Windows-x64.exe")
    },
    "linux-x86_64": {
      signature: linuxSignature,
      url: releaseUrl("Recode-Linux-x64.AppImage")
    }
  }
};

fs.writeFileSync(
  path.join(dir, "latest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
