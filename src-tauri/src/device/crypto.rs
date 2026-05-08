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
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use ed25519_dalek::{Signer, SigningKey};
use hkdf::Hkdf;
#[cfg(target_os = "windows")]
use keyring::Entry;
use ml_kem::array::Array;
use ml_kem::kem::Decapsulate;
use ml_kem::{Ciphertext, EncodedSizeUser, KemCore, MlKem768};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use uuid::Uuid;
use x25519_dalek::{PublicKey as XPublicKey, StaticSecret};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[cfg(target_os = "windows")]
const KEYRING_SERVICE: &str = "com.astermail.mail";

type MlKemDecapKey = <MlKem768 as KemCore>::DecapsulationKey;
type MlKemEncapKey = <MlKem768 as KemCore>::EncapsulationKey;

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
struct StoredIdentity {
    #[zeroize(skip)]
    device_id: Option<Uuid>,
    ed25519_sk_bytes: [u8; 32],
    mlkem_sk_bytes: Vec<u8>,
    mlkem_pk_bytes: Vec<u8>,
    x25519_sk_bytes: [u8; 32],
}

pub struct DeviceIdentity {
    pub device_id: Option<Uuid>,
    pub ed25519_signing_key: SigningKey,
    pub mlkem_decaps_key: MlKemDecapKey,
    pub mlkem_encaps_key_bytes: Vec<u8>,
    pub x25519_static_secret: StaticSecret,
    pub x25519_public_bytes: [u8; 32],
}

#[derive(Serialize)]
pub struct DevicePubkeys {
    pub device_id: Option<String>,
    pub ed25519_pk: String,
    pub mlkem_pk: String,
    pub x25519_pk: String,
    pub machine_name: String,
}

fn identity_file_path() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "cannot resolve local data directory".to_string())?;
    let app_dir = data_dir.join("com.astermail.mail");

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("device_identity.bin"))
}

fn passphrase_file_path() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "cannot resolve local data directory".to_string())?;
    let app_dir = data_dir.join("com.astermail.mail");

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("device_passphrase.bin"))
}

fn load_stored() -> Result<Option<StoredIdentity>, String> {
    let path = identity_file_path()?;

    if !path.exists() {
        #[cfg(target_os = "windows")]
        {
            let entry = Entry::new(KEYRING_SERVICE, "device_identity").ok();

            if let Some(entry) = entry {
                if let Ok(s) = entry.get_password() {
                    if let Ok(bytes) = URL_SAFE_NO_PAD.decode(s.as_bytes()) {
                        if let Ok(stored) = serde_json::from_slice::<StoredIdentity>(&bytes) {
                            let _ = save_stored(&stored);
                            let _ = entry.delete_credential();

                            return Ok(Some(stored));
                        }
                    }
                }
            }
        }

        return Ok(None);
    }

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(&data)
        .map_err(|e| e.to_string())?;
    let stored: StoredIdentity =
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    Ok(Some(stored))
}

fn set_file_permissions_restrictive(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    }
    let _ = path;
    Ok(())
}

fn save_stored(stored: &StoredIdentity) -> Result<(), String> {
    let path = identity_file_path()?;
    let json = serde_json::to_vec(stored).map_err(|e| e.to_string())?;
    let encoded = URL_SAFE_NO_PAD.encode(&json);

    std::fs::write(&path, encoded.as_bytes()).map_err(|e| e.to_string())?;
    set_file_permissions_restrictive(&path)?;
    Ok(())
}

fn identity_from_stored(stored: StoredIdentity) -> Result<DeviceIdentity, String> {
    let ed25519_signing_key = SigningKey::from_bytes(&stored.ed25519_sk_bytes);
    let mlkem_decaps_key = MlKemDecapKey::from_bytes(
        &ml_kem::Encoded::<MlKemDecapKey>::try_from(stored.mlkem_sk_bytes.as_slice())
            .map_err(|e| e.to_string())?,
    );
    let x25519_static_secret = StaticSecret::from(stored.x25519_sk_bytes);
    let x25519_public_bytes = *XPublicKey::from(&x25519_static_secret).as_bytes();
    let mlkem_encaps_key_bytes = stored.mlkem_pk_bytes.clone();
    let device_id = stored.device_id;
    Ok(DeviceIdentity {
        device_id,
        ed25519_signing_key,
        mlkem_decaps_key,
        mlkem_encaps_key_bytes,
        x25519_static_secret,
        x25519_public_bytes,
    })
}

