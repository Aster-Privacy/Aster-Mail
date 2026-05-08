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
use std::collections::HashMap;

use arti_client::TorClient;
use hyper::Body;
use serde::Serialize;
use tls_api::TlsConnector as _;
use tls_api::TlsConnectorBuilder as _;

fn is_header_allowed(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    matches!(
        n.as_str(),
        "content-type"
            | "content-length"
            | "accept"
            | "accept-language"
            | "accept-encoding"
            | "authorization"
            | "x-csrf-token"
            | "x-requested-with"
            | "x-device-id"
            | "if-none-match"
            | "if-modified-since"
            | "user-agent"
    ) || n.starts_with("x-aster-")
}

#[derive(Debug, Serialize)]
pub struct TorFetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

pub async fn execute_tor_request(
    client: &TorClient<tor_rtcompat::PreferredRuntime>,
    url: &str,
    method: &str,
    headers: &HashMap<String, String>,
    body: Option<&str>,
) -> Result<TorFetchResponse, String> {
    const CANONICAL_API_ONION: &str = "kvwjvhbeoaxmv5hece4mhcigurxv33bmnhzvdqsddtaovkxm6pqpubqd.onion";
    const ALLOWED_HTTPS_SUFFIXES: &[&str] = &[".astermail.org", ".astermail.com"];
    const ALLOWED_HTTPS_EXACT: &[&str] = &["astermail.org", "astermail.com"];
    const ALLOWED_METHODS: &[&str] = &[
        "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
    ];
    const MAX_REQUEST_BODY_SIZE: usize = 10 * 1024 * 1024;

    let parsed_uri: hyper::Uri = url
        .parse()
        .map_err(|e| format!("invalid url: {e}"))?;
    let scheme = parsed_uri.scheme_str().unwrap_or("").to_ascii_lowercase();
    let raw_host = parsed_uri.host().unwrap_or("").to_ascii_lowercase();
    let host = raw_host.trim_end_matches('.');

    if host.is_empty() {
        return Err("url has no host".to_string());
    }

    let is_onion_host = host.ends_with(".onion");
    let is_https = scheme == "https";
    let is_http_onion = scheme == "http" && is_onion_host;

    if !is_https && !is_http_onion {
        return Err("only https and http://*.onion URLs are allowed over Tor".to_string());
    }

    if is_onion_host && host != CANONICAL_API_ONION {
        return Err("onion host does not match the canonical Aster API onion".to_string());
    }

    let host_allowed = if is_onion_host {
        host == CANONICAL_API_ONION
    } else {
        ALLOWED_HTTPS_EXACT.iter().any(|h| *h == host)
            || ALLOWED_HTTPS_SUFFIXES.iter().any(|s| host.ends_with(s))
    };

    if !host_allowed {
        return Err("host not in tor_fetch allowlist".to_string());
    }

    if !ALLOWED_METHODS
        .iter()
        .any(|m| m.eq_ignore_ascii_case(method))
    {
        return Err(format!("method not allowed: {method}"));
    }

    if let Some(b) = body {
        if b.len() > MAX_REQUEST_BODY_SIZE {
            return Err(format!(
                "request body too large: {} bytes exceeds 10MB limit",
                b.len()
            ));
        }
    }

    let tls_connector = tls_api_native_tls::TlsConnector::builder()
        .map_err(|e| format!("TLS connector build error: {e}"))?
        .build()
        .map_err(|e| format!("TLS connector error: {e}"))?;

    let connector = arti_hyper::ArtiHttpConnector::new(client.clone(), tls_connector);
    let http_client = hyper::Client::builder().build::<_, Body>(connector);

    let mut request_builder = hyper::Request::builder()
        .method(method)
        .uri(url);

    for (key, value) in headers {
        if !is_header_allowed(key) {
            continue;
        }
        request_builder = request_builder.header(key.as_str(), value.as_str());
    }

    let hyper_body = match body {
        Some(b) => Body::from(b.to_string()),
        None => Body::empty(),
    };

    let request = request_builder
        .body(hyper_body)
        .map_err(|e| format!("failed to build request: {e}"))?;

    let response: hyper::Response<Body> = http_client
        .request(request)
        .await
        .map_err(|e| format!("tor request failed: {e}"))?;

    let status = response.status().as_u16();

    let mut response_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            response_headers.insert(key.to_string(), v.to_string());
        }
    }

    const MAX_RESPONSE_SIZE: usize = 10 * 1024 * 1024;

    let body_bytes = hyper::body::to_bytes(response.into_body())
        .await
        .map_err(|e| format!("failed to read response body: {e}"))?;

    if body_bytes.len() > MAX_RESPONSE_SIZE {
        return Err(format!(
            "response body too large: {} bytes exceeds 10MB limit",
            body_bytes.len()
        ));
    }

    let body_str = String::from_utf8_lossy(&body_bytes).to_string();

    Ok(TorFetchResponse {
        status,
        headers: response_headers,
        body: body_str,
    })
}
