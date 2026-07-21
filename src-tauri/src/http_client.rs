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
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::WebPkiServerVerifier;
use rustls::crypto::ring;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use x509_parser::prelude::*;

const PIN_B64_SET: &[&str] = &[
    "DDf/bfpXnW80wMM5Y2b9zNCdohxBo5lX7rUMiw+DYO4=",
    "fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=",
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
    "diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=",
    "ZtbEdP4fXOZh79o7Pf8qXXNlIKRpQNBzxoh/UgnQ2Qc=",
    "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=",
    "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
];

const PINNED_SUFFIXES: &[&str] = &[".astermail.org", ".astermail.com"];
const PINNED_EXACT: &[&str] = &["astermail.org", "astermail.com"];

#[derive(Debug)]
struct PinnedVerifier {
    delegate: Arc<WebPkiServerVerifier>,
    pins: Vec<[u8; 32]>,
}

impl PinnedVerifier {
    fn new() -> Result<Arc<Self>, String> {
        let provider = Arc::new(ring::default_provider());
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let delegate = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider)
            .build()
            .map_err(|e| format!("webpki verifier: {e}"))?;
        let pins = PIN_B64_SET
            .iter()
            .map(|b64| decode_pin(b64))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Arc::new(Self { delegate, pins }))
    }
}

fn decode_pin(b64: &str) -> Result<[u8; 32], String> {
    let bytes = STANDARD.decode(b64).map_err(|e| format!("pin decode: {e}"))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "pin must be 32 bytes".to_string())?;
    Ok(arr)
}

fn host_requires_pin(server_name: &ServerName<'_>) -> bool {
    match server_name {
        ServerName::DnsName(dns) => {
            let host = dns.as_ref().to_ascii_lowercase();
            let host = host.trim_end_matches('.');
            PINNED_EXACT.iter().any(|e| host == *e)
                || PINNED_SUFFIXES.iter().any(|s| host.ends_with(*s))
        }
        _ => false,
    }
}

fn spki_sha256(cert_der: &[u8]) -> Result<[u8; 32], rustls::Error> {
    let (_, cert) = X509Certificate::from_der(cert_der)
        .map_err(|_| rustls::Error::General("cert parse".into()))?;
    let spki = cert.tbs_certificate.subject_pki.raw;
    let digest = Sha256::digest(spki);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    Ok(out)
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        self.delegate.verify_server_cert(
            end_entity,
            intermediates,
            server_name,
            ocsp_response,
            now,
        )?;

        if !host_requires_pin(server_name) {
            return Ok(ServerCertVerified::assertion());
        }

        let mut matched = false;
        for cert_der in std::iter::once(end_entity).chain(intermediates.iter()) {
            let observed = spki_sha256(cert_der.as_ref())?;
            if self
                .pins
                .iter()
                .any(|pin| pin.ct_eq(&observed).unwrap_u8() == 1)
            {
                matched = true;
                break;
            }
        }

        if matched {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General("pin mismatch".into()))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.delegate.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.delegate.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.delegate.supported_verify_schemes()
    }
}

fn build_rustls_config() -> Result<ClientConfig, String> {
    let verifier = PinnedVerifier::new()?;
    let provider = Arc::new(ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("protocol versions: {e}"))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    Ok(config)
}

pub fn build_pinned_client(timeout: Duration) -> Result<reqwest::Client, String> {
    let tls = build_rustls_config()?;
    reqwest::Client::builder()
        .no_proxy()
        .timeout(timeout)
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .use_preconfigured_tls(tls)
        .build()
        .map_err(|e| e.to_string())
}

static SHARED_PINNED_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn shared_pinned_client() -> Result<reqwest::Client, String> {
    if let Some(client) = SHARED_PINNED_CLIENT.get() {
        return Ok(client.clone());
    }
    let client = build_pinned_client(Duration::from_secs(30))?;
    let _ = SHARED_PINNED_CLIENT.set(client.clone());
    Ok(SHARED_PINNED_CLIENT
        .get()
        .cloned()
        .unwrap_or(client))
}
