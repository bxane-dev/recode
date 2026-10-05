import type { TrainerEntry, TrainerProfile, ValueType } from "../types";

const now = () => new Date().toISOString();

function textOf(parent: Element, tag: string) {
  const child = Array.from(parent.children).find(
    (item) => item.tagName.toLowerCase() === tag.toLowerCase()
  );
  return child?.textContent?.trim() ?? "";
}

function valueType(raw: string): ValueType | null {
  const key = raw.trim().toLowerCase();
  if (key === "4 bytes") return "i32";
  if (key === "8 bytes") return "i64";
  if (key === "float") return "f32";
  if (key === "double") return "f64";
  return null;
}

function cleanDescription(value: string) {
  return value.replace(/^"(.*)"$/, "$1").trim() || "Imported cheat";
}

function parseAddress(raw: string) {
  const value = raw.trim();
  const moduleMatch = value.match(/^"([^"]+)"\s*\+\s*([0-9a-fA-F]+)$/);
  if (moduleMatch) {
    return {
      moduleName: moduleMatch[1],
      baseOffset: `0x${moduleMatch[2].toUpperCase()}`
    };
  }

  const unquotedModule = value.match(/^([^+]+?\.(?:exe|dll|so))\s*\+\s*([0-9a-fA-F]+)$/i);
  if (unquotedModule) {
    return {
      moduleName: unquotedModule[1].trim(),
      baseOffset: `0x${unquotedModule[2].toUpperCase()}`
    };
  }

  if (/^(?:0x)?[0-9a-fA-F]+$/.test(value)) {
    return {
      absolute: value.startsWith("0x")
        ? value
        : `0x${value.toUpperCase()}`
    };
  }

  return null;
}

export function parseCheatEngineTable(
  raw: string,
  selectedProcessName = ""
): TrainerProfile {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid Cheat Engine table");
  }

  const entries: TrainerEntry[] = [];
  let inferredProcess = selectedProcessName;

  for (const node of Array.from(doc.querySelectorAll("CheatEntry"))) {
    const rawType = textOf(node, "VariableType");
    if (/auto assembler|script/i.test(rawType)) continue;

    const mappedType = valueType(rawType);
    if (!mappedType) continue;

    const address = parseAddress(textOf(node, "Address"));
    if (!address) continue;

    const offsetsNode = Array.from(node.children).find(
      (item) => item.tagName.toLowerCase() === "offsets"
    );
    const offsets = offsetsNode
      ? Array.from(offsetsNode.children)
          .filter((item) => item.tagName.toLowerCase() === "offset")
          .map((item) => item.textContent?.trim() ?? "")
          .filter(Boolean)
          .map((value) =>
            value.startsWith("-")
              ? `-0x${value.slice(1).replace(/^0x/i, "").toUpperCase()}`
              : `0x${value.replace(/^0x/i, "").toUpperCase()}`
          )
      : [];

    const lastState = Array.from(node.children).find(
      (item) => item.tagName.toLowerCase() === "laststate"
    );
    const storedValue = lastState?.getAttribute("Value")?.trim() || "0";

    if ("moduleName" in address && !inferredProcess) {
      inferredProcess = address.moduleName;
    }

    const processName =
      selectedProcessName ||
      inferredProcess ||
      ("moduleName" in address ? address.moduleName : "");

    const entry: TrainerEntry = {
      id: crypto.randomUUID(),
      label: cleanDescription(textOf(node, "Description")),
      pid: 0,
      processName,
      address:
        "absolute" in address ? address.absolute : "0x0",
      valueType: mappedType,
      value: storedValue,
      enabled: false
    };

    if ("moduleName" in address) {
      entry.pointerChain = {
        moduleName: address.moduleName,
        baseOffset: address.baseOffset,
        offsets
      };
    }

    entries.push(entry);
  }

  if (!entries.length) {
    throw new Error(
      "No compatible data entries found. Recode intentionally skips Auto Assembler/Lua/script entries and unsupported value types."
    );
  }

  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    name: `Cheat Engine import — ${inferredProcess || "table"}`,
    processName: inferredProcess,
    trainers: entries,
    createdAt: timestamp,
    updatedAt: timestamp,
    formatVersion: 1
  };
}