pub fn get_or_create_device_identity() -> Result<DeviceIdentity, String> {
    if let Some(stored) = load_stored()? {
        return identity_from_stored(stored);
    }

    let ed25519_signing_key = SigningKey::generate(&mut OsRng);
    let ed25519_sk_bytes = ed25519_signing_key.to_bytes();

    let (dk, ek): (MlKemDecapKey, MlKemEncapKey) = MlKem768::generate(&mut OsRng);
    let mlkem_sk_bytes = dk.as_bytes().to_vec();
    let mlkem_pk_bytes = ek.as_bytes().to_vec();

    let x25519_static_secret = StaticSecret::random_from_rng(OsRng);
    let x25519_sk_bytes: [u8; 32] = x25519_static_secret.to_bytes();
    let x25519_public_bytes = *XPublicKey::from(&x25519_static_secret).as_bytes();

    let stored = StoredIdentity {
        device_id: None,
        ed25519_sk_bytes,
        mlkem_sk_bytes: mlkem_sk_bytes.clone(),
        mlkem_pk_bytes: mlkem_pk_bytes.clone(),
        x25519_sk_bytes,
    };
    save_stored(&stored)?;

    Ok(DeviceIdentity {
        device_id: None,
        ed25519_signing_key,
        mlkem_decaps_key: dk,
        mlkem_encaps_key_bytes: mlkem_pk_bytes,
        x25519_static_secret,
        x25519_public_bytes,
    })
}

