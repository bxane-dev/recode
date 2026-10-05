import { invoke } from "@tauri-apps/api/core";
import type {
  DetectedFramework,
  InstalledGame,
  PointerResolution,
  ProcessInfo,
  ProcessModule,
  ScanSummary,
  SignatureResolution,
  ValueType
} from "../types";

export const scanInstalledGames = () =>
  invoke<InstalledGame[]>("scan_installed_games");

export const detectModFrameworks = (
  installPath: string,
  executable: string | null
) =>
  invoke<DetectedFramework[]>("detect_mod_frameworks", {
    installPath,
    executable
  });

export const listProcesses = () => invoke<ProcessInfo[]>("list_processes");

export const listModules = (pid: number, offlineConfirmed: boolean) =>
  invoke<ProcessModule[]>("list_modules", { pid, offlineConfirmed });

export const resolvePointerChain = (
  pid: number,
  moduleName: string,
  baseOffset: string,
  offsets: string[],
  offlineConfirmed: boolean
) =>
  invoke<PointerResolution>("resolve_pointer_chain", {
    pid,
    moduleName,
    baseOffset,
    offsets,
    offlineConfirmed
  });

export const findSignature = (
  pid: number,
  moduleName: string,
  pattern: string,
  matchOffset: string,
  occurrence: number,
  offlineConfirmed: boolean
) =>
  invoke<SignatureResolution>("find_signature", {
    pid,
    moduleName,
    pattern,
    matchOffset,
    occurrence,
    offlineConfirmed
  });

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

export const readProfileFile = (path: string) =>
  invoke<string>("read_profile_file", { path });

export const writeProfileFile = (path: string, content: string) =>
  invoke<void>("write_profile_file", { path, content });


export const generateAiTrainer = (
  provider: "openai" | "anthropic" | "gemini" | "compatible",
  apiKey: string,
  model: string,
  endpoint: string | null,
  prompt: string
) =>
  invoke<string>("generate_ai_trainer", {
    provider,
    apiKey,
    model,
    endpoint,
    prompt
  });
