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

pub fn parse_signature(raw: &str) -> Result<Vec<Option<u8>>, String> {
    let mut pattern = Vec::new();
    let mut concrete = 0usize;

    for token in raw.split_whitespace() {
        if token == "?" || token == "??" {
            pattern.push(None);
            continue;
        }

        if token.len() != 2 {
            return Err(format!("Invalid signature byte: {token}"));
        }

        let byte = u8::from_str_radix(token, 16)
            .map_err(|_| format!("Invalid signature byte: {token}"))?;
        pattern.push(Some(byte));
        concrete += 1;
    }

    if pattern.len() < 3 {
        return Err("A signature must contain at least 3 bytes".to_string());
    }

    if concrete < 2 {
        return Err("A signature must contain at least 2 exact bytes".to_string());
    }

    Ok(pattern)
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

fn find_signature_pattern(
    buffer: &[u8],
    pattern: &[Option<u8>],
    base: usize,
    output: &mut Vec<usize>,
    max_matches: usize,
) {
    if pattern.is_empty() || buffer.len() < pattern.len() {
        return;
    }

    for index in 0..=buffer.len() - pattern.len() {
        let matched = pattern.iter().enumerate().all(|(offset, expected)| {
            expected.map(|byte| buffer[index + offset] == byte).unwrap_or(true)
        });

        if matched {
            output.push(base + index);
            if output.len() >= max_matches {
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

pub fn signature_scan(
    pid: u32,
    pattern: &[Option<u8>],
    regions: &[MemoryRegion],
    module_start: usize,
    module_size: usize,
    max_matches: usize,
) -> Result<Vec<usize>, String> {
    let module_end = module_start
        .checked_add(module_size)
        .ok_or_else(|| "Module address range overflowed".to_string())?;
    let max_matches = max_matches.clamp(1, 128);
    let overlap = pattern.len().saturating_sub(1);
    let mut matches = Vec::new();

    for region in regions {
        if matches.len() >= max_matches {
            break;
        }

        let region_end = region.start.saturating_add(region.size);
        let start = region.start.max(module_start);
        let end = region_end.min(module_end);

        if start >= end {
            continue;
        }

        let mut cursor = start;
        let mut previous_tail = Vec::new();

        while cursor < end && matches.len() < max_matches {
            let desired = CHUNK_SIZE.min(end - cursor);
            let chunk = match platform::read_memory(pid, cursor, desired) {
                Ok(bytes) if !bytes.is_empty() => bytes,
                _ => {
                    cursor = cursor.saturating_add(desired.max(1));
                    previous_tail.clear();
                    continue;
                }
            };

            let mut merged = Vec::with_capacity(previous_tail.len() + chunk.len());
            merged.extend_from_slice(&previous_tail);
            merged.extend_from_slice(&chunk);

            let base = cursor.saturating_sub(previous_tail.len());
            find_signature_pattern(&merged, pattern, base, &mut matches, max_matches);

            let tail_start = merged.len().saturating_sub(overlap);
            previous_tail = merged[tail_start..].to_vec();
            cursor = cursor.saturating_add(chunk.len().max(1));
        }
    }

    matches.sort_unstable();
    matches.dedup();
    matches.truncate(max_matches);
    Ok(matches)
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

    #[test]
    fn parses_signature_wildcards() {
        assert_eq!(
            parse_signature("48 8B ?? 10 ? FF").unwrap(),
            vec![Some(0x48), Some(0x8B), None, Some(0x10), None, Some(0xFF)]
        );
    }

    #[test]
    fn finds_signature_with_wildcards() {
        let pattern = parse_signature("48 8B ?? FF").unwrap();
        let mut matches = Vec::new();
        find_signature_pattern(
            &[0x90, 0x48, 0x8B, 0x12, 0xFF, 0x48, 0x8B, 0x34, 0xFF],
            &pattern,
            0x2000,
            &mut matches,
            8,
        );
        assert_eq!(matches, vec![0x2001, 0x2005]);
    }
}
