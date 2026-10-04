use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::State;

use crate::models::{
    AddressMatch, ProcessInfo, ScanSession, ScanSummary, ValueType,
};
use crate::{platform, scanner};

pub struct AppState {
    scans: Mutex<HashMap<u64, ScanSession>>,
    next_id: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            scans: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }
    }
}

fn is_blocked_process(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        "easyanticheat",
        "easy anti-cheat",
        "battleye",
        "beservice",
        "bedaisy",
        "vgc.exe",
        "vgtray",
        "faceit",
        "ricochet",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn ensure_target_allowed(pid: u32, offline_confirmed: bool) -> Result<(), String> {
    if !offline_confirmed {
        return Err("Offline/single-player confirmation is required".to_string());
    }

    let process = platform::list_processes()?
        .into_iter()
        .find(|process| process.pid == pid)
        .ok_or_else(|| "Target process is no longer running".to_string())?;

    if is_blocked_process(&process.name) {
        return Err("Recode will not attach to anti-cheat/security processes".to_string());
    }

    Ok(())
}

fn summary(session_id: u64, session: &ScanSession) -> ScanSummary {
    ScanSummary {
        session_id,
        total_matches: session.addresses.len(),
        matches: session
            .addresses
            .iter()
            .map(|address| AddressMatch {
                address: format!("0x{address:X}"),
            })
            .collect(),
        truncated: session.truncated,
        scanned_bytes: session.scanned_bytes,
    }
}

fn parse_address(address: &str) -> Result<usize, String> {
    let trimmed = address.trim();
    let hex = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
        .unwrap_or(trimmed);

    usize::from_str_radix(hex, 16).map_err(|_| "Invalid memory address".to_string())
}

#[tauri::command]
pub fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    let mut processes = platform::list_processes()?;
    processes.retain(|process| !is_blocked_process(&process.name));
    processes.sort_by(|a, b| {
        a.name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase())
            .then(a.pid.cmp(&b.pid))
    });
    Ok(processes)
}

#[tauri::command]
pub fn start_scan(
    state: State<'_, AppState>,
    pid: u32,
    value: String,
    value_type: String,
    offline_confirmed: bool,
) -> Result<ScanSummary, String> {
    ensure_target_allowed(pid, offline_confirmed)?;

    let parsed_type = ValueType::parse(&value_type)?;
    let pattern = scanner::encode_value(&value, parsed_type)?;
    let regions = platform::readable_regions(pid)?;
    let (addresses, truncated, scanned_bytes) =
        scanner::first_scan(pid, &pattern, &regions)?;

    let session_id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let session = ScanSession {
        pid,
        value_type: parsed_type,
        addresses,
        truncated,
        scanned_bytes,
    };

    let result = summary(session_id, &session);
    state
        .scans
        .lock()
        .map_err(|_| "Scan state is unavailable".to_string())?
        .insert(session_id, session);

    Ok(result)
}

#[tauri::command]
pub fn rescan(
    state: State<'_, AppState>,
    session_id: u64,
    value: String,
) -> Result<ScanSummary, String> {
    let mut scans = state
        .scans
        .lock()
        .map_err(|_| "Scan state is unavailable".to_string())?;

    let session = scans
        .get_mut(&session_id)
        .ok_or_else(|| "Scan session was not found".to_string())?;

    let pattern = scanner::encode_value(&value, session.value_type)?;
    session.addresses = scanner::rescan(session.pid, &session.addresses, &pattern);
    session.truncated = false;

    Ok(summary(session_id, session))
}

#[tauri::command]
pub fn write_value(
    pid: u32,
    address: String,
    value: String,
    value_type: String,
    offline_confirmed: bool,
) -> Result<(), String> {
    ensure_target_allowed(pid, offline_confirmed)?;

    let address = parse_address(&address)?;
    let value_type = ValueType::parse(&value_type)?;
    let bytes = scanner::encode_value(&value, value_type)?;
    platform::write_memory(pid, address, &bytes)
}

#[tauri::command]
pub fn clear_scan(state: State<'_, AppState>, session_id: u64) -> Result<(), String> {
    state
        .scans
        .lock()
        .map_err(|_| "Scan state is unavailable".to_string())?
        .remove(&session_id);
    Ok(())
}
