use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;

use libc::{iovec, process_vm_readv, process_vm_writev};

use crate::models::{MemoryRegion, ProcessInfo, ProcessModule};

pub fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    let entries = fs::read_dir("/proc").map_err(|error| error.to_string())?;
    let mut output = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(raw_pid) = file_name.to_str() else {
            continue;
        };
        let Ok(pid) = raw_pid.parse::<u32>() else {
            continue;
        };

        let name = fs::read_to_string(format!("/proc/{pid}/comm"))
            .map(|value| value.trim().to_string())
            .unwrap_or_else(|_| raw_pid.to_string());

        let path = fs::read_link(format!("/proc/{pid}/exe"))
            .ok()
            .map(|value| value.to_string_lossy().into_owned());

        output.push(ProcessInfo { pid, name, path });
    }

    Ok(output)
}

pub fn list_modules(pid: u32) -> Result<Vec<ProcessModule>, String> {
    let maps = fs::read_to_string(format!("/proc/{pid}/maps"))
        .map_err(|error| format!("Unable to read process maps: {error}"))?;

    let mut ranges: HashMap<String, (usize, usize)> = HashMap::new();

    for line in maps.lines() {
        let mut parts = line.split_whitespace();
        let Some(range) = parts.next() else { continue };
        let _perms = parts.next();
        let _offset = parts.next();
        let _device = parts.next();
        let _inode = parts.next();
        let Some(path) = parts.next() else { continue };

        if !path.starts_with('/') {
            continue;
        }

        let Some((start, end)) = range.split_once('-') else {
            continue;
        };
        let Ok(start) = usize::from_str_radix(start, 16) else {
            continue;
        };
        let Ok(end) = usize::from_str_radix(end, 16) else {
            continue;
        };

        ranges
            .entry(path.to_string())
            .and_modify(|entry| {
                entry.0 = entry.0.min(start);
                entry.1 = entry.1.max(end);
            })
            .or_insert((start, end));
    }

    let mut modules: Vec<ProcessModule> = ranges
        .into_iter()
        .map(|(path, (start, end))| {
            let name = Path::new(&path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(&path)
                .to_string();

            ProcessModule {
                name,
                path,
                base_address: format!("0x{start:X}"),
                size: end.saturating_sub(start) as u64,
            }
        })
        .collect();

    modules.sort_by_key(|module| {
        usize::from_str_radix(module.base_address.trim_start_matches("0x"), 16).unwrap_or(0)
    });
    Ok(modules)
}

pub fn readable_regions(pid: u32) -> Result<Vec<MemoryRegion>, String> {
    let maps = fs::read_to_string(format!("/proc/{pid}/maps"))
        .map_err(|error| format!("Unable to read process maps: {error}"))?;

    let mut regions = Vec::new();

    for line in maps.lines() {
        let mut parts = line.split_whitespace();
        let Some(range) = parts.next() else {
            continue;
        };
        let Some(perms) = parts.next() else {
            continue;
        };

        if !perms.starts_with('r') {
            continue;
        }

        let Some((start, end)) = range.split_once('-') else {
            continue;
        };

        let Ok(start) = usize::from_str_radix(start, 16) else {
            continue;
        };
        let Ok(end) = usize::from_str_radix(end, 16) else {
            continue;
        };

        if end <= start {
            continue;
        }

        regions.push(MemoryRegion {
            start,
            size: end - start,
            writable: perms.as_bytes().get(1) == Some(&b'w'),
        });
    }

    Ok(regions)
}

pub fn read_memory(pid: u32, address: usize, size: usize) -> Result<Vec<u8>, String> {
    if size == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u8; size];

    let local = iovec {
        iov_base: buffer.as_mut_ptr().cast(),
        iov_len: size,
    };
    let remote = iovec {
        iov_base: address as *mut _,
        iov_len: size,
    };

    let read = unsafe {
        process_vm_readv(
            pid as libc::pid_t,
            &local,
            1,
            &remote,
            1,
            0,
        )
    };

    if read < 0 {
        return Err(io::Error::last_os_error().to_string());
    }

    buffer.truncate(read as usize);
    Ok(buffer)
}

pub fn write_memory(pid: u32, address: usize, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Ok(());
    }

    let local = iovec {
        iov_base: bytes.as_ptr() as *mut _,
        iov_len: bytes.len(),
    };
    let remote = iovec {
        iov_base: address as *mut _,
        iov_len: bytes.len(),
    };

    let written = unsafe {
        process_vm_writev(
            pid as libc::pid_t,
            &local,
            1,
            &remote,
            1,
            0,
        )
    };

    if written < 0 {
        return Err(io::Error::last_os_error().to_string());
    }

    if written as usize != bytes.len() {
        return Err(format!(
            "Only wrote {written} of {} bytes",
            bytes.len()
        ));
    }

    Ok(())
}
