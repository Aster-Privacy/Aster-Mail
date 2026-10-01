//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
use std::time::Duration;

use tauri::ipc::Response;

const ASSET_BASE: &str = "https://app.astermail.org/bergamot/models/v1/";
const MAX_ASSET_BYTES: usize = 128 * 1024 * 1024;
const MAX_NAME_LENGTH: usize = 200;
const MAX_SEGMENT_LENGTH: usize = 128;
const MAX_SEGMENTS: usize = 2;
const ASSET_TIMEOUT: Duration = Duration::from_secs(900);

fn is_safe_segment(segment: &str) -> bool {
    if segment.is_empty() || segment.len() > MAX_SEGMENT_LENGTH || segment.contains("..") {
        return false;
    }

    let starts_clean = segment
        .chars()
        .next()
        .map(|c| c.is_ascii_alphanumeric())
        .unwrap_or(false);

    starts_clean
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

pub fn is_safe_asset_name(name: &str) -> bool {
    if name.is_empty() || name.len() > MAX_NAME_LENGTH {
        return false;
    }

    let segments: Vec<&str> = name.split('/').collect();

    segments.len() <= MAX_SEGMENTS && segments.iter().all(|segment| is_safe_segment(segment))
}

#[tauri::command]
pub async fn fetch_translation_asset(name: String) -> Result<Response, String> {
    if !is_safe_asset_name(&name) {
        return Err("translation asset name not allowed".to_string());
    }

    let url = reqwest::Url::parse(&format!("{ASSET_BASE}{name}"))
        .map_err(|_| "translation asset url invalid".to_string())?;
    let client = crate::http_client::shared_pinned_client()?;
    let mut response = client
        .get(url)
        .timeout(ASSET_TIMEOUT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "translation asset returned {}",
            response.status().as_u16()
        ));
    }

    if response
        .content_length()
        .map(|length| length > MAX_ASSET_BYTES as u64)
        .unwrap_or(false)
    {
        return Err("translation asset too large".to_string());
    }

    let mut bytes: Vec<u8> = Vec::new();

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > MAX_ASSET_BYTES {
            return Err("translation asset too large".to_string());
        }

        bytes.extend_from_slice(&chunk);
    }

    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::is_safe_asset_name;

    #[test]
    fn accepts_registry_and_model_files() {
        assert!(is_safe_asset_name("registry.json"));
        assert!(is_safe_asset_name("esen/model.esen.intgemm.alphas.bin"));
        assert!(is_safe_asset_name("aren/vocab.aren.spm"));
    }

    #[test]
    fn rejects_traversal_and_foreign_targets() {
        assert!(!is_safe_asset_name(""));
        assert!(!is_safe_asset_name("../registry.json"));
        assert!(!is_safe_asset_name("esen/../../api/core/v1/me"));
        assert!(!is_safe_asset_name("esen/..model.bin"));
        assert!(!is_safe_asset_name("/etc/passwd"));
        assert!(!is_safe_asset_name("esen//model.bin"));
        assert!(!is_safe_asset_name("a/b/c.bin"));
        assert!(!is_safe_asset_name("https://example.com/model.bin"));
        assert!(!is_safe_asset_name("esen/model.bin?x=1"));
        assert!(!is_safe_asset_name("esen/model.bin#frag"));
        assert!(!is_safe_asset_name("esen\\model.bin"));
        assert!(!is_safe_asset_name("esen/%2e%2e/model.bin"));
        assert!(!is_safe_asset_name(&"a".repeat(201)));
    }
}
