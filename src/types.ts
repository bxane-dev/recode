export type ValueType = "i32" | "u32" | "i64" | "u64" | "f32" | "f64";

export interface ProcessInfo {
  pid: number;
  name: string;
  path: string | null;
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
}
