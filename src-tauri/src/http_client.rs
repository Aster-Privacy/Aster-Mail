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
use webpki::{EndEntityCert, KeyUsage, VerifiedPath};

const PIN_B64_SET: &[&str] = &[
    "DDf/bfpXnW80wMM5Y2b9zNCdohxBo5lX7rUMiw+DYO4=",
    "fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=",
    "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
    "diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=",
    "ZtbEdP4fXOZh79o7Pf8qXXNlIKRpQNBzxoh/UgnQ2Qc=",
    "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=",
    "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
    "hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=",
    "Vfd95BwDeSQo+NUYxVEEIlvkOlWY2SalKK1lPhzOx78=",
    "QXnt2YHvdHR3tJYmQIr0Paosp6t/nggsEGD4QJZ3Q0g=",
    "K89VOmb1cJAN3TK6bf4ezAbJGC1mLcG2Dh97dnwr3VQ=",
    "G/ANXI8TwJTdF+AFBM8IiIUPEv0Gf6H5LA/b9guG4yE=",
    "0cRTd+vc1hjNFlHcLgLCHXUeWqn80bNDH/bs9qMTSPo=",
    "oyD01TTXvpfBro3QSZc1vIlcMjrdLTiL/M9mLCPX+Zo=",
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
        Self::with_pin_set(PIN_B64_SET)
    }

    fn with_pin_set(pin_b64_set: &[&str]) -> Result<Arc<Self>, String> {
        let provider = Arc::new(ring::default_provider());
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let delegate = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider)
            .build()
            .map_err(|e| format!("webpki verifier: {e}"))?;
        let pins = pin_b64_set
            .iter()
            .map(|b64| decode_pin(b64))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Arc::new(Self { delegate, pins }))
    }

    fn pin_matches(&self, observed: &[u8; 32]) -> bool {
        self.pins
            .iter()
            .any(|pin| pin.ct_eq(observed).unwrap_u8() == 1)
    }

    fn path_hits_pin(&self, path: &VerifiedPath<'_>) -> bool {
        let leaf = sha256_32(path.end_entity().subject_public_key_info().as_ref());
        if self.pin_matches(&leaf) {
            return true;
        }
        if path
            .intermediate_certificates()
            .any(|cert| self.pin_matches(&sha256_32(cert.subject_public_key_info().as_ref())))
        {
            return true;
        }
        let anchor = wrap_der_sequence(path.anchor().subject_public_key_info.as_ref());
        self.pin_matches(&sha256_32(&anchor))
    }

    fn verify_pinned_path(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        now: UnixTime,
    ) -> Result<(), rustls::Error> {
        let cert = EndEntityCert::try_from(end_entity)
            .map_err(|_| rustls::Error::General("cert parse".into()))?;
        let algorithms = ring::default_provider()
            .signature_verification_algorithms
            .all;
        let path_check = |path: &VerifiedPath<'_>| {
            if self.path_hits_pin(path) {
                Ok(())
            } else {
                Err(webpki::Error::UnknownIssuer)
            }
        };
        cert.verify_for_usage(
            algorithms,
            webpki_roots::TLS_SERVER_ROOTS,
            intermediates,
            now,
            KeyUsage::server_auth(),
            None,
            Some(&path_check),
        )
        .map(|_| ())
        .map_err(|_| rustls::Error::General("pin mismatch".into()))
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

