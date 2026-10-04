use crate::models::{MemoryRegion, ValueType};
use crate::platform;

const CHUNK_SIZE: usize = 1024 * 1024;
const MAX_MATCHES: usize = 25_000;
const MAX_SCAN_BYTES: u64 = 768 * 1024 * 1024;

pub fn encode_value(raw: &str, value_type: ValueType) -> Result<Vec<u8>, String> {
    let value = raw.trim();

    match value_type {
        ValueType::I32 => value
            .parse::<i32>()
            .map(|v| v.to_le_bytes().to_vec())
            .map_err(|_| "Expected a signed 32-bit integer".to_string()),
        ValueType::U32 => value
            .parse::<u32>()
            .map(|v| v.to_le_bytes().to_vec())
            .map_err(|_| "Expected an unsigned 32-bit integer".to_string()),
        ValueType::I64 => value
            .parse::<i64>()
            .map(|v| v.to_le_bytes().to_vec())
            .map_err(|_| "Expected a signed 64-bit integer".to_string()),
        ValueType::U64 => value
            .parse::<u64>()
            .map(|v| v.to_le_bytes().to_vec())
            .map_err(|_| "Expected an unsigned 64-bit integer".to_string()),
        ValueType::F32 => value
            .parse::<f32>()
            .map(|v| v.to_le_bytes().to_vec())
            .map_err(|_| "Expected a 32-bit floating-point value".to_string()),
        ValueType::F64 => value
            .parse::<f64>()
            .map(|v| v.to_le_bytes().to_vec())
            .map_err(|_| "Expected a 64-bit floating-point value".to_string()),
    }
}

fn find_pattern(buffer: &[u8], pattern: &[u8], base: usize, output: &mut Vec<usize>) {
    if pattern.is_empty() || buffer.len() < pattern.len() {
        return;
    }

    for index in 0..=buffer.len() - pattern.len() {
        if &buffer[index..index + pattern.len()] == pattern {
            output.push(base + index);
            if output.len() >= MAX_MATCHES {
                break;
            }
        }
    }
}

pub fn first_scan(
    pid: u32,
    pattern: &[u8],
    regions: &[MemoryRegion],
) -> Result<(Vec<usize>, bool, u64), String> {
    let mut addresses = Vec::new();
    let mut scanned_bytes = 0u64;
    let overlap = pattern.len().saturating_sub(1);

    for region in regions {
        if !region.writable {
            continue;
        }

        if scanned_bytes >= MAX_SCAN_BYTES || addresses.len() >= MAX_MATCHES {
            break;
        }

        let mut offset = 0usize;
        let mut previous_tail: Vec<u8> = Vec::new();

        while offset < region.size {
            if scanned_bytes >= MAX_SCAN_BYTES || addresses.len() >= MAX_MATCHES {
                break;
            }

            let remaining = region.size - offset;
            let desired = CHUNK_SIZE.min(remaining);

            let chunk = match platform::read_memory(pid, region.start + offset, desired) {
                Ok(bytes) if !bytes.is_empty() => bytes,
                _ => {
                    offset = offset.saturating_add(desired);
                    previous_tail.clear();
                    continue;
                }
            };

            scanned_bytes = scanned_bytes.saturating_add(chunk.len() as u64);

            let mut merged = Vec::with_capacity(previous_tail.len() + chunk.len());
            merged.extend_from_slice(&previous_tail);
            merged.extend_from_slice(&chunk);

            let merged_base = region
                .start
                .saturating_add(offset)
                .saturating_sub(previous_tail.len());

            find_pattern(&merged, pattern, merged_base, &mut addresses);

            let tail_start = merged.len().saturating_sub(overlap);
            previous_tail = merged[tail_start..].to_vec();

            let bytes_read = chunk.len();
            offset = offset.saturating_add(bytes_read.max(1));
            if bytes_read < desired {
                offset = offset.saturating_add(desired - bytes_read);
            }
        }
    }

    addresses.sort_unstable();
    addresses.dedup();

    let truncated = addresses.len() >= MAX_MATCHES || scanned_bytes >= MAX_SCAN_BYTES;
    Ok((addresses, truncated, scanned_bytes))
}

pub fn rescan(pid: u32, addresses: &[usize], pattern: &[u8]) -> Vec<usize> {
    addresses
        .iter()
        .copied()
        .filter(|address| {
            platform::read_memory(pid, *address, pattern.len())
                .map(|bytes| bytes == pattern)
                .unwrap_or(false)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_i32() {
        assert_eq!(
            encode_value("100", ValueType::I32).unwrap(),
            100i32.to_le_bytes()
        );
    }

    #[test]
    fn finds_pattern_offsets() {
        let mut matches = Vec::new();
        find_pattern(&[1, 2, 3, 2, 3], &[2, 3], 0x1000, &mut matches);
        assert_eq!(matches, vec![0x1001, 0x1003]);
    }
}
