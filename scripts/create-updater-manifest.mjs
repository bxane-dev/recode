import fs from "node:fs";
import path from "node:path";

const versionTag = process.env.VERSION;
const repository = process.env.GITHUB_REPOSITORY;

if (!versionTag || !repository) {
  throw new Error("VERSION and GITHUB_REPOSITORY are required");
}

const version = versionTag.replace(/^v/, "");
const dir = path.resolve("release-assets");

const readSignature = (name) =>
  fs.readFileSync(path.join(dir, `${name}.sig`), "utf8").trim();

const releaseUrl = (name) =>
  `https://github.com/${repository}/releases/download/${versionTag}/${name}`;

const manifest = {
  version,
  notes: `Recode ${versionTag} update`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readSignature("Recode-Setup-Windows-x64.exe"),
      url: releaseUrl("Recode-Setup-Windows-x64.exe")
    },
    "linux-x86_64": {
      signature: readSignature("Recode-Linux-x64.AppImage"),
      url: releaseUrl("Recode-Linux-x64.AppImage")
    }
  }
};

fs.writeFileSync(
  path.join(dir, "latest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