fn b64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn b64url_decode(s: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD
        .decode(s.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn device_get_pubkeys() -> Result<DevicePubkeys, String> {
    let id = get_or_create_device_identity()?;
    let ed25519_pk = b64url(id.ed25519_signing_key.verifying_key().as_bytes());
    let mlkem_pk = b64url(&id.mlkem_encaps_key_bytes);
    let x25519_pk = b64url(&id.x25519_public_bytes);
    Ok(DevicePubkeys {
        device_id: id.device_id.map(|u| u.to_string()),
        ed25519_pk,
        mlkem_pk,
        x25519_pk,
        machine_name: whoami::devicename(),
    })
}

#[tauri::command]
pub fn device_set_id(device_id: String) -> Result<(), String> {
    let parsed = Uuid::parse_str(&device_id).map_err(|e| e.to_string())?;
    let mut stored = load_stored()?.ok_or_else(|| "no device identity".to_string())?;
    stored.device_id = Some(parsed);
    save_stored(&stored)
}

#[tauri::command]
pub fn device_sign_challenge(nonce_b64: String) -> Result<String, String> {
    let nonce = b64url_decode(&nonce_b64)?;
    let id = get_or_create_device_identity()?;
    let sig = id.ed25519_signing_key.sign(&nonce);
    Ok(b64url(&sig.to_bytes()))
}

#[tauri::command]
pub fn device_unseal_vault_envelope(envelope_b64: String) -> Result<String, String> {
    let data = b64url_decode(&envelope_b64)?;
    if data.len() < 32 + 1088 + 24 + 16 {
        return Err("envelope too short".to_string());
    }
    let x25519_eph_pk_bytes: [u8; 32] = data[0..32].try_into().map_err(|_| "slice")?;
    let mlkem_ct_bytes = &data[32..32 + 1088];
    let nonce_bytes: [u8; 24] = data[32 + 1088..32 + 1088 + 24]
        .try_into()
        .map_err(|_| "slice")?;
    let ciphertext = &data[32 + 1088 + 24..];

    let id = get_or_create_device_identity()?;

    let ct: Ciphertext<MlKem768> =
        Array::try_from(mlkem_ct_bytes).map_err(|e: _| format!("ct size: {:?}", e))?;
    let mut ss_pq = id
        .mlkem_decaps_key
        .decapsulate(&ct)
        .map_err(|e| format!("mlkem decaps: {:?}", e))?;

    let eph_pub = XPublicKey::from(x25519_eph_pk_bytes);
    let ss_cl = id.x25519_static_secret.diffie_hellman(&eph_pub);

    let mut ikm = [0u8; 64];
    ikm[..32].copy_from_slice(ss_pq.as_slice());
    ikm[32..].copy_from_slice(ss_cl.as_bytes());

    let hk = Hkdf::<Sha256>::new(Some(&nonce_bytes), &ikm);
    let mut shared_key = [0u8; 32];
    hk.expand(b"astermail-device-enroll-v1", &mut shared_key)
        .map_err(|e| e.to_string())?;

    ikm.zeroize();
    ss_pq.zeroize();
    drop(ss_cl);

    let cipher = XChaCha20Poly1305::new((&shared_key).into());
    let xnonce = XNonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(xnonce, ciphertext)
        .map_err(|e| format!("decrypt: {:?}", e))?;

    shared_key.zeroize();

    let encoded = b64url(&plaintext);
    let path = passphrase_file_path()?;
    std::fs::write(&path, encoded.as_bytes()).map_err(|e| e.to_string())?;
    set_file_permissions_restrictive(&path)?;

    Ok(encoded)
}

#[tauri::command]
pub fn device_get_stored_passphrase() -> Result<Option<String>, String> {
    let path = passphrase_file_path()?;

    if !path.exists() {
        return Ok(None);
    }

    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

#[tauri::command]
pub fn device_clear_session() -> Result<(), String> {
    if let Some(mut stored) = load_stored()? {
        stored.device_id = None;
        save_stored(&stored)?;
    }
    if let Ok(path) = passphrase_file_path() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub fn device_clear_identity() -> Result<(), String> {
    if let Ok(path) = identity_file_path() {
        let _ = std::fs::remove_file(path);
    }
    if let Ok(path) = passphrase_file_path() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (macOS; Tauri)";

fn is_device_header_allowed(name: &str) -> bool {
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

#[tauri::command]
pub async fn device_http_request(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<ProxyResponse, String> {
    const ALLOWED_HTTPS_SUFFIXES: &[&str] = &[".astermail.org", ".astermail.com"];
    const ALLOWED_HTTPS_EXACT: &[&str] = &["astermail.org", "astermail.com"];
    const MAX_REQUEST_BODY_SIZE: usize = 10 * 1024 * 1024;

    let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("invalid url: {e}"))?;
    let scheme = parsed_url.scheme().to_ascii_lowercase();

    if scheme != "https" {
        return Err("device_http_request requires https".to_string());
    }

    let raw_host = parsed_url.host_str().unwrap_or("").to_ascii_lowercase();
    let host = raw_host.trim_end_matches('.');

    if host.is_empty() {
        return Err("url has no host".to_string());
    }

    if host.ends_with(".onion") {
        return Err("onion hosts must be routed through tor_fetch".to_string());
    }

    let host_allowed = ALLOWED_HTTPS_EXACT.iter().any(|h| *h == host)
        || ALLOWED_HTTPS_SUFFIXES.iter().any(|s| host.ends_with(s));

    if !host_allowed {
        return Err("host not in device_http_request allowlist".to_string());
    }

    if let Some(b) = &body {
        if b.len() > MAX_REQUEST_BODY_SIZE {
            return Err(format!(
                "request body too large: {} bytes exceeds 10MB limit",
                b.len()
            ));
        }
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(parsed_url.clone()),
        "POST" => client.post(parsed_url.clone()),
        "PUT" => client.put(parsed_url.clone()),
        "PATCH" => client.patch(parsed_url.clone()),
        "DELETE" => client.delete(parsed_url.clone()),
        "HEAD" => client.head(parsed_url.clone()),
        _ => return Err(format!("unsupported method: {}", method)),
    };

    req = req.header("user-agent", DESKTOP_USER_AGENT);

    if let Some(h) = headers {
        for (k, v) in h {
            if !is_device_header_allowed(&k) {
                continue;
            }
            req = req.header(&k, &v);
        }
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let resp_headers: HashMap<String, String> = resp
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|val| (k.to_string(), val.to_string())))
        .collect();
    let resp_body = resp.text().await.map_err(|e| e.to_string())?;

    Ok(ProxyResponse {
        status,
        body: resp_body,
        headers: resp_headers,
    })
}

#[tauri::command]
pub fn crypto_pbkdf2(
    password: Vec<u8>,
    salt: Vec<u8>,
    iterations: u32,
    hash: String,
    bits: u32,
) -> Result<Vec<u8>, String> {
    let dk_len = (bits / 8) as usize;
    let mut dk = vec![0u8; dk_len];

    match hash.to_uppercase().as_str() {
        "SHA-256" => {
            pbkdf2::pbkdf2_hmac::<sha2::Sha256>(&password, &salt, iterations, &mut dk);
        }
        "SHA-384" => {
            pbkdf2::pbkdf2_hmac::<sha2::Sha384>(&password, &salt, iterations, &mut dk);
        }
        "SHA-512" => {
            pbkdf2::pbkdf2_hmac::<sha2::Sha512>(&password, &salt, iterations, &mut dk);
        }
        _ => return Err(format!("unsupported hash: {}", hash)),
    }

    Ok(dk)
}

#[tauri::command]
pub fn crypto_hkdf(
    key_material: Vec<u8>,
    salt: Vec<u8>,
    info: Vec<u8>,
    hash: String,
    bits: u32,
) -> Result<Vec<u8>, String> {
    let dk_len = (bits / 8) as usize;
    let mut okm = vec![0u8; dk_len];
    let salt_ref = if salt.is_empty() { None } else { Some(salt.as_slice()) };

    match hash.to_uppercase().as_str() {
        "SHA-256" => {
            let hk = Hkdf::<Sha256>::new(salt_ref, &key_material);
            hk.expand(&info, &mut okm)
                .map_err(|e| e.to_string())?;
        }
        "SHA-512" => {
            let hk = Hkdf::<sha2::Sha512>::new(salt_ref, &key_material);
            hk.expand(&info, &mut okm)
                .map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("unsupported hash: {}", hash)),
    }

    Ok(okm)
}

#[tauri::command]
pub fn crypto_aes_gcm_encrypt(
    key: Vec<u8>,
    iv: Vec<u8>,
    data: Vec<u8>,
) -> Result<Vec<u8>, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    cipher.encrypt(nonce, data.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn crypto_aes_gcm_decrypt(
    key: Vec<u8>,
    iv: Vec<u8>,
    data: Vec<u8>,
) -> Result<Vec<u8>, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    cipher.decrypt(nonce, data.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn crypto_hmac_sign(
    key: Vec<u8>,
    data: Vec<u8>,
) -> Result<Vec<u8>, String> {
    use hmac::digest::KeyInit;
    use hmac::Mac as _;
    let mut mac: hmac::Hmac<sha2::Sha256> =
        KeyInit::new_from_slice(&key).map_err(|e| e.to_string())?;
    mac.update(&data);
    Ok(mac.finalize().into_bytes().to_vec())
}
