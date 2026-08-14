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
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use ed25519_dalek::{Signer, SigningKey};
use hkdf::Hkdf;
use keyring::Entry;
use ml_kem::array::Array;
use ml_kem::kem::Decapsulate;
use ml_kem::{Ciphertext, EncodedSizeUser, KemCore, MlKem768};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use uuid::Uuid;
use x25519_dalek::{PublicKey as XPublicKey, StaticSecret};
use zeroize::{Zeroize, Zeroizing, ZeroizeOnDrop};

const KEYRING_SERVICE: &str = "com.astermail.mail";
const KEYRING_WRAP_USER: &str = "device-identity-wrap-v1";
const KEYRING_IDENTITY_USER: &str = "device_identity";
const MAGIC_ID: &[u8; 8] = b"ASTERID\x01";
const MAGIC_PP: &[u8; 8] = b"ASTERPP\x01";

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

fn wrap_key_file_path() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "cannot resolve local data directory".to_string())?;
    let app_dir = data_dir.join("com.astermail.mail");

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("device_wrap.key"))
}

fn aead_seal(wrap_key: &[u8; 32], magic: &[u8; 8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let cipher = XChaCha20Poly1305::new(wrap_key.into());
    let nonce = XNonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, Payload { msg: plaintext, aad: magic })
        .map_err(|e| format!("aead seal: {:?}", e))?;
    let mut out = Vec::with_capacity(8 + 24 + ct.len());
    out.extend_from_slice(magic);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn aead_open(wrap_key: &[u8; 32], magic: &[u8; 8], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 8 + 24 + 16 || &data[..8] != magic {
        return Err("aead open: bad header".to_string());
    }
    let nonce = XNonce::from_slice(&data[8..32]);
    let ct = &data[32..];
    let cipher = XChaCha20Poly1305::new(wrap_key.into());
    cipher
        .decrypt(nonce, Payload { msg: ct, aad: magic })
        .map_err(|e| format!("aead open: {:?}", e))
}

fn keyring_wrap_key_load() -> Result<Option<[u8; 32]>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_WRAP_USER)
        .map_err(|e| format!("keyring init: {}", e))?;
    match entry.get_password() {
        Ok(encoded) => {
            let bytes = URL_SAFE_NO_PAD
                .decode(encoded.as_bytes())
                .map_err(|e| e.to_string())?;
            let key: [u8; 32] = bytes
                .as_slice()
                .try_into()
                .map_err(|_| "wrap key wrong size".to_string())?;
            Ok(Some(key))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get wrap: {}", e)),
    }
}

fn keyring_wrap_key_store(key: &[u8; 32]) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_WRAP_USER)
        .map_err(|e| format!("keyring init: {}", e))?;
    entry
        .set_password(&URL_SAFE_NO_PAD.encode(key))
        .map_err(|e| format!("keyring set wrap: {}", e))
}

fn wrap_key_file_load() -> Result<Option<[u8; 32]>, String> {
    let path = wrap_key_file_path()?;

    if !path.exists() {
        return Ok(None);
    }

    let data = Zeroizing::new(std::fs::read(&path).map_err(|e| e.to_string())?);
    let key: [u8; 32] = data
        .as_slice()
        .try_into()
        .map_err(|_| "wrap key file wrong size".to_string())?;
    Ok(Some(key))
}

fn wrap_key_file_delete() {
    if let Ok(path) = wrap_key_file_path() {
        secure_delete_file(&path);
    }
}

fn wrap_key_file_adopt() -> Option<[u8; 32]> {
    let path = wrap_key_file_path().ok()?;

    if !path.exists() {
        return None;
    }

    let key = wrap_key_file_load().ok().flatten()?;

    match keyring_wrap_key_store(&key) {
        Ok(()) => secure_delete_file(&path),
        Err(e) => tracing::warn!(
            "device wrap key remains on disk because the system keychain is unavailable: {}",
            e
        ),
    }

    Some(key)
}

