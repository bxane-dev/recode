import { invoke } from "@tauri-apps/api/core";
import type { ProcessInfo, ScanSummary, ValueType } from "../types";

export const listProcesses = () => invoke<ProcessInfo[]>("list_processes");

export const startScan = (
  pid: number,
  value: string,
  valueType: ValueType,
  offlineConfirmed: boolean
) =>
  invoke<ScanSummary>("start_scan", {
    pid,
    value,
    valueType,
    offlineConfirmed
  });

export const rescan = (sessionId: number, value: string) =>
  invoke<ScanSummary>("rescan", { sessionId, value });

export const writeValue = (
  pid: number,
  address: string,
  value: string,
  valueType: ValueType,
  offlineConfirmed: boolean
) =>
  invoke<void>("write_value", {
    pid,
    address,
    value,
    valueType,
    offlineConfirmed
  });

export const clearScan = (sessionId: number) =>
  invoke<void>("clear_scan", { sessionId });
