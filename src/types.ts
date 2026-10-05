export type ValueType = "i32" | "u32" | "i64" | "u64" | "f32" | "f64";

export interface InstalledGame {
  id: string;
  store: "Steam" | "GOG" | "Epic Games" | string;
  name: string;
  installPath: string;
  executable: string | null;
}

export interface RecodeSettings {
  autoDetectStores: boolean;
  autoDownloadCompatible: boolean;
  rememberCheatSelection: boolean;
}

export interface DetectedFramework {
  id: string;
  name: string;
  detected: boolean;
  confidence: "high" | "possible";
  rootPath: string | null;
  marker: string | null;
  capabilities: string[];
  officialUrl: string;
}

export interface FrameworkRequirement {
  id: string;
  name?: string;
  required?: boolean;
  minVersion?: string;
  capabilities?: string[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  path: string | null;
}

export interface ProcessModule {
  name: string;
  path: string;
  base_address: string;
  size: number;
}

export interface PointerResolution {
  address: string;
  module_base: string;
  steps: string[];
}

export interface PointerChainConfig {
  moduleName: string;
  baseOffset: string;
  offsets: string[];
}

export interface SignatureResolution {
  address: string;
  match_address: string;
  module_base: string;
  occurrence: number;
}

export interface SignatureConfig {
  moduleName: string;
  pattern: string;
  matchOffset: string;
  occurrence: number;
}

export interface AddressMatch {
  address: string;
}

export interface ScanSummary {
  session_id: number;
  matches: AddressMatch[];
  total_matches: number;
  truncated: boolean;
  scanned_bytes: number;
}

export interface TrainerEntry {
  id: string;
  label: string;
  pid: number;
  processName: string;
  address: string;
  valueType: ValueType;
  value: string;
  enabled: boolean;
  hotkey?: string;
  pointerChain?: PointerChainConfig;
  signature?: SignatureConfig;
}

export interface TrainerProfile {
  id: string;
  name: string;
  processName: string;
  frameworks?: FrameworkRequirement[];
  trainers: TrainerEntry[];
  createdAt: string;
  updatedAt: string;
  formatVersion: 1;
}

export interface TrainerProfileFile {
  schema: "recode.trainer-profile";
  version: 1;
  profile: TrainerProfile;
}

export interface HubEntry {
  id: string;
  title: string;
  game: string;
  processNames: string[];
  description?: string;
  author?: string;
  profileUrl: string;
  sourceUrl?: string;
  verified?: boolean;
  tags?: string[];
}

export interface HubCatalog {
  schema: "recode.hub";
  version: 1;
  entries: HubEntry[];
}
