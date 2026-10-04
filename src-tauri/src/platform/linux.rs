use std::fs;
use std::io;

use libc::{iovec, process_vm_readv, process_vm_writev};

use crate::models::{MemoryRegion, ProcessInfo};

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
