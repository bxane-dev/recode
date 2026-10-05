use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedFramework {
    pub id: String,
    pub name: String,
    pub detected: bool,
    pub confidence: String,
    pub root_path: Option<String>,
    pub marker: Option<String>,
    pub capabilities: Vec<String>,
    pub official_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    pub id: String,
    pub store: String,
    pub name: String,
    pub install_path: String,
    pub executable: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessModule {
    pub name: String,
    pub path: String,
    pub base_address: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PointerResolution {
    pub address: String,
    pub module_base: String,
    pub steps: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SignatureResolution {
    pub address: String,
    pub match_address: String,
    pub module_base: String,
    pub occurrence: usize,
}

#[derive(Debug, Clone)]
pub struct MemoryRegion {
    pub start: usize,
    pub size: usize,
    pub writable: bool,
}

#[derive(Debug, Clone, Copy)]
pub enum ValueType {
    I32,
    U32,
    I64,
    U64,
    F32,
    F64,
}

impl ValueType {
    pub fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "i32" => Ok(Self::I32),
            "u32" => Ok(Self::U32),
            "i64" => Ok(Self::I64),
            "u64" => Ok(Self::U64),
            "f32" => Ok(Self::F32),
            "f64" => Ok(Self::F64),
            _ => Err(format!("Unsupported value type: {raw}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ScanSession {
    pub pid: u32,
    pub value_type: ValueType,
    pub addresses: Vec<usize>,
    pub truncated: bool,
    pub scanned_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct AddressMatch {
    pub address: String,
}

#[derive(Debug, Serialize)]
pub struct ScanSummary {
    pub session_id: u64,
    pub matches: Vec<AddressMatch>,
    pub total_matches: usize,
    pub truncated: bool,
    pub scanned_bytes: u64,
}