fn sha256_32(bytes: &[u8]) -> [u8; 32] {
    let digest = Sha256::digest(bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

fn wrap_der_sequence(content: &[u8]) -> Vec<u8> {
    let len = content.len();
    let mut out = Vec::with_capacity(len + 4);
    out.push(0x30);
    if len < 0x80 {
        out.push(len as u8);
    } else if len < 0x100 {
        out.push(0x81);
        out.push(len as u8);
    } else {
        out.push(0x82);
        out.push((len >> 8) as u8);
        out.push((len & 0xff) as u8);
    }
    out.extend_from_slice(content);
    out
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

        self.verify_pinned_path(end_entity, intermediates, now)?;
        Ok(ServerCertVerified::assertion())
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
        .cookie_store(false)
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

#[cfg(test)]
mod tests {
    use super::*;

    const LEGACY_LEAF_ONLY_PINS: &[&str] = &[
        "xzW4Lh0h5AJczrSG3fvSOGZYUsDrxYyt0AlhLpZFUls=",
        "DDf/bfpXnW80wMM5Y2b9zNCdohxBo5lX7rUMiw+DYO4=",
    ];

    const BUNDLED_ROOT_PINS: &[&str] = &[
        "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
        "diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=",
        "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
        "hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=",
        "QXnt2YHvdHR3tJYmQIr0Paosp6t/nggsEGD4QJZ3Q0g=",
        "K89VOmb1cJAN3TK6bf4ezAbJGC1mLcG2Dh97dnwr3VQ=",
        "G/ANXI8TwJTdF+AFBM8IiIUPEv0Gf6H5LA/b9guG4yE=",
        "0cRTd+vc1hjNFlHcLgLCHXUeWqn80bNDH/bs9qMTSPo=",
        "oyD01TTXvpfBro3QSZc1vIlcMjrdLTiL/M9mLCPX+Zo=",
    ];

    fn build_client_with_pins(pin_b64_set: &'static [&'static str]) -> reqwest::Client {
        let verifier = PinnedVerifier::with_pin_set(pin_b64_set).expect("verifier");
        let provider = Arc::new(ring::default_provider());
        let tls = ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .expect("protocol versions")
            .dangerous()
            .with_custom_certificate_verifier(verifier)
            .with_no_client_auth();
        reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .use_preconfigured_tls(tls)
            .build()
            .expect("client")
    }

    fn bundled_anchor_pins() -> Vec<[u8; 32]> {
        webpki_roots::TLS_SERVER_ROOTS
            .iter()
            .map(|anchor| sha256_32(&wrap_der_sequence(anchor.subject_public_key_info.as_ref())))
            .collect()
    }

    #[test]
    fn every_production_pin_decodes_to_32_bytes() {
        for pin in PIN_B64_SET {
            decode_pin(pin).expect("pin decodes");
        }
        assert!(PIN_B64_SET.len() >= 3);
    }

    #[test]
    fn production_pin_set_has_no_duplicates() {
        let mut seen = std::collections::HashSet::new();
        for pin in PIN_B64_SET {
            assert!(seen.insert(*pin), "duplicate pin {pin}");
        }
    }

    #[test]
    fn wrap_der_sequence_uses_the_right_length_form() {
        assert_eq!(wrap_der_sequence(&[1, 2, 3])[..2], [0x30, 0x03]);
        assert_eq!(wrap_der_sequence(&[0u8; 200])[..3], [0x30, 0x81, 200]);
        assert_eq!(wrap_der_sequence(&[0u8; 300])[..4], [0x30, 0x82, 0x01, 0x2c]);
        assert_eq!(wrap_der_sequence(&[9, 8]), vec![0x30, 0x02, 9, 8]);
    }

    #[test]
    fn root_pins_match_bundled_trust_anchors_after_sequence_wrap() {
        let anchors = bundled_anchor_pins();
        for pin_b64 in BUNDLED_ROOT_PINS {
            let pin = decode_pin(pin_b64).expect("pin decodes");
            assert!(
                anchors.iter().any(|anchor| *anchor == pin),
                "no bundled trust anchor hashes to {pin_b64}"
            );
            assert!(PIN_B64_SET.contains(pin_b64), "{pin_b64} missing from PIN_B64_SET");
        }
    }

    #[test]
    fn pin_check_applies_to_astermail_hosts_only() {
        let pinned: ServerName<'_> = "app.astermail.org".try_into().expect("name");
        let bare: ServerName<'_> = "astermail.org".try_into().expect("name");
        let github: ServerName<'_> = "github.com".try_into().expect("name");
        assert!(host_requires_pin(&pinned));
        assert!(host_requires_pin(&bare));
        assert!(!host_requires_pin(&github));
    }

    #[tokio::test]
    #[ignore]
    async fn device_http_request_reaches_live_edge_through_pinned_client() {
        let response = crate::device::crypto::device_http_request(
            "https://app.astermail.org/api/health".to_string(),
            "GET".to_string(),
            None,
            None,
        )
        .await
        .expect("device_http_request succeeds");
        assert_eq!(response.status, 200);
        let body_bytes = STANDARD.decode(&response.body).expect("body decodes");
        assert_eq!(body_bytes, b"ok");
    }

    #[tokio::test]
    #[ignore]
    async fn legacy_leaf_only_pin_set_fails_handshake_against_live_edge() {
        let client = build_client_with_pins(LEGACY_LEAF_ONLY_PINS);
        let error = client
            .get("https://app.astermail.org/api/health")
            .send()
            .await
            .expect_err("legacy pins must fail");
        let chain = format!("{error:?}");
        assert!(chain.contains("pin mismatch"), "unexpected error: {chain}");
    }

    #[tokio::test]
    #[ignore]
    async fn root_only_pin_set_accepts_the_live_edge() {
        let client = build_client_with_pins(BUNDLED_ROOT_PINS);
        let response = client
            .get("https://app.astermail.org/api/health")
            .send()
            .await
            .expect("root pins accept the live chain");
        assert!(!response.status().is_server_error(), "{}", response.status());
    }

    #[tokio::test]
    #[ignore]
    async fn unpinned_host_is_not_blocked_by_pin_verifier() {
        let client = build_pinned_client(Duration::from_secs(30)).expect("client");
        let response = client
            .get("https://github.com/")
            .send()
            .await
            .expect("unpinned host request succeeds");
        assert!(response.status().is_success() || response.status().is_redirection());
    }
}