fn wrap_key_load() -> Result<Option<[u8; 32]>, String> {
    match keyring_wrap_key_load() {
        Ok(Some(key)) => return Ok(Some(key)),
        Ok(None) => {}
        Err(e) => tracing::warn!("system keychain read failed: {}", e),
    }
    Ok(wrap_key_file_adopt())
}

fn wrap_key_load_or_create() -> Result<[u8; 32], String> {
    match keyring_wrap_key_load() {
        Ok(Some(key)) => return Ok(key),
        Ok(None) => {
            if let Some(key) = wrap_key_file_adopt() {
                return Ok(key);
            }
        }
        Err(e) => {
            if let Some(key) = wrap_key_file_adopt() {
                return Ok(key);
            }
            return Err(format!(
                "the system keychain could not be read, so this device's keys cannot be unlocked: {}. Your existing keys were left untouched. Unlock the system keychain and try again.",
                e
            ));
        }
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);

    if let Err(e) = keyring_wrap_key_store(&key) {
        key.zeroize();
        return Err(format!(
            "secure key storage is unavailable, so Aster Mail cannot protect this device's keys: {}. Turn on your system keychain (Credential Manager on Windows, Keychain on macOS, or a Secret Service provider such as GNOME Keyring or KeePassXC on Linux), then try again.",
            e
        ));
    }

    Ok(key)
}

fn keyring_delete(user: &str) -> Result<(), String> {
    let entry = match Entry::new(KEYRING_SERVICE, user) {
        Ok(entry) => entry,
        Err(_) => return Ok(()),
    };
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete {}: {}", user, e)),
    }
}

fn wrap_key_delete() -> Result<(), String> {
    wrap_key_file_delete();
    keyring_delete(KEYRING_WRAP_USER)
}

const MAX_SECURE_OVERWRITE_BYTES: u64 = 1024 * 1024;

fn secure_overwrite_file(path: &std::path::Path) {
    use std::io::{Seek, SeekFrom, Write as _};

    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    let len = meta.len();

    if len == 0 || len > MAX_SECURE_OVERWRITE_BYTES {
        return;
    }

    let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(path) else {
        return;
    };
    let mut buf = Zeroizing::new(vec![0u8; len as usize]);

    for pass in 0..2 {
        if pass == 0 {
            OsRng.fill_bytes(buf.as_mut_slice());
        } else {
            buf.iter_mut().for_each(|b| *b = 0);
        }
        if f.seek(SeekFrom::Start(0)).is_err() || f.write_all(&buf).is_err() {
            return;
        }
        let _ = f.flush();
    }

    let _ = f.sync_all();
}

fn secure_delete_file(path: &std::path::Path) {
    secure_overwrite_file(path);
    let _ = std::fs::remove_file(path);
}

fn atomic_write(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write as _;
    let tmp = path.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        set_file_permissions_restrictive(&tmp)?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    secure_overwrite_file(path);
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_stored() -> Result<Option<StoredIdentity>, String> {
    let path = identity_file_path()?;

    if !path.exists() {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_IDENTITY_USER).ok();
        if let Some(entry) = entry {
            if let Ok(s) = entry.get_password() {
                if let Ok(bytes) = URL_SAFE_NO_PAD.decode(s.as_bytes()).map(Zeroizing::new) {
                    if let Ok(stored) = serde_json::from_slice::<StoredIdentity>(&bytes) {
                        let _ = save_stored(&stored);
                        let _ = entry.delete_credential();
                        return Ok(Some(stored));
                    }
                }
            }
        }
        return Ok(None);
    }

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;

    if data.len() >= 8 && &data[..8] == MAGIC_ID {
        match wrap_key_load()? {
            None => {
                tracing::warn!(
                    "device identity is unreadable: the wrap key is absent from the system keychain"
                );
                return Ok(None);
            }
            Some(wrap_key) => {
                let plaintext = Zeroizing::new(aead_open(&wrap_key, MAGIC_ID, &data)?);
                let stored: StoredIdentity =
                    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())?;
                return Ok(Some(stored));
            }
        }
    }

    let bytes = Zeroizing::new(URL_SAFE_NO_PAD.decode(&data).map_err(|e| e.to_string())?);
    let stored: StoredIdentity =
        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if let Err(e) = save_stored(&stored) {
        tracing::warn!("identity legacy-to-v2 migration deferred: {}", e);
    }
    Ok(Some(stored))
}

