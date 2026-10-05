use std::time::Duration;

use reqwest::Client;
use serde_json::{json, Value};

const MAX_PROMPT_BYTES: usize = 128 * 1024;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

fn require_nonempty(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(())
    }
}

fn custom_endpoint_allowed(endpoint: &str) -> bool {
    let lower = endpoint.trim().to_ascii_lowercase();
    lower.starts_with("https://")
        || lower.starts_with("http://127.0.0.1")
        || lower.starts_with("http://localhost")
        || lower.starts_with("http://[::1]")
}

fn text_from_openai(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        if !text.trim().is_empty() {
            return Some(text.to_string());
        }
    }

    let mut chunks = Vec::new();
    for item in value.get("output")?.as_array()? {
        let Some(content) = item.get("content").and_then(Value::as_array) else {
            continue;
        };
        for part in content {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    chunks.push(text);
                }
            }
        }
    }

    if chunks.is_empty() { None } else { Some(chunks.join("\n")) }
}

fn text_from_anthropic(value: &Value) -> Option<String> {
    let mut chunks = Vec::new();
    for part in value.get("content")?.as_array()? {
        if let Some(text) = part.get("text").and_then(Value::as_str) {
            if !text.trim().is_empty() {
                chunks.push(text);
            }
        }
    }
    if chunks.is_empty() { None } else { Some(chunks.join("\n")) }
}

fn text_from_gemini(value: &Value) -> Option<String> {
    let parts = value
        .get("candidates")?
        .as_array()?
        .first()?
        .get("content")?
        .get("parts")?
        .as_array()?;

    let chunks: Vec<&str> = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .filter(|text| !text.trim().is_empty())
        .collect();

    if chunks.is_empty() { None } else { Some(chunks.join("\n")) }
}

fn text_from_compatible(value: &Value) -> Option<String> {
    value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| text_from_openai(value))
}

#[tauri::command]
pub async fn generate_ai_trainer(
    provider: String,
    api_key: String,
    model: String,
    endpoint: Option<String>,
    prompt: String,
) -> Result<String, String> {
    require_nonempty(&provider, "AI provider")?;
    require_nonempty(&model, "AI model")?;
    require_nonempty(&prompt, "AI request")?;

    if prompt.as_bytes().len() > MAX_PROMPT_BYTES {
        return Err("AI request is larger than 128 KB".to_string());
    }

    let provider_key = provider.trim().to_ascii_lowercase();
    if provider_key != "compatible" {
        require_nonempty(&api_key, "API key")?;
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Could not create AI client: {error}"))?;

    let response = match provider_key.as_str() {
        "openai" => client
            .post("https://api.openai.com/v1/responses")
            .bearer_auth(api_key.trim())
            .json(&json!({"model": model.trim(), "input": prompt}))
            .send()
            .await,
        "anthropic" => client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key.trim())
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": model.trim(),
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}]
            }))
            .send()
            .await,
        "gemini" => {
            let clean_model = model.trim().trim_start_matches("models/");
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"
            );
            client
                .post(url)
                .header("x-goog-api-key", api_key.trim())
                .json(&json!({
                    "contents": [{
                        "role": "user",
                        "parts": [{"text": prompt}]
                    }]
                }))
                .send()
                .await
        }
        "compatible" => {
            let endpoint = endpoint
                .as_deref()
                .ok_or_else(|| "Custom endpoint is required".to_string())?
                .trim();

            if !custom_endpoint_allowed(endpoint) {
                return Err(
                    "Custom endpoint must use HTTPS, or localhost/127.0.0.1 for a local model"
                        .to_string(),
                );
            }

            let mut request = client.post(endpoint);
            if !api_key.trim().is_empty() {
                request = request.bearer_auth(api_key.trim());
            }

            if endpoint.trim_end_matches('/').ends_with("/responses") {
                request
                    .json(&json!({"model": model.trim(), "input": prompt}))
                    .send()
                    .await
            } else {
                request
                    .json(&json!({
                        "model": model.trim(),
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2
                    }))
                    .send()
                    .await
            }
        }
        _ => return Err("Unsupported AI provider".to_string()),
    }
    .map_err(|error| format!("AI request failed: {error}"))?;

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| format!("Could not read AI response: {error}"))?;

    if raw.as_bytes().len() > MAX_RESPONSE_BYTES {
        return Err("AI response is larger than 2 MB".to_string());
    }

    if !status.is_success() {
        let short = raw.chars().take(1200).collect::<String>();
        return Err(format!("AI provider returned HTTP {status}: {short}"));
    }

    let parsed: Value =
        serde_json::from_str(&raw).map_err(|_| "AI provider returned invalid JSON".to_string())?;

    let output = match provider_key.as_str() {
        "openai" => text_from_openai(&parsed),
        "anthropic" => text_from_anthropic(&parsed),
        "gemini" => text_from_gemini(&parsed),
        "compatible" => text_from_compatible(&parsed),
        _ => None,
    }
    .ok_or_else(|| "AI provider response did not contain text output".to_string())?;

    if output.as_bytes().len() > MAX_RESPONSE_BYTES {
        return Err("AI text output is larger than 2 MB".to_string());
    }

    Ok(output)
}
