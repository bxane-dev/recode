use std::collections::HashMap;
use std::mem::size_of;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::State;

use crate::models::{
    AddressMatch, PointerResolution, ProcessInfo, ProcessModule, ScanSession, ScanSummary,
    ValueType,
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

fn parse_offset(raw: &str) -> Result<i64, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    let (negative, body) = if let Some(value) = trimmed.strip_prefix('-') {
        (true, value)
    } else if let Some(value) = trimmed.strip_prefix('+') {
        (false, value)
    } else {
        (false, trimmed)
    };

    let parsed = if let Some(hex) = body.strip_prefix("0x").or_else(|| body.strip_prefix("0X")) {
        i64::from_str_radix(hex, 16)
    } else {
        body.parse::<i64>()
    }
    .map_err(|_| format!("Invalid pointer offset: {raw}"))?;

    Ok(if negative { -parsed } else { parsed })
}

fn add_offset(address: usize, offset: i64) -> Result<usize, String> {
    if offset >= 0 {
        address
            .checked_add(offset as usize)
            .ok_or_else(|| "Pointer address overflowed".to_string())
    } else {
        address
            .checked_sub(offset.unsigned_abs() as usize)
            .ok_or_else(|| "Pointer address underflowed".to_string())
    }
}

fn read_pointer(pid: u32, address: usize) -> Result<usize, String> {
    let width = size_of::<usize>();
    let bytes = platform::read_memory(pid, address, width)?;
    if bytes.len() != width {
        return Err(format!("Could not read a complete {width}-byte pointer at 0x{address:X}"));
    }

    let mut buffer = [0u8; size_of::<usize>()];
    buffer.copy_from_slice(&bytes);
    let value = usize::from_le_bytes(buffer);

    if value == 0 {
        return Err(format!("Pointer at 0x{address:X} resolved to null"));
    }

    Ok(value)
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
pub fn list_modules(
    pid: u32,
    offline_confirmed: bool,
) -> Result<Vec<ProcessModule>, String> {
    ensure_target_allowed(pid, offline_confirmed)?;
    platform::list_modules(pid)
}

#[tauri::command]
pub fn resolve_pointer_chain(
    pid: u32,
    module_name: String,
    base_offset: String,
    offsets: Vec<String>,
    offline_confirmed: bool,
) -> Result<PointerResolution, String> {
    ensure_target_allowed(pid, offline_confirmed)?;

    if offsets.len() > 16 {
        return Err("Pointer chains are limited to 16 offsets".to_string());
    }

    let modules = platform::list_modules(pid)?;
    let module = modules
        .iter()
        .find(|module| module.name.eq_ignore_ascii_case(module_name.trim()))
        .or_else(|| {
            modules.iter().find(|module| {
                module
                    .path
                    .to_ascii_lowercase()
                    .ends_with(&module_name.trim().to_ascii_lowercase())
            })
        })
        .ok_or_else(|| format!("Module not found: {module_name}"))?;

    let module_base = parse_address(&module.base_address)?;
    let mut current = add_offset(module_base, parse_offset(&base_offset)?)?;
    let mut steps = vec![format!(
        "{} {} {} = 0x{current:X}",
        module.name,
        if parse_offset(&base_offset)? >= 0 { "+" } else { "-" },
        base_offset.trim_start_matches(['+', '-'])
    )];

    for raw_offset in offsets {
        let pointer = read_pointer(pid, current)?;
        let offset = parse_offset(&raw_offset)?;
        let next = add_offset(pointer, offset)?;
        steps.push(format!(
            "*(0x{current:X}) = 0x{pointer:X}; {:+#X} => 0x{next:X}",
            offset
        ));
        current = next;
    }

    Ok(PointerResolution {
        address: format!("0x{current:X}"),
        module_base: module.base_address.clone(),
        steps,
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hex_offsets() {
        assert_eq!(parse_offset("0x20").unwrap(), 0x20);
        assert_eq!(parse_offset("-0x10").unwrap(), -0x10);
    }

    #[test]
    fn applies_signed_offsets() {
        assert_eq!(add_offset(0x1000, 0x20).unwrap(), 0x1020);
        assert_eq!(add_offset(0x1000, -0x20).unwrap(), 0x0fe0);
    }
}