fn set_file_permissions_restrictive(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let user = whoami::fallible::username()
            .unwrap_or_else(|_| std::env::var("USERNAME").unwrap_or_default());
        if !user.is_empty() {
            let target = path.to_string_lossy().into_owned();
            let grant = format!("{}:(F)", user);
            match std::process::Command::new("icacls")
                .args([
                    target.as_str(),
                    "/inheritance:r",
                    "/grant:r",
                    grant.as_str(),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                Ok(out) if !out.status.success() => tracing::warn!(
                    "icacls failed to restrict {}: {}",
                    path.display(),
                    String::from_utf8_lossy(&out.stderr).trim()
                ),
                Err(e) => tracing::warn!("icacls invocation failed for {}: {}", path.display(), e),
                _ => {}
            }
        }
    }
    let _ = path;
    Ok(())
}

fn save_stored(stored: &StoredIdentity) -> Result<(), String> {
    let path = identity_file_path()?;
    let json = Zeroizing::new(serde_json::to_vec(stored).map_err(|e| e.to_string())?);
    let wrap_key = wrap_key_load_or_create()?;
    let blob = aead_seal(&wrap_key, MAGIC_ID, &json)?;
    atomic_write(&path, &blob)?;
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

fn require_primary_webview(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("command not available in this window".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn device_unseal_vault_envelope(
    window: tauri::WebviewWindow,
    envelope_b64: String,
) -> Result<String, String> {
    require_primary_webview(&window)?;
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
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(xnonce, ciphertext)
            .map_err(|e| format!("decrypt: {:?}", e))?,
    );

    shared_key.zeroize();

    let encoded = b64url(&plaintext);
    let path = passphrase_file_path()?;
    let wrap_key = wrap_key_load_or_create()?;
    let blob = aead_seal(&wrap_key, MAGIC_PP, &plaintext)?;
    atomic_write(&path, &blob)?;

    Ok(encoded)
}

fn reseal_legacy_passphrase(path: &std::path::Path, raw: &[u8]) {
    let wrap_key = match wrap_key_load_or_create() {
        Ok(key) => key,
        Err(e) => {
            tracing::warn!("stored passphrase stays unencrypted on disk: {}", e);
            return;
        }
    };
    let blob = match aead_seal(&wrap_key, MAGIC_PP, raw) {
        Ok(blob) => blob,
        Err(e) => {
            tracing::warn!("stored passphrase could not be sealed: {}", e);
            return;
        }
    };
    if let Err(e) = atomic_write(path, &blob) {
        tracing::warn!("stored passphrase could not be rewritten: {}", e);
    }
}

#[tauri::command]
pub fn device_get_stored_passphrase(
    window: tauri::WebviewWindow,
) -> Result<Option<String>, String> {
    require_primary_webview(&window)?;
    let path = passphrase_file_path()?;

    if !path.exists() {
        return Ok(None);
    }

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;

    if data.len() >= 8 && &data[..8] == MAGIC_PP {
        match wrap_key_load()? {
            None => {
                tracing::warn!(
                    "stored passphrase is unreadable: the wrap key is absent from the system keychain"
                );
                return Ok(None);
            }
            Some(wrap_key) => {
                let plaintext = Zeroizing::new(aead_open(&wrap_key, MAGIC_PP, &data)?);
                return Ok(Some(b64url(&plaintext)));
            }
        }
    }

    let s = std::str::from_utf8(&data).map_err(|e| e.to_string())?.to_string();
    let raw = Zeroizing::new(b64url_decode(&s)?);
    reseal_legacy_passphrase(&path, &raw);
    Ok(Some(s))
}

#[tauri::command]
pub fn device_clear_session() -> Result<(), String> {
    if let Ok(path) = passphrase_file_path() {
        secure_delete_file(&path);
    }
    if let Some(mut stored) = load_stored()? {
        stored.device_id = None;
        save_stored(&stored)?;
    }
    Ok(())
}

#[tauri::command]
pub fn device_clear_identity() -> Result<(), String> {
    if let Ok(path) = identity_file_path() {
        secure_delete_file(&path);
    }
    if let Ok(path) = passphrase_file_path() {
        secure_delete_file(&path);
    }
    let _ = keyring_delete(KEYRING_IDENTITY_USER);
    let _ = wrap_key_delete();
    Ok(())
}

#[derive(Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[cfg(target_os = "windows")]
const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (Windows; Tauri)";
#[cfg(target_os = "macos")]
const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (macOS; Tauri)";
#[cfg(all(unix, not(target_os = "macos")))]
const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (Linux; Tauri)";

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
    ) || (n.starts_with("x-aster-") && n != "x-aster-client")
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
        return Err("onion hosts not supported".to_string());
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

    let client = crate::http_client::shared_pinned_client()?;
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
    req = req.header("x-aster-client", "tauri-desktop");
    req = req.header("origin", "https://tauri.localhost");
    req = req.header("referer", "https://tauri.localhost/");

    const MAX_CALLER_HEADERS: usize = 32;
    if let Some(h) = headers {
        if h.len() > MAX_CALLER_HEADERS {
            return Err(format!(
                "too many headers: {} exceeds limit of {}",
                h.len(),
                MAX_CALLER_HEADERS
            ));
        }
        for (k, v) in h {
            if !is_device_header_allowed(&k) {
                continue;
            }
            if v.bytes().any(|b| b == b'\r' || b == b'\n') {
                return Err("header value contains invalid characters".to_string());
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
        .filter(|(k, _)| {
            let name = k.as_str().to_ascii_lowercase();
            name != "set-cookie" && name != "set-cookie2"
        })
        .filter_map(|(k, v)| v.to_str().ok().map(|val| (k.to_string(), val.to_string())))
        .collect();
    let resp_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let resp_body = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &resp_bytes,
    );

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
    if iterations == 0 {
        return Err("iterations must be greater than 0".to_string());
    }
    if bits == 0 || bits % 8 != 0 {
        return Err(format!("bits must be a non-zero multiple of 8, got {}", bits));
    }
    if iterations > 2_000_000 {
        return Err(format!("iterations {} exceeds maximum of 2000000", iterations));
    }
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
    if bits == 0 || bits % 8 != 0 {
        return Err(format!("bits must be a non-zero multiple of 8, got {}", bits));
    }
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
    if iv.len() != 12 {
        return Err("aes-gcm iv must be 12 bytes".to_string());
    }
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
    if iv.len() != 12 {
        return Err("aes-gcm iv must be 12 bytes".to_string());
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    fn scratch_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("aster_device_crypto_test_{}_{}", std::process::id(), name));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn aead_round_trips_under_the_same_key_and_magic() {
        let key = test_key(7);
        let sealed = aead_seal(&key, MAGIC_PP, b"correct horse battery staple").unwrap();

        assert_eq!(&sealed[..8], MAGIC_PP);
        assert_eq!(
            aead_open(&key, MAGIC_PP, &sealed).unwrap(),
            b"correct horse battery staple"
        );
    }

    #[test]
    fn aead_seal_is_randomized_per_call() {
        let key = test_key(7);
        let first = aead_seal(&key, MAGIC_ID, b"same plaintext").unwrap();
        let second = aead_seal(&key, MAGIC_ID, b"same plaintext").unwrap();

        assert_ne!(first, second);
    }

    #[test]
    fn aead_open_rejects_the_wrong_key() {
        let sealed = aead_seal(&test_key(1), MAGIC_PP, b"secret").unwrap();

        assert!(aead_open(&test_key(2), MAGIC_PP, &sealed).is_err());
    }

    #[test]
    fn aead_open_rejects_a_mismatched_magic() {
        let key = test_key(3);
        let sealed = aead_seal(&key, MAGIC_ID, b"secret").unwrap();

        assert!(aead_open(&key, MAGIC_PP, &sealed).is_err());
    }

    #[test]
    fn aead_open_rejects_tampered_ciphertext() {
        let key = test_key(4);
        let mut sealed = aead_seal(&key, MAGIC_PP, b"secret").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 0xff;

        assert!(aead_open(&key, MAGIC_PP, &sealed).is_err());
    }

    #[test]
    fn aead_open_rejects_a_truncated_blob() {
        let key = test_key(5);
        let sealed = aead_seal(&key, MAGIC_PP, b"secret").unwrap();

        assert!(aead_open(&key, MAGIC_PP, &sealed[..30]).is_err());
    }

    #[test]
    fn legacy_plaintext_passphrase_is_distinguishable_from_a_sealed_blob() {
        let sealed = aead_seal(&test_key(6), MAGIC_PP, b"secret").unwrap();
        let legacy = b64url(b"secret").into_bytes();

        assert!(sealed.len() >= 8 && &sealed[..8] == MAGIC_PP);
        assert!(legacy.len() < 8 || &legacy[..8] != MAGIC_PP);
    }

    #[test]
    fn b64url_round_trips_without_padding() {
        let raw = [0u8, 1, 2, 250, 251, 252, 253];
        let encoded = b64url(&raw);

        assert!(!encoded.contains('='));
        assert!(!encoded.contains('+'));
        assert!(!encoded.contains('/'));
        assert_eq!(b64url_decode(&encoded).unwrap(), raw);
    }

    #[test]
    fn atomic_write_replaces_content_without_leaving_the_old_bytes() {
        let path = scratch_path("atomic");
        let old = vec![0xABu8; 512];
        let new = vec![0xCDu8; 512];

        atomic_write(&path, &old).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), old);

        atomic_write(&path, &new).unwrap();
        let after = std::fs::read(&path).unwrap();

        assert_eq!(after, new);
        assert!(!after.windows(8).any(|w| w == [0xAB; 8]));
        assert!(!path.with_extension("tmp").exists());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn secure_delete_file_removes_the_file() {
        let path = scratch_path("delete");
        std::fs::write(&path, vec![0x42u8; 256]).unwrap();

        secure_delete_file(&path);

        assert!(!path.exists());
    }

    #[test]
    fn secure_overwrite_file_clears_the_original_bytes_in_place() {
        let path = scratch_path("overwrite");
        std::fs::write(&path, vec![0x42u8; 256]).unwrap();

        secure_overwrite_file(&path);
        let after = std::fs::read(&path).unwrap();

        assert_eq!(after.len(), 256);
        assert!(after.iter().all(|b| *b == 0));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn secure_overwrite_file_is_a_no_op_on_a_missing_file() {
        secure_overwrite_file(&scratch_path("absent"));
    }

    #[test]
    fn set_file_permissions_restrictive_succeeds_on_a_real_file() {
        let path = scratch_path("perms");
        std::fs::write(&path, b"x").unwrap();

        set_file_permissions_restrictive(&path).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"x");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn the_three_device_secrets_use_distinct_file_names() {
        let identity = identity_file_path().unwrap();
        let passphrase = passphrase_file_path().unwrap();
        let wrap = wrap_key_file_path().unwrap();

        assert_ne!(identity, passphrase);
        assert_ne!(identity, wrap);
        assert_ne!(passphrase, wrap);
    }
}
