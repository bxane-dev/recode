use std::mem::{size_of, zeroed};

use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Memory::{
    VirtualQueryEx, MEMORY_BASIC_INFORMATION, MEM_COMMIT, PAGE_EXECUTE_READWRITE,
    PAGE_EXECUTE_WRITECOPY, PAGE_GUARD, PAGE_NOACCESS, PAGE_READWRITE, PAGE_WRITECOPY,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_INFORMATION,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_OPERATION, PROCESS_VM_READ,
    PROCESS_VM_WRITE,
};

use crate::models::{MemoryRegion, ProcessInfo};

fn utf16_to_string(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

fn process_path(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }

    let mut buffer = vec![0u16; 32_768];
    let mut len = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len) };
    unsafe { CloseHandle(handle) };

    if ok == 0 {
        return None;
    }

    buffer.truncate(len as usize);
    Some(String::from_utf16_lossy(&buffer))
}

pub fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err("Unable to create a process snapshot".to_string());
    }

    let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;

    let mut output = Vec::new();
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) };

    while ok != 0 {
        let pid = entry.th32ProcessID;
        let name = utf16_to_string(&entry.szExeFile);

        if pid != 0 && !name.is_empty() {
            output.push(ProcessInfo {
                pid,
                name,
                path: process_path(pid),
            });
        }

        ok = unsafe { Process32NextW(snapshot, &mut entry) };
    }

    unsafe { CloseHandle(snapshot) };
    Ok(output)
}

fn open_for_read(pid: u32) -> Result<*mut core::ffi::c_void, String> {
    let handle = unsafe {
        OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            0,
            pid,
        )
    };

    if handle.is_null() {
        Err("Unable to open the target process for reading".to_string())
    } else {
        Ok(handle)
    }
}

pub fn readable_regions(pid: u32) -> Result<Vec<MemoryRegion>, String> {
    let handle = open_for_read(pid)?;
    let mut output = Vec::new();
    let mut address = 0usize;

    loop {
        let mut info: MEMORY_BASIC_INFORMATION = unsafe { zeroed() };
        let queried = unsafe {
            VirtualQueryEx(
                handle,
                address as *const _,
                &mut info,
                size_of::<MEMORY_BASIC_INFORMATION>(),
            )
        };

        if queried == 0 {
            break;
        }

        let protect = info.Protect;
        let readable =
            info.State == MEM_COMMIT && protect != PAGE_NOACCESS && (protect & PAGE_GUARD) == 0;

        if readable && info.RegionSize > 0 {
            let writable = matches!(
                protect & 0xff,
                PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY
            );

            output.push(MemoryRegion {
                start: info.BaseAddress as usize,
                size: info.RegionSize,
                writable,
            });
        }

        let next = (info.BaseAddress as usize).saturating_add(info.RegionSize);
        if next <= address {
            break;
        }
        address = next;
    }

    unsafe { CloseHandle(handle) };
    Ok(output)
}

pub fn read_memory(pid: u32, address: usize, size: usize) -> Result<Vec<u8>, String> {
    if size == 0 {
        return Ok(Vec::new());
    }

    let handle = open_for_read(pid)?;
    let mut buffer = vec![0u8; size];
    let mut read = 0usize;

    let ok = unsafe {
        ReadProcessMemory(
            handle,
            address as *const _,
            buffer.as_mut_ptr().cast(),
            size,
            &mut read,
        )
    };

    unsafe { CloseHandle(handle) };

    if ok == 0 && read == 0 {
        return Err("Unable to read target memory".to_string());
    }

    buffer.truncate(read);
    Ok(buffer)
}

pub fn write_memory(pid: u32, address: usize, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Ok(());
    }

    let handle = unsafe {
        OpenProcess(
            PROCESS_VM_OPERATION | PROCESS_VM_WRITE,
            0,
            pid,
        )
    };

    if handle.is_null() {
        return Err("Unable to open the target process for writing".to_string());
    }

    let mut written = 0usize;
    let ok = unsafe {
        WriteProcessMemory(
            handle,
            address as *mut _,
            bytes.as_ptr().cast(),
            bytes.len(),
            &mut written,
        )
    };

    unsafe { CloseHandle(handle) };

    if ok == 0 || written != bytes.len() {
        return Err("Unable to write the complete value".to_string());
    }

    Ok(())
}
