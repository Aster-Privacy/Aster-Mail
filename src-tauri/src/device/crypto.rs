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
#[cfg(not(all(unix, not(target_os = "macos"))))]
use keyring::Entry;
use ml_kem::array::Array;
use ml_kem::kem::Decapsulate;
use ml_kem::{Ciphertext, EncodedSizeUser, KemCore, MlKem768};
use rand::rand_core::UnwrapErr;
use rand::rngs::SysRng;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use uuid::Uuid;
use x25519_dalek::{PublicKey as XPublicKey, StaticSecret};
use zeroize::{Zeroize, Zeroizing, ZeroizeOnDrop};

#[cfg(all(unix, not(target_os = "macos")))]
use crate::flatpak::secret::Entry;

const KEYRING_SERVICE: &str = "com.astermail.mail";
const KEYRING_WRAP_USER: &str = "device-identity-wrap-v1";
const KEYRING_IDENTITY_USER: &str = "device_identity";
const MAGIC_ID: &[u8; 8] = b"ASTERID\x01";
const MAGIC_PP: &[u8; 8] = b"ASTERPP\x01";
const MAGIC_AUTH: &[u8; 8] = b"ASTERAU\x01";
const MAGIC_REFRESH: &[u8; 8] = b"ASTERRT\x01";
const MAGIC_PL: &[u8; 8] = b"ASTERPL\x01";
const MAGIC_LS: &[u8; 8] = b"ASTERLS\x01";
const LOCAL_SECRET_MAX_BYTES: usize = 4096;
const PIN_LOCKED_ERROR: &str = "passphrase_pin_locked";
const KEYCHAIN_UNAVAILABLE_ERROR: &str = "keychain_unavailable";
const KEYCHAIN_STORE_FAILED_ERROR: &str = "keychain_store_failed";
const IDENTITY_FILE_NAME: &str = "device_identity.bin";
const UNREADABLE_IDENTITY_FILE_NAME: &str = "device_identity.unreadable.bin";
const MACHINE_NAME_MAX_CHARS: usize = 64;
const MACHINE_NAME_FALLBACK: &str = "Aster Mail desktop";
const REFRESH_FILE_NAME: &str = "auth_refresh.bin";
const REFRESH_ACCOUNT_ID_MAX_LEN: usize = 128;
const KEYRING_AUTH_ACCESS_USER: &str = "auth-access-token-v1";
const KEYRING_AUTH_CSRF_USER: &str = "auth-csrf-v1";
const AUTH_SLOT_ACCESS: &str = "access_token";
const AUTH_SLOT_CSRF: &str = "csrf";
const AUTH_VALUE_MAX_BYTES: usize = 8192;

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
    Ok(app_dir.join(IDENTITY_FILE_NAME))
}

fn passphrase_file_path() -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "cannot resolve local data directory".to_string())?;
    let app_dir = data_dir.join("com.astermail.mail");

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("device_passphrase.bin"))
}

fn passphrase_file_name_for(device_id: Uuid) -> String {
    format!("device_passphrase_{}.bin", device_id.as_simple())
}

fn passphrase_file_path_for(device_id: Uuid) -> Result<std::path::PathBuf, String> {
    let legacy = passphrase_file_path()?;
    let dir = legacy
        .parent()
        .ok_or_else(|| "cannot resolve passphrase directory".to_string())?;
    Ok(dir.join(passphrase_file_name_for(device_id)))
}

fn is_passphrase_file_name(name: &str) -> bool {
    name.starts_with("device_passphrase") && name.ends_with(".bin")
}

fn delete_all_passphrase_files() -> bool {
    let Ok(legacy) = passphrase_file_path() else {
        return true;
    };
    let Some(dir) = legacy.parent() else {
        return true;
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return !dir.exists();
    };
    let mut removed = true;

    for entry in entries.flatten() {
        let name = entry.file_name();
        if is_passphrase_file_name(&name.to_string_lossy()) {
            removed &= secure_delete_file(&entry.path());
        }
    }
    removed
}

fn parse_device_id(device_id: Option<String>) -> Result<Option<Uuid>, String> {
    match device_id {
        Some(raw) => Uuid::parse_str(&raw).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

fn resolve_passphrase_device(device_id: Option<String>) -> Result<Option<Uuid>, String> {
    if let Some(parsed) = parse_device_id(device_id)? {
        return Ok(Some(parsed));
    }
    Ok(load_stored()?.and_then(|stored| stored.device_id))
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
    let nonce = &XNonce::from(nonce_bytes);
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
    let nonce = &XNonce::try_from(&data[8..32])
        .map_err(|_| "aead open: bad nonce".to_string())?;
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
        Ok(()) => {
            secure_delete_file(&path);
        }
        Err(e) => {
            tracing::warn!(
                "device wrap key remains on disk because the system keychain is unavailable: {}",
                e
            );
            restrict_legacy_file(&path);
        }
    }

    Some(key)
}

fn wrap_key_load() -> Result<Option<[u8; 32]>, String> {
    match keyring_wrap_key_load() {
        Ok(Some(key)) => Ok(Some(key)),
        Ok(None) => Ok(wrap_key_file_adopt()),
        Err(e) => match wrap_key_file_adopt() {
            Some(key) => Ok(Some(key)),
            None => Err(keychain_unavailable_error(&e)),
        },
    }
}

fn keychain_unavailable_error(cause: &str) -> String {
    format!(
        "{}: the system keychain could not be read, so this device's keys cannot be unlocked: {}. Your existing keys were left untouched. Unlock the system keychain and try again.",
        KEYCHAIN_UNAVAILABLE_ERROR, cause
    )
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
            return Err(keychain_unavailable_error(&e));
        }
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);

    if let Err(e) = keyring_wrap_key_store(&key) {
        key.zeroize();
        return Err(format!(
            "{}: secure key storage is unavailable, so Aster Mail cannot protect this device's keys: {}. Turn on your system keychain (Credential Manager on Windows, Keychain on macOS, or a Secret Service provider such as GNOME Keyring or KeePassXC on Linux), then try again.",
            KEYCHAIN_STORE_FAILED_ERROR, e
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

fn auth_slot_ids(slot: &str) -> Result<(&'static str, &'static str), String> {
    match slot {
        AUTH_SLOT_ACCESS => Ok((KEYRING_AUTH_ACCESS_USER, "auth_access.bin")),
        AUTH_SLOT_CSRF => Ok((KEYRING_AUTH_CSRF_USER, "auth_csrf.bin")),
        _ => Err("unknown auth slot".to_string()),
    }
}

fn auth_file_path(file_name: &str) -> Result<std::path::PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| "cannot resolve local data directory".to_string())?;
    let app_dir = data_dir.join("com.astermail.mail");

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join(file_name))
}

fn auth_store_write(slot: &str, value: &str) -> Result<(), String> {
    let (keyring_user, file_name) = auth_slot_ids(slot)?;

    if let Ok(entry) = Entry::new(KEYRING_SERVICE, keyring_user) {
        if entry.set_password(value).is_ok() {
            if let Ok(path) = auth_file_path(file_name) {
                secure_delete_file(&path);
            }

            return Ok(());
        }
    }

    let wrap_key = wrap_key_load_or_create()?;
    let blob = aead_seal(&wrap_key, MAGIC_AUTH, value.as_bytes())?;
    let path = auth_file_path(file_name)?;

    atomic_write(&path, &blob)?;
    let _ = keyring_delete(keyring_user);

    Ok(())
}

fn auth_store_read(slot: &str) -> Result<Option<String>, String> {
    let (keyring_user, file_name) = auth_slot_ids(slot)?;

    if let Ok(entry) = Entry::new(KEYRING_SERVICE, keyring_user) {
        if let Ok(value) = entry.get_password() {
            return Ok(Some(value));
        }
    }

    let path = auth_file_path(file_name)?;

    if !path.exists() {
        return Ok(None);
    }
    let blob = std::fs::read(&path).map_err(|e| e.to_string())?;
    let wrap_key = match wrap_key_load()? {
        Some(key) => key,
        None => return Ok(None),
    };
    let plaintext = Zeroizing::new(aead_open(&wrap_key, MAGIC_AUTH, &blob)?);

    match std::str::from_utf8(&plaintext) {
        Ok(value) => Ok(Some(value.to_string())),
        Err(_) => Ok(None),
    }
}

fn auth_store_clear_all() -> bool {
    let mut removed = true;

    for slot in [AUTH_SLOT_ACCESS, AUTH_SLOT_CSRF] {
        if let Ok((keyring_user, file_name)) = auth_slot_ids(slot) {
            let _ = keyring_delete(keyring_user);

            if let Ok(path) = auth_file_path(file_name) {
                removed &= secure_delete_file(&path);
            }
        }
    }
    removed
}

static REFRESH_STORE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn valid_refresh_account_id(account_id: &str) -> bool {
    !account_id.is_empty()
        && account_id.len() <= REFRESH_ACCOUNT_ID_MAX_LEN
        && account_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn refresh_map_seal(
    wrap_key: &[u8; 32],
    map: &HashMap<String, String>,
) -> Result<Vec<u8>, String> {
    let serialized = Zeroizing::new(serde_json::to_vec(map).map_err(|e| e.to_string())?);

    aead_seal(wrap_key, MAGIC_REFRESH, &serialized)
}

fn refresh_map_open(wrap_key: &[u8; 32], blob: &[u8]) -> Result<HashMap<String, String>, String> {
    let plaintext = Zeroizing::new(aead_open(wrap_key, MAGIC_REFRESH, blob)?);

    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

fn zeroize_refresh_map(map: &mut HashMap<String, String>) {
    for (_, mut value) in map.drain() {
        value.zeroize();
    }
}

fn refresh_store_load(wrap_key: &[u8; 32]) -> Result<HashMap<String, String>, String> {
    let path = auth_file_path(REFRESH_FILE_NAME)?;

    if !path.exists() {
        return Ok(HashMap::new());
    }
    let blob = std::fs::read(&path).map_err(|e| e.to_string())?;

    refresh_map_open(wrap_key, &blob)
}

fn refresh_store_save(wrap_key: &[u8; 32], map: &HashMap<String, String>) -> Result<(), String> {
    let path = auth_file_path(REFRESH_FILE_NAME)?;

    if map.is_empty() {
        secure_delete_file(&path);

        return Ok(());
    }
    let blob = refresh_map_seal(wrap_key, map)?;

    atomic_write(&path, &blob)
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

fn secure_delete_file(path: &std::path::Path) -> bool {
    secure_overwrite_file(path);
    let _ = std::fs::remove_file(path);
    !path.exists()
}

fn atomic_write(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write as _;
    let tmp = path.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        if let Err(e) = set_file_permissions_restrictive(&tmp) {
            drop(f);
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    let previous = path.with_extension("old");

    if previous.exists() {
        let _ = std::fs::remove_file(&previous);
    }

    let kept_previous = path.exists() && std::fs::hard_link(path, &previous).is_ok();

    if let Err(e) = std::fs::rename(&tmp, path) {
        if kept_previous {
            let _ = std::fs::remove_file(&previous);
        }
        let _ = std::fs::remove_file(&tmp);

        return Err(e.to_string());
    }

    if kept_previous {
        secure_delete_file(&previous);
    }

    Ok(())
}

fn open_sealed_identity(wrap_key: &[u8; 32], data: &[u8]) -> Result<StoredIdentity, String> {
    let plaintext = Zeroizing::new(aead_open(wrap_key, MAGIC_ID, data)?);
    serde_json::from_slice(&plaintext).map_err(|e| format!("identity decode: {}", e))
}

fn parse_legacy_identity(data: &[u8]) -> Result<StoredIdentity, String> {
    let bytes = Zeroizing::new(
        URL_SAFE_NO_PAD
            .decode(data)
            .map_err(|e| format!("legacy identity decode: {}", e))?,
    );
    serde_json::from_slice(&bytes).map_err(|e| format!("legacy identity decode: {}", e))
}

fn unreadable_identity_path(identity_path: &std::path::Path) -> std::path::PathBuf {
    identity_path.with_file_name(UNREADABLE_IDENTITY_FILE_NAME)
}

fn move_identity_aside(path: &std::path::Path) -> std::io::Result<std::path::PathBuf> {
    let backup = unreadable_identity_path(path);

    if backup.exists() {
        secure_delete_file(&backup);
    }
    std::fs::rename(path, &backup)?;
    Ok(backup)
}

fn set_aside_unreadable_identity(path: &std::path::Path, reason: &str) -> Result<(), String> {
    move_identity_aside(path).map_err(|e| {
        format!(
            "device identity is unreadable ({}) and could not be set aside: {}",
            reason, e
        )
    })?;

    auth_store_clear_all();
    delete_all_passphrase_files();
    tracing::warn!("device identity was unreadable and has been replaced: {}", reason);
    crate::boot_guard::log_line(&format!(
        "device identity was unreadable and was set aside, a new one will be created: {}",
        reason
    ));
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
                        match save_stored(&stored) {
                            Ok(()) => {
                                let _ = entry.delete_credential();
                            }
                            Err(e) => {
                                tracing::warn!("identity keychain-to-file migration deferred: {}", e);
                            }
                        }
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
                return match open_sealed_identity(&wrap_key, &data) {
                    Ok(stored) => Ok(Some(stored)),
                    Err(e) => {
                        set_aside_unreadable_identity(&path, &e)?;
                        Ok(None)
                    }
                };
            }
        }
    }

    let stored = match parse_legacy_identity(&data) {
        Ok(stored) => stored,
        Err(e) => {
            set_aside_unreadable_identity(&path, &e)?;
            return Ok(None);
        }
    };
    if let Err(e) = save_stored(&stored) {
        tracing::warn!("identity legacy-to-v2 migration deferred: {}", e);
        restrict_legacy_file(&path);
    }
    Ok(Some(stored))
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
fn system32_tool(name: &str) -> std::path::PathBuf {
    std::env::var_os("SystemRoot")
        .map(std::path::PathBuf::from)
        .filter(|root| root.is_absolute())
        .unwrap_or_else(|| std::path::PathBuf::from("C:\\Windows"))
        .join("System32")
        .join(name)
}

#[cfg(any(windows, test))]
fn parse_account_sid(output: &str) -> Option<String> {
    let sid = output.trim().rsplit(',').next()?.trim().trim_matches('"');
    let well_formed = sid.starts_with("S-1-")
        && sid.len() <= 184
        && sid[2..]
            .split('-')
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()));

    well_formed.then(|| sid.to_string())
}

#[cfg(windows)]
fn current_account_sid() -> Option<&'static str> {
    use std::os::windows::process::CommandExt;
    static SID: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();

    SID.get_or_init(|| {
        let out = std::process::Command::new(system32_tool("whoami.exe"))
            .args(["/user", "/fo", "csv", "/nh"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;

        if !out.status.success() {
            return None;
        }
        parse_account_sid(&String::from_utf8_lossy(&out.stdout))
    })
    .as_deref()
}

#[cfg(windows)]
fn grant_only(path: &std::path::Path, trustee: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new(system32_tool("icacls.exe"))
        .arg(path)
        .args(["/inheritance:r", "/grant:r"])
        .arg(format!("{}:(F)", trustee))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("icacls could not run: {}", e))?;

    if out.status.success() {
        return Ok(());
    }
    Err(format!(
        "{} {}",
        String::from_utf8_lossy(&out.stdout).trim(),
        String::from_utf8_lossy(&out.stderr).trim()
    )
    .trim()
    .to_string())
}

#[cfg(windows)]
fn restrict_to_current_account(path: &std::path::Path) -> Result<(), String> {
    let mut failure = "the current account could not be resolved".to_string();

    if let Some(sid) = current_account_sid() {
        match grant_only(path, &format!("*{}", sid)) {
            Ok(()) => return Ok(()),
            Err(e) => failure = e,
        }
    }

    let user = whoami::username()
        .unwrap_or_else(|_| std::env::var("USERNAME").unwrap_or_default());

    if !user.is_empty() {
        match grant_only(path, &user) {
            Ok(()) => return Ok(()),
            Err(e) => failure = e,
        }
    }

    Err(format!(
        "could not restrict {} to the current account: {}",
        path.display(),
        failure
    ))
}

fn set_file_permissions_restrictive(path: &std::path::Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("could not restrict {}: {}", path.display(), e))?;
    }
    #[cfg(windows)]
    restrict_to_current_account(path)?;
    #[cfg(not(any(unix, windows)))]
    let _ = path;
    Ok(())
}

fn restrict_legacy_file(path: &std::path::Path) {
    if let Err(e) = set_file_permissions_restrictive(path) {
        tracing::warn!("{}", e);
    }
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

    let ed25519_signing_key = SigningKey::generate(&mut UnwrapErr(SysRng));
    let ed25519_sk_bytes = ed25519_signing_key.to_bytes();

    let (dk, ek): (MlKemDecapKey, MlKemEncapKey) = MlKem768::generate(&mut OsRng);
    let mlkem_sk_bytes = dk.as_bytes().to_vec();
    let mlkem_pk_bytes = ek.as_bytes().to_vec();

    let x25519_static_secret = StaticSecret::random_from_rng(&mut UnwrapErr(SysRng));
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
    let id = get_or_create_device_identity().inspect_err(|e| {
        tracing::warn!("device keys could not be prepared: {}", e);
        crate::boot_guard::log_line(&format!("device keys could not be prepared: {}", e));
    })?;
    let ed25519_pk = b64url(id.ed25519_signing_key.verifying_key().as_bytes());
    let mlkem_pk = b64url(&id.mlkem_encaps_key_bytes);
    let x25519_pk = b64url(&id.x25519_public_bytes);
    Ok(DevicePubkeys {
        device_id: id.device_id.map(|u| u.to_string()),
        ed25519_pk,
        mlkem_pk,
        x25519_pk,
        machine_name: device_machine_name(),
    })
}

fn device_machine_name() -> String {
    [whoami::devicename().ok(), whoami::hostname().ok()]
        .into_iter()
        .flatten()
        .find_map(|candidate| clean_machine_name(&candidate))
        .unwrap_or_else(|| MACHINE_NAME_FALLBACK.to_string())
}

fn clean_machine_name(raw: &str) -> Option<String> {
    let collapsed = raw
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let clipped: String = collapsed.chars().take(MACHINE_NAME_MAX_CHARS).collect();
    let trimmed = clipped.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[tauri::command]
pub fn device_set_id(device_id: String) -> Result<(), String> {
    let parsed = Uuid::parse_str(&device_id).map_err(|e| e.to_string())?;
    let mut stored = load_stored()?.ok_or_else(|| "no device identity".to_string())?;
    stored.device_id = Some(parsed);
    save_stored(&stored)
}

const DEVICE_LOGIN_NONCE_LEN: usize = 32;
const DEVICE_LOGIN_SIGNATURE_CONTEXT: &[u8] = b"astermail-device-login-v2\0";

fn challenge_signing_input(nonce: &[u8], signature_version: Option<u8>) -> Result<Vec<u8>, String> {
    if nonce.len() != DEVICE_LOGIN_NONCE_LEN {
        return Err("invalid challenge".to_string());
    }

    match signature_version {
        None => super::challenge::device_challenge_message(nonce),
        Some(1) => Ok(nonce.to_vec()),
        Some(2) => Ok([DEVICE_LOGIN_SIGNATURE_CONTEXT, nonce].concat()),
        Some(_) => Err("unsupported challenge version".to_string()),
    }
}

#[tauri::command]
pub fn device_sign_challenge(
    window: tauri::WebviewWindow,
    nonce_b64: String,
    signature_version: Option<u8>,
) -> Result<String, String> {
    require_primary_webview(&window)?;
    let nonce = b64url_decode(&nonce_b64)?;
    let input = challenge_signing_input(&nonce, signature_version)?;
    let id = get_or_create_device_identity()?;
    let sig = id.ed25519_signing_key.sign(&input);
    Ok(b64url(&sig.to_bytes()))
}

const ENROLL_INFO_V1: &[u8] = b"astermail-device-enroll-v1";
const ENROLL_INFO_V2: &[u8] = b"astermail-device-enroll-v2";
const ENVELOPE_V2_MAGIC: &[u8; 4] = b"AEV2";
const ENVELOPE_EPH_LEN: usize = 32;
const ENVELOPE_MLKEM_CT_LEN: usize = 1088;
const ENVELOPE_NONCE_LEN: usize = 24;
const ENVELOPE_HEADER_LEN: usize = ENVELOPE_EPH_LEN + ENVELOPE_MLKEM_CT_LEN + ENVELOPE_NONCE_LEN;
const ENVELOPE_TAG_LEN: usize = 16;

fn envelope_v2_transcript(id: &DeviceIdentity, eph_pk: &[u8], mlkem_ct: &[u8]) -> [u8; 32] {
    use sha2::Digest;

    let mut hasher = Sha256::new();
    hasher.update(ENROLL_INFO_V2);
    hasher.update(ENVELOPE_V2_MAGIC);
    hasher.update(id.ed25519_signing_key.verifying_key().as_bytes());
    hasher.update(&id.mlkem_encaps_key_bytes);
    hasher.update(id.x25519_public_bytes);
    hasher.update(eph_pk);
    hasher.update(mlkem_ct);
    hasher.finalize().into()
}

fn open_device_envelope(data: &[u8], id: &DeviceIdentity) -> Result<Zeroizing<Vec<u8>>, String> {
    let (body, versioned) = match data.strip_prefix(ENVELOPE_V2_MAGIC.as_slice()) {
        Some(rest) => (rest, true),
        None => (data, false),
    };
    if body.len() < ENVELOPE_HEADER_LEN + ENVELOPE_TAG_LEN {
        return Err("envelope too short".to_string());
    }
    let eph_bytes: [u8; ENVELOPE_EPH_LEN] =
        body[..ENVELOPE_EPH_LEN].try_into().map_err(|_| "slice")?;
    let mlkem_ct_bytes = &body[ENVELOPE_EPH_LEN..ENVELOPE_EPH_LEN + ENVELOPE_MLKEM_CT_LEN];
    let nonce_bytes: [u8; ENVELOPE_NONCE_LEN] = body
        [ENVELOPE_EPH_LEN + ENVELOPE_MLKEM_CT_LEN..ENVELOPE_HEADER_LEN]
        .try_into()
        .map_err(|_| "slice")?;
    let ciphertext = &body[ENVELOPE_HEADER_LEN..];
    let transcript = versioned.then(|| envelope_v2_transcript(id, &eph_bytes, mlkem_ct_bytes));

    let ct: Ciphertext<MlKem768> =
        Array::try_from(mlkem_ct_bytes).map_err(|e: _| format!("ct size: {:?}", e))?;
    let mut ss_pq = id
        .mlkem_decaps_key
        .decapsulate(&ct)
        .map_err(|e| format!("mlkem decaps: {:?}", e))?;
    let ss_cl = id
        .x25519_static_secret
        .diffie_hellman(&XPublicKey::from(eph_bytes));

    let mut ikm = Zeroizing::new([0u8; 64]);
    ikm[..32].copy_from_slice(ss_pq.as_slice());
    ikm[32..].copy_from_slice(ss_cl.as_bytes());
    ss_pq.zeroize();
    drop(ss_cl);

    let mut info = Vec::with_capacity(ENROLL_INFO_V2.len() + 32);
    match &transcript {
        Some(hash) => {
            info.extend_from_slice(ENROLL_INFO_V2);
            info.extend_from_slice(hash);
        }
        None => info.extend_from_slice(ENROLL_INFO_V1),
    }
    let mut shared_key = Zeroizing::new([0u8; 32]);
    Hkdf::<Sha256>::new(Some(&nonce_bytes), ikm.as_slice())
        .expand(&info, shared_key.as_mut_slice())
        .map_err(|e| e.to_string())?;

    let cipher = XChaCha20Poly1305::new((&*shared_key).into());
    let xnonce = &XNonce::from(nonce_bytes);
    let opened = match transcript {
        Some(hash) => {
            let mut aad = Vec::with_capacity(ENVELOPE_V2_MAGIC.len() + hash.len());
            aad.extend_from_slice(ENVELOPE_V2_MAGIC);
            aad.extend_from_slice(&hash);
            cipher.decrypt(xnonce, Payload { msg: ciphertext, aad: &aad })
        }
        None => cipher.decrypt(xnonce, ciphertext),
    };
    opened
        .map(Zeroizing::new)
        .map_err(|e| format!("decrypt: {:?}", e))
}

fn is_local_app_url(url: &tauri::Url, allow_dev_hosts: bool) -> bool {
    let host = url.host_str().unwrap_or("");
    match url.scheme() {
        "tauri" => host == "localhost",
        "http" | "https" => {
            host == "tauri.localhost"
                || (allow_dev_hosts && matches!(host, "127.0.0.1" | "localhost"))
        }
        _ => false,
    }
}

fn require_primary_webview(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("command not available in this window".to_string());
    }
    let url = window
        .url()
        .map_err(|_| "command not available in this window".to_string())?;
    if !is_local_app_url(&url, cfg!(debug_assertions)) {
        return Err("command not available on this page".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn device_unseal_vault_envelope(
    window: tauri::WebviewWindow,
    envelope_b64: String,
    device_id: Option<String>,
) -> Result<String, String> {
    require_primary_webview(&window)?;
    let target_device = resolve_passphrase_device(device_id)?;
    let data = b64url_decode(&envelope_b64)?;
    let id = get_or_create_device_identity()?;
    let plaintext = open_device_envelope(&data, &id)?;

    let encoded = b64url(&plaintext);
    let path = match target_device {
        Some(id) => passphrase_file_path_for(id)?,
        None => passphrase_file_path()?,
    };
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
            restrict_legacy_file(path);
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

fn is_pin_sealed_blob(data: &[u8]) -> bool {
    data.len() >= 8 && &data[..8] == MAGIC_PL
}

fn pin_sealed_blob(wrap_key: Option<&[u8; 32]>, record: &[u8]) -> Result<Vec<u8>, String> {
    match wrap_key {
        Some(key) => aead_seal(key, MAGIC_PL, record),
        None => Ok(MAGIC_PL.to_vec()),
    }
}

fn pin_seal_passphrase_file(
    path: &std::path::Path,
    wrap_key: Option<&[u8; 32]>,
    record: &[u8],
) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let blob = pin_sealed_blob(wrap_key, record)?;
    atomic_write(path, &blob)?;
    Ok(true)
}

fn pin_restore_passphrase_file(
    path: &std::path::Path,
    wrap_key: &[u8; 32],
    raw: &[u8],
) -> Result<bool, String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(false);
    };
    if !is_pin_sealed_blob(&data) {
        return Ok(false);
    }
    let blob = aead_seal(wrap_key, MAGIC_PP, raw)?;
    atomic_write(path, &blob)?;
    Ok(true)
}

fn read_passphrase_file(path: &std::path::Path) -> Result<Option<String>, String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;

    if is_pin_sealed_blob(&data) {
        return Err(PIN_LOCKED_ERROR.to_string());
    }

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
    reseal_legacy_passphrase(path, &raw);
    Ok(Some(s))
}

fn locate_passphrase_file(
    device_id: Option<String>,
) -> Result<Option<std::path::PathBuf>, String> {
    let requested = parse_device_id(device_id)?;
    let stored_device = load_stored()?.and_then(|stored| stored.device_id);
    let target = requested.or(stored_device);

    if let Some(id) = target {
        let scoped = passphrase_file_path_for(id)?;
        if scoped.exists() {
            return Ok(Some(scoped));
        }
    }

    let legacy = passphrase_file_path()?;
    if !legacy.exists() {
        return Ok(None);
    }

    let legacy_belongs_to_target = match (requested, stored_device) {
        (Some(wanted), Some(owner)) => wanted == owner,
        _ => true,
    };
    if !legacy_belongs_to_target {
        return Ok(None);
    }

    if let Some(id) = target {
        let scoped = passphrase_file_path_for(id)?;
        if std::fs::rename(&legacy, &scoped).is_ok() {
            return Ok(Some(scoped));
        }
    }

    Ok(Some(legacy))
}

#[tauri::command]
pub fn device_get_stored_passphrase(
    window: tauri::WebviewWindow,
    device_id: Option<String>,
) -> Result<Option<String>, String> {
    require_primary_webview(&window)?;
    let Some(path) = locate_passphrase_file(device_id)? else {
        return Ok(None);
    };

    read_passphrase_file(&path)
}

#[tauri::command]
pub fn device_pin_seal_stored_passphrase(
    window: tauri::WebviewWindow,
    device_id: String,
    record: String,
) -> Result<bool, String> {
    require_primary_webview(&window)?;
    let Some(path) = locate_passphrase_file(Some(device_id))? else {
        return Ok(false);
    };
    let wrap_key = wrap_key_load_or_create().ok();

    pin_seal_passphrase_file(&path, wrap_key.as_ref(), record.as_bytes())
}

#[tauri::command]
pub fn device_pin_restore_stored_passphrase(
    window: tauri::WebviewWindow,
    device_id: String,
    passphrase_b64: String,
) -> Result<bool, String> {
    require_primary_webview(&window)?;
    let Some(path) = locate_passphrase_file(Some(device_id))? else {
        return Ok(false);
    };
    let raw = Zeroizing::new(b64url_decode(&passphrase_b64)?);
    let wrap_key = wrap_key_load_or_create()?;

    pin_restore_passphrase_file(&path, &wrap_key, &raw)
}

fn seal_local_secret(wrap_key: &[u8; 32], value: &[u8]) -> Result<Vec<u8>, String> {
    if value.is_empty() || value.len() > LOCAL_SECRET_MAX_BYTES {
        return Err("invalid local secret".to_string());
    }

    aead_seal(wrap_key, MAGIC_LS, value)
}

fn open_local_secret(wrap_key: &[u8; 32], sealed: &[u8]) -> Result<Vec<u8>, String> {
    if sealed.len() > 8 + 24 + 16 + LOCAL_SECRET_MAX_BYTES {
        return Err("invalid local secret".to_string());
    }

    aead_open(wrap_key, MAGIC_LS, sealed)
}

#[tauri::command]
pub fn device_seal_local_secret(
    window: tauri::WebviewWindow,
    value_b64: String,
) -> Result<String, String> {
    require_primary_webview(&window)?;
    let value = Zeroizing::new(b64url_decode(&value_b64)?);
    let wrap_key = Zeroizing::new(wrap_key_load_or_create()?);

    Ok(b64url(&seal_local_secret(&wrap_key, &value)?))
}

#[tauri::command]
pub fn device_open_local_secret(
    window: tauri::WebviewWindow,
    sealed_b64: String,
) -> Result<Option<String>, String> {
    require_primary_webview(&window)?;
    let sealed = b64url_decode(&sealed_b64)?;
    let Some(wrap_key) = wrap_key_load()? else {
        return Ok(None);
    };
    let wrap_key = Zeroizing::new(wrap_key);
    let value = Zeroizing::new(open_local_secret(&wrap_key, &sealed)?);

    Ok(Some(b64url(&value)))
}

#[tauri::command]
pub fn device_auth_store_set(
    window: tauri::WebviewWindow,
    slot: String,
    value: String,
) -> Result<(), String> {
    require_primary_webview(&window)?;

    if value.is_empty() || value.len() > AUTH_VALUE_MAX_BYTES {
        return Err("invalid auth value".to_string());
    }

    auth_store_write(&slot, &value)
}

#[tauri::command]
pub fn device_auth_store_get(
    window: tauri::WebviewWindow,
    slot: String,
) -> Result<Option<String>, String> {
    require_primary_webview(&window)?;
    auth_store_read(&slot)
}

#[tauri::command]
pub fn device_auth_store_clear(window: tauri::WebviewWindow) -> Result<(), String> {
    require_primary_webview(&window)?;
    auth_store_clear_all();
    Ok(())
}

#[tauri::command]
pub fn device_refresh_token_set(
    window: tauri::WebviewWindow,
    account_id: String,
    value: String,
) -> Result<(), String> {
    require_primary_webview(&window)?;

    if !valid_refresh_account_id(&account_id) {
        return Err("invalid account".to_string());
    }
    if value.is_empty() || value.len() > AUTH_VALUE_MAX_BYTES {
        return Err("invalid auth value".to_string());
    }

    let _guard = REFRESH_STORE_LOCK.lock().map_err(|e| e.to_string())?;
    let wrap_key = Zeroizing::new(wrap_key_load_or_create()?);
    let mut map = refresh_store_load(&wrap_key).unwrap_or_default();

    if let Some(mut previous) = map.insert(account_id, value) {
        previous.zeroize();
    }
    let result = refresh_store_save(&wrap_key, &map);

    zeroize_refresh_map(&mut map);
    result
}

#[tauri::command]
pub fn device_refresh_token_get(
    window: tauri::WebviewWindow,
    account_id: String,
) -> Result<Option<String>, String> {
    require_primary_webview(&window)?;

    if !valid_refresh_account_id(&account_id) {
        return Err("invalid account".to_string());
    }

    let _guard = REFRESH_STORE_LOCK.lock().map_err(|e| e.to_string())?;

    if !auth_file_path(REFRESH_FILE_NAME)?.exists() {
        return Ok(None);
    }
    let wrap_key = match wrap_key_load()? {
        Some(key) => Zeroizing::new(key),
        None => return Ok(None),
    };
    let mut map = refresh_store_load(&wrap_key)?;
    let value = map.remove(&account_id);

    zeroize_refresh_map(&mut map);
    Ok(value)
}

#[tauri::command]
pub fn device_refresh_token_remove(
    window: tauri::WebviewWindow,
    account_id: String,
) -> Result<(), String> {
    require_primary_webview(&window)?;

    if !valid_refresh_account_id(&account_id) {
        return Err("invalid account".to_string());
    }

    let _guard = REFRESH_STORE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = auth_file_path(REFRESH_FILE_NAME)?;

    if !path.exists() {
        return Ok(());
    }
    let wrap_key = match wrap_key_load()? {
        Some(key) => Zeroizing::new(key),
        None => return Ok(()),
    };
    let mut map = match refresh_store_load(&wrap_key) {
        Ok(map) => map,
        Err(_) => {
            secure_delete_file(&path);

            return Ok(());
        }
    };
    let result = match map.remove(&account_id) {
        Some(mut removed) => {
            removed.zeroize();
            refresh_store_save(&wrap_key, &map)
        }
        None => Ok(()),
    };

    zeroize_refresh_map(&mut map);
    result
}

#[tauri::command]
pub fn device_refresh_token_clear(window: tauri::WebviewWindow) -> Result<(), String> {
    require_primary_webview(&window)?;

    let _guard = REFRESH_STORE_LOCK.lock().map_err(|e| e.to_string())?;

    if !secure_delete_file(&auth_file_path(REFRESH_FILE_NAME)?) {
        return Err("stored session file could not be removed".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn device_forget_account(
    window: tauri::WebviewWindow,
    device_id: String,
) -> Result<(), String> {
    require_primary_webview(&window)?;
    let parsed = Uuid::parse_str(&device_id).map_err(|e| e.to_string())?;

    if let Ok(path) = passphrase_file_path_for(parsed) {
        secure_delete_file(&path);
    }
    if let Some(mut stored) = load_stored()? {
        if stored.device_id == Some(parsed) {
            if let Ok(path) = passphrase_file_path() {
                secure_delete_file(&path);
            }
            stored.device_id = None;
            save_stored(&stored)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn device_clear_session(window: tauri::WebviewWindow) -> Result<(), String> {
    require_primary_webview(&window)?;
    auth_store_clear_all();
    delete_all_passphrase_files();

    if let Some(mut stored) = load_stored()? {
        stored.device_id = None;
        save_stored(&stored)?;
    }
    Ok(())
}

#[tauri::command]
pub fn device_clear_identity(window: tauri::WebviewWindow) -> Result<(), String> {
    require_primary_webview(&window)?;

    let mut removed = auth_store_clear_all();

    removed &= delete_all_passphrase_files();

    if let Ok(path) = identity_file_path() {
        removed &= secure_delete_file(&path);
        removed &= secure_delete_file(&unreadable_identity_path(&path));
    }
    let _ = keyring_delete(KEYRING_IDENTITY_USER);
    let _ = wrap_key_delete();

    if !removed {
        return Err("device files could not be removed".to_string());
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[cfg(target_os = "windows")]
pub(crate) const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (Windows; Tauri)";
#[cfg(target_os = "macos")]
pub(crate) const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (macOS; Tauri)";
#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) const DESKTOP_USER_AGENT: &str = "AsterMail-Desktop/1.0 (Linux; Tauri)";

const DEVICE_FORWARDED_HEADERS: &[&str] = &[
    "content-type",
    "authorization",
    "x-csrf-token",
    "x-folder-unlock",
    "x-aster-vault-level",
    "x-aster-device-id",
];

fn is_device_header_allowed(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    DEVICE_FORWARDED_HEADERS.contains(&n.as_str())
}

const ALLOWED_HTTPS_SUFFIXES: &[&str] = &[".astermail.org"];
const ALLOWED_HTTPS_EXACT: &[&str] = &["astermail.org"];

fn is_device_http_host_allowed(host: &str) -> bool {
    ALLOWED_HTTPS_EXACT.iter().any(|h| *h == host)
        || ALLOWED_HTTPS_SUFFIXES.iter().any(|s| host.ends_with(s))
}

#[tauri::command]
pub async fn device_http_request(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<ProxyResponse, String> {
    const MAX_REQUEST_BODY_SIZE: usize = 100 * 1024 * 1024;
    const LARGE_BODY_THRESHOLD: usize = 1024 * 1024;
    const LARGE_BODY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(900);

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

    if !is_device_http_host_allowed(host) {
        return Err("host not in device_http_request allowlist".to_string());
    }

    if let Some(b) = &body {
        if b.len() > MAX_REQUEST_BODY_SIZE {
            return Err(format!(
                "request body too large: {} bytes exceeds 100MB limit",
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
        if b.len() > LARGE_BODY_THRESHOLD {
            req = req.timeout(LARGE_BODY_TIMEOUT);
        }
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

const MAX_PBKDF2_BITS: u32 = 4096;

fn hkdf_max_bits(hash: &str) -> Result<u32, String> {
    match hash.to_uppercase().as_str() {
        "SHA-256" => Ok(255 * 32 * 8),
        "SHA-512" => Ok(255 * 64 * 8),
        _ => Err(format!("unsupported hash: {}", hash)),
    }
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
    if bits > MAX_PBKDF2_BITS {
        return Err(format!("bits {} exceeds maximum of {}", bits, MAX_PBKDF2_BITS));
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
    let max_bits = hkdf_max_bits(&hash)?;
    if bits > max_bits {
        return Err(format!("bits {} exceeds maximum of {} for {}", bits, max_bits, hash));
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
    aad: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, Payload}};
    if iv.len() != 12 {
        return Err("aes-gcm iv must be 12 bytes".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = &Nonce::try_from(iv.as_slice())
        .map_err(|_| "aes-gcm iv must be 12 bytes".to_string())?;
    let aad = aad.unwrap_or_default();
    cipher
        .encrypt(nonce, Payload { msg: &data, aad: &aad })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn crypto_aes_gcm_decrypt(
    key: Vec<u8>,
    iv: Vec<u8>,
    data: Vec<u8>,
    aad: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, Payload}};
    if iv.len() != 12 {
        return Err("aes-gcm iv must be 12 bytes".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = &Nonce::try_from(iv.as_slice())
        .map_err(|_| "aes-gcm iv must be 12 bytes".to_string())?;
    let aad = aad.unwrap_or_default();
    cipher
        .decrypt(nonce, Payload { msg: &data, aad: &aad })
        .map_err(|e| e.to_string())
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

    fn envelope_vector() -> HashMap<String, String> {
        include_str!("../../../src/lib/crypto/device_envelope_vector.txt")
            .lines()
            .filter_map(|line| line.split_once('='))
            .map(|(key, value)| (key.to_string(), value.trim().to_string()))
            .collect()
    }

    fn vector_identity(vector: &HashMap<String, String>, ed25519_seed: u8) -> DeviceIdentity {
        let decaps = b64url_decode(&vector["mlkem_decaps"]).unwrap();
        let encoded = ml_kem::Encoded::<MlKemDecapKey>::try_from(decaps.as_slice()).unwrap();
        let scalar: [u8; 32] = b64url_decode(&vector["x25519_scalar"]).unwrap().try_into().unwrap();
        let x25519_static_secret = StaticSecret::from(scalar);
        DeviceIdentity {
            device_id: None,
            ed25519_signing_key: SigningKey::from_bytes(&[ed25519_seed; 32]),
            mlkem_decaps_key: MlKemDecapKey::from_bytes(&encoded),
            mlkem_encaps_key_bytes: b64url_decode(&vector["mlkem_pk"]).unwrap(),
            x25519_public_bytes: *XPublicKey::from(&x25519_static_secret).as_bytes(),
            x25519_static_secret,
        }
    }

    #[test]
    fn device_envelope_vector_keys_match() {
        let vector = envelope_vector();
        let id = vector_identity(&vector, 0x11);
        assert_eq!(b64url(&id.x25519_public_bytes), vector["x25519_pk"]);
        assert_eq!(
            b64url(id.ed25519_signing_key.verifying_key().as_bytes()),
            vector["ed25519_pk"]
        );
    }

    #[test]
    fn opens_the_shared_v1_and_v2_vectors() {
        let vector = envelope_vector();
        let id = vector_identity(&vector, 0x11);
        for key in ["envelope", "envelope_v2"] {
            let data = b64url_decode(&vector[key]).unwrap();
            let opened = open_device_envelope(&data, &id).unwrap();
            assert_eq!(opened.as_slice(), vector["plaintext"].as_bytes(), "{key}");
        }
    }

    #[test]
    fn v2_envelope_is_bound_to_the_device_signing_key() {
        let vector = envelope_vector();
        let other = vector_identity(&vector, 0x12);
        let v2 = b64url_decode(&vector["envelope_v2"]).unwrap();
        assert!(open_device_envelope(&v2, &other).is_err());
        let v1 = b64url_decode(&vector["envelope"]).unwrap();
        assert!(open_device_envelope(&v1, &other).is_ok());
    }

    #[test]
    fn v2_envelope_rejects_a_stripped_version_header() {
        let vector = envelope_vector();
        let id = vector_identity(&vector, 0x11);
        let v2 = b64url_decode(&vector["envelope_v2"]).unwrap();
        assert!(open_device_envelope(&v2[ENVELOPE_V2_MAGIC.len()..], &id).is_err());
    }

    #[test]
    fn v2_envelope_rejects_tampering() {
        let vector = envelope_vector();
        let id = vector_identity(&vector, 0x11);
        let v2 = b64url_decode(&vector["envelope_v2"]).unwrap();
        for index in [4, 4 + ENVELOPE_EPH_LEN, 4 + ENVELOPE_HEADER_LEN - 1, v2.len() - 1] {
            let mut tampered = v2.clone();
            tampered[index] ^= 1;
            assert!(open_device_envelope(&tampered, &id).is_err(), "byte {index}");
        }
    }

    #[test]
    fn device_envelope_rejects_short_input() {
        let vector = envelope_vector();
        let id = vector_identity(&vector, 0x11);
        let v2 = b64url_decode(&vector["envelope_v2"]).unwrap();
        assert!(open_device_envelope(&v2[..4 + ENVELOPE_HEADER_LEN + 15], &id).is_err());
        assert!(open_device_envelope(&[], &id).is_err());
    }

    #[test]
    fn web_app_request_headers_are_forwarded() {
        for name in [
            "Content-Type",
            "Authorization",
            "X-CSRF-Token",
            "X-Folder-Unlock",
            "X-Aster-Vault-Level",
            "X-Aster-Device-Id",
        ] {
            assert!(is_device_header_allowed(name), "{name}");
            assert!(is_device_header_allowed(&name.to_ascii_lowercase()), "{name}");
        }
    }

    #[test]
    fn other_request_headers_are_dropped() {
        for name in [
            "X-Aster-Client",
            "X-Aster-Other",
            "Cookie",
            "Origin",
            "Referer",
            "Host",
            "User-Agent",
            "X-Forwarded-For",
        ] {
            assert!(!is_device_header_allowed(name), "{name}");
        }
    }

    #[test]
    fn local_app_urls_are_accepted() {
        for url in ["tauri://localhost/", "http://tauri.localhost/", "https://tauri.localhost/mail"] {
            assert!(is_local_app_url(&tauri::Url::parse(url).unwrap(), false), "{url}");
        }
    }

    #[test]
    fn remote_and_dev_urls_are_rejected_in_release() {
        for url in [
            "https://hooks.stripe.com/",
            "https://evil.astermail.org/",
            "https://tauri.localhost.evil.com/",
            "tauri://evil/",
            "http://127.0.0.1:1420/",
            "about:blank",
        ] {
            assert!(!is_local_app_url(&tauri::Url::parse(url).unwrap(), false), "{url}");
        }
        assert!(is_local_app_url(&tauri::Url::parse("http://127.0.0.1:1420/").unwrap(), true));
    }

    #[test]
    fn kdf_output_limits() {
        assert_eq!(hkdf_max_bits("SHA-256").unwrap(), 65_280);
        assert_eq!(hkdf_max_bits("sha-512").unwrap(), 130_560);
        assert!(hkdf_max_bits("SHA-1").is_err());
        assert!(crypto_pbkdf2(b"pw".to_vec(), b"salt".to_vec(), 1, "SHA-256".into(), 4104).is_err());
        assert_eq!(crypto_pbkdf2(b"pw".to_vec(), b"salt".to_vec(), 1, "SHA-256".into(), 256).unwrap().len(), 32);
        assert!(crypto_hkdf(vec![1; 32], vec![], vec![], "SHA-256".into(), 65_288).is_err());
        assert_eq!(crypto_hkdf(vec![1; 32], vec![], vec![], "SHA-256".into(), 512).unwrap().len(), 64);
    }

    fn test_key(seed: u8) -> [u8; 32] {
        [seed; 32]
    }

    fn scratch_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("aster_device_crypto_test_{}_{}", std::process::id(), name));
        let _ = std::fs::remove_file(&path);
        path
    }

    const OWNED_DOMAINS: &[&str] = &["astermail.org"];

    fn ends_with_owned_domain(entry: &str) -> bool {
        let entry = entry.trim_start_matches('.');
        OWNED_DOMAINS
            .iter()
            .any(|domain| entry == *domain || entry.ends_with(&format!(".{domain}")))
    }

    #[test]
    fn device_http_allowlist_rejects_unowned_astermail_com_hosts() {
        for host in [
            "astermail.com",
            "app.astermail.com",
            "evil.astermail.com",
            "astermail.org.astermail.com",
            "evilastermail.org",
            "astermail.org.example.com",
        ] {
            assert!(!is_device_http_host_allowed(host), "{host}");
        }
    }

    #[test]
    fn device_http_allowlist_keeps_owned_hosts() {
        for host in ["astermail.org", "app.astermail.org", "mail.astermail.org"] {
            assert!(is_device_http_host_allowed(host), "{host}");
        }
    }

    #[test]
    fn device_http_allowlist_entries_are_all_owned_domains() {
        for entry in ALLOWED_HTTPS_SUFFIXES.iter().chain(ALLOWED_HTTPS_EXACT) {
            assert!(ends_with_owned_domain(entry), "{entry}");
            assert!(!entry.ends_with("astermail.com"), "{entry}");
        }
        for suffix in ALLOWED_HTTPS_SUFFIXES {
            assert!(suffix.starts_with('.'), "{suffix}");
        }
    }

    #[tokio::test]
    async fn device_http_request_refuses_astermail_com_before_connecting() {
        for url in [
            "https://astermail.com/api/health",
            "https://app.astermail.com/api/health",
            "https://evil.astermail.com/api/health",
            "https://APP.ASTERMAIL.COM./api/health",
        ] {
            let result = device_http_request(url.to_string(), "GET".to_string(), None, None).await;
            assert_eq!(
                result.err().as_deref(),
                Some("host not in device_http_request allowlist"),
                "{url}"
            );
        }
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

    fn sample_identity_json() -> Vec<u8> {
        serde_json::to_vec(&StoredIdentity {
            device_id: None,
            ed25519_sk_bytes: [7u8; 32],
            mlkem_sk_bytes: vec![1, 2, 3],
            mlkem_pk_bytes: vec![4, 5, 6],
            x25519_sk_bytes: [9u8; 32],
        })
        .unwrap()
    }

    #[test]
    fn sealed_identity_opens_under_its_own_key() {
        let key = test_key(11);
        let sealed = aead_seal(&key, MAGIC_ID, &sample_identity_json()).unwrap();
        let stored = open_sealed_identity(&key, &sealed).unwrap();

        assert_eq!(stored.ed25519_sk_bytes, [7u8; 32]);
        assert_eq!(stored.mlkem_pk_bytes, vec![4, 5, 6]);
    }

    #[test]
    fn sealed_identity_under_another_key_is_reported_unreadable() {
        let sealed = aead_seal(&test_key(12), MAGIC_ID, &sample_identity_json()).unwrap();

        assert!(open_sealed_identity(&test_key(13), &sealed).is_err());
    }

    #[test]
    fn sealed_garbage_is_reported_unreadable() {
        let key = test_key(14);
        let sealed = aead_seal(&key, MAGIC_ID, b"not an identity").unwrap();

        assert!(open_sealed_identity(&key, &sealed).is_err());
    }

    #[test]
    fn legacy_identity_parses_and_garbage_is_unreadable() {
        let encoded = URL_SAFE_NO_PAD.encode(sample_identity_json());

        assert!(parse_legacy_identity(encoded.as_bytes()).is_ok());
        assert!(parse_legacy_identity(b"%%%not base64%%%").is_err());
        assert!(parse_legacy_identity(URL_SAFE_NO_PAD.encode(b"{}").as_bytes()).is_err());
    }

    #[test]
    fn unreadable_identity_is_set_aside_next_to_the_original() {
        let dir = scratch_path("set_aside");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(IDENTITY_FILE_NAME);
        let backup = dir.join(UNREADABLE_IDENTITY_FILE_NAME);
        std::fs::write(&backup, b"older").unwrap();
        std::fs::write(&path, b"current").unwrap();

        assert_eq!(move_identity_aside(&path).unwrap(), backup);
        assert!(!path.exists());
        assert_eq!(std::fs::read(&backup).unwrap(), b"current");
        assert!(move_identity_aside(&path).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keychain_errors_start_with_a_stable_code() {
        let prefix = format!("{}: ", KEYCHAIN_UNAVAILABLE_ERROR);

        assert!(keychain_unavailable_error("cause").starts_with(&prefix));
    }

    #[test]
    fn machine_name_is_cleaned_and_clipped() {
        assert_eq!(clean_machine_name("  example-host \n"), Some("example-host".to_string()));
        assert_eq!(clean_machine_name("a\tb\u{7}c"), Some("a b c".to_string()));
        assert_eq!(clean_machine_name("a \n\n  b"), Some("a b".to_string()));
        assert_eq!(clean_machine_name("   "), None);
        assert_eq!(clean_machine_name("\u{7}\u{0}"), None);
        assert_eq!(clean_machine_name(""), None);

        for unit in ["x", "é", "名"] {
            let raw = unit.repeat(MACHINE_NAME_MAX_CHARS * 3);
            let cleaned = clean_machine_name(&raw).unwrap();
            assert_eq!(cleaned.chars().count(), MACHINE_NAME_MAX_CHARS, "{unit}");
        }

        let edge = format!("{} tail", "x".repeat(MACHINE_NAME_MAX_CHARS - 1));
        let cleaned = clean_machine_name(&edge).unwrap();
        assert_eq!(cleaned, cleaned.trim());
        assert!(cleaned.chars().count() <= MACHINE_NAME_MAX_CHARS);
    }

    #[test]
    fn machine_name_always_meets_the_server_limits() {
        let name = device_machine_name();

        assert!(!name.trim().is_empty());
        assert!(name.chars().count() <= MACHINE_NAME_MAX_CHARS);
    }

    #[test]
    fn local_secret_round_trips_under_its_own_magic() {
        let key = test_key(11);
        let sealed = seal_local_secret(&key, b"inner ciphertext").unwrap();

        assert_eq!(&sealed[..8], MAGIC_LS);
        assert_eq!(open_local_secret(&key, &sealed).unwrap(), b"inner ciphertext");
    }

    #[test]
    fn local_secret_does_not_open_other_sealed_blobs() {
        let key = test_key(12);
        let passphrase_blob = aead_seal(&key, MAGIC_PP, b"secret").unwrap();
        let local_blob = seal_local_secret(&key, b"secret").unwrap();

        assert!(open_local_secret(&key, &passphrase_blob).is_err());
        assert!(aead_open(&key, MAGIC_PP, &local_blob).is_err());
        assert!(aead_open(&key, MAGIC_AUTH, &local_blob).is_err());
    }

    #[test]
    fn local_secret_rejects_the_wrong_key_and_tampering() {
        let sealed = seal_local_secret(&test_key(13), b"secret").unwrap();
        let mut tampered = sealed.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 1;

        assert!(open_local_secret(&test_key(14), &sealed).is_err());
        assert!(open_local_secret(&test_key(13), &tampered).is_err());
        assert!(open_local_secret(&test_key(13), &sealed[..40]).is_err());
    }

    #[test]
    fn local_secret_rejects_empty_and_oversized_values() {
        let key = test_key(15);

        assert!(seal_local_secret(&key, b"").is_err());
        assert!(seal_local_secret(&key, &vec![1u8; LOCAL_SECRET_MAX_BYTES + 1]).is_err());
        assert!(seal_local_secret(&key, &vec![1u8; LOCAL_SECRET_MAX_BYTES]).is_ok());
        assert!(open_local_secret(&key, &vec![0u8; 8 + 24 + 16 + LOCAL_SECRET_MAX_BYTES + 1]).is_err());
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
    fn pin_sealed_blob_is_distinct_from_a_readable_passphrase() {
        let key = test_key(13);
        let sealed = pin_sealed_blob(Some(&key), b"record").unwrap();
        let marker = pin_sealed_blob(None, b"record").unwrap();
        let readable = aead_seal(&key, MAGIC_PP, b"secret").unwrap();

        assert!(is_pin_sealed_blob(&sealed));
        assert!(is_pin_sealed_blob(&marker));
        assert!(!is_pin_sealed_blob(&readable));
        assert!(!is_pin_sealed_blob(b64url(b"secret").as_bytes()));
        assert!(aead_open(&key, MAGIC_PP, &sealed).is_err());
        assert_eq!(aead_open(&key, MAGIC_PL, &sealed).unwrap(), b"record");
    }

    #[test]
    fn pin_seal_replaces_a_readable_passphrase_file() {
        let path = scratch_path("pin_seal_readable");
        let key = test_key(14);
        let passphrase = b"correct horse battery staple";

        atomic_write(&path, &aead_seal(&key, MAGIC_PP, passphrase).unwrap()).unwrap();
        assert!(pin_seal_passphrase_file(&path, Some(&key), b"record").unwrap());

        let after = std::fs::read(&path).unwrap();

        assert!(is_pin_sealed_blob(&after));
        assert!(aead_open(&key, MAGIC_PP, &after).is_err());
        assert_eq!(
            read_passphrase_file(&path).unwrap_err(),
            PIN_LOCKED_ERROR.to_string()
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn pin_seal_replaces_a_legacy_plaintext_file() {
        let path = scratch_path("pin_seal_legacy");
        let legacy = b64url(b"legacy passphrase");

        atomic_write(&path, legacy.as_bytes()).unwrap();
        assert!(pin_seal_passphrase_file(&path, None, b"").unwrap());

        let after = std::fs::read(&path).unwrap();

        assert!(is_pin_sealed_blob(&after));
        assert!(!after.windows(legacy.len()).any(|w| w == legacy.as_bytes()));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn pin_seal_does_not_create_a_missing_file() {
        let path = scratch_path("pin_seal_missing");

        assert!(!pin_seal_passphrase_file(&path, Some(&test_key(15)), b"record").unwrap());
        assert!(!path.exists());
    }

    #[test]
    fn pin_restore_brings_back_a_readable_passphrase() {
        let path = scratch_path("pin_restore");
        let key = test_key(16);

        atomic_write(&path, &pin_sealed_blob(Some(&key), b"record").unwrap()).unwrap();
        assert!(pin_restore_passphrase_file(&path, &key, b"restored").unwrap());

        let after = std::fs::read(&path).unwrap();

        assert!(!is_pin_sealed_blob(&after));
        assert_eq!(aead_open(&key, MAGIC_PP, &after).unwrap(), b"restored");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn pin_restore_leaves_a_readable_or_missing_file_alone() {
        let path = scratch_path("pin_restore_readable");
        let key = test_key(17);
        let original = aead_seal(&key, MAGIC_PP, b"current").unwrap();

        atomic_write(&path, &original).unwrap();
        assert!(!pin_restore_passphrase_file(&path, &key, b"other").unwrap());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert!(!pin_restore_passphrase_file(&scratch_path("pin_restore_none"), &key, b"x").unwrap());

        let _ = std::fs::remove_file(&path);
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
    fn atomic_write_leaves_the_live_file_intact_when_a_stale_link_exists() {
        let path = scratch_path("stale_link");
        let live = vec![0x11u8; 256];
        let next = vec![0x22u8; 256];

        atomic_write(&path, &live).unwrap();
        std::fs::hard_link(&path, path.with_extension("old")).unwrap();

        atomic_write(&path, &next).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), next);
        assert!(!path.with_extension("old").exists());
        assert!(!path.with_extension("tmp").exists());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn atomic_write_cleans_up_when_the_replace_fails() {
        let path = scratch_path("replace_fails");
        let live = vec![0x33u8; 256];

        atomic_write(&path, &live).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("child"), b"x").unwrap();

        assert!(atomic_write(&path, &[0x44u8; 256]).is_err());
        assert!(path.is_dir());
        assert!(!path.with_extension("tmp").exists());
        assert!(!path.with_extension("old").exists());

        let _ = std::fs::remove_dir_all(&path);
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
    fn scoped_passphrase_files_are_per_device_and_match_the_cleanup_filter() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let name_a = passphrase_file_name_for(a);
        let name_b = passphrase_file_name_for(b);

        assert_ne!(name_a, name_b);
        assert!(is_passphrase_file_name(&name_a));
        assert!(is_passphrase_file_name("device_passphrase.bin"));
        assert!(!is_passphrase_file_name("device_identity.bin"));
        assert!(!is_passphrase_file_name("device_wrap.key"));
        assert!(!is_passphrase_file_name("auth_access.bin"));
    }

    #[test]
    fn parse_device_id_accepts_absent_and_valid_ids_only() {
        assert_eq!(parse_device_id(None).unwrap(), None);
        let id = Uuid::new_v4();
        assert_eq!(parse_device_id(Some(id.to_string())).unwrap(), Some(id));
        assert!(parse_device_id(Some("not-a-uuid".to_string())).is_err());
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

    #[test]
    fn auth_slots_map_to_distinct_storage_ids() {
        let (access_user, access_file) = auth_slot_ids(AUTH_SLOT_ACCESS).unwrap();
        let (csrf_user, csrf_file) = auth_slot_ids(AUTH_SLOT_CSRF).unwrap();

        assert_ne!(access_user, csrf_user);
        assert_ne!(access_file, csrf_file);
        assert!(auth_slot_ids("refresh_token").is_err());
    }

    #[test]
    fn auth_slot_files_are_distinct_from_the_device_secret_files() {
        let access = auth_file_path(auth_slot_ids(AUTH_SLOT_ACCESS).unwrap().1).unwrap();
        let csrf = auth_file_path(auth_slot_ids(AUTH_SLOT_CSRF).unwrap().1).unwrap();

        assert_ne!(access, csrf);
        assert_ne!(access, identity_file_path().unwrap());
        assert_ne!(access, passphrase_file_path().unwrap());
        assert_ne!(access, wrap_key_file_path().unwrap());
        assert_ne!(csrf, wrap_key_file_path().unwrap());
    }

    #[test]
    fn refresh_account_ids_are_validated() {
        assert!(valid_refresh_account_id("3f2b0c1e-9d8a-4b7c-a6e5-0123456789ab"));
        assert!(valid_refresh_account_id("account_1"));
        assert!(!valid_refresh_account_id(""));
        assert!(!valid_refresh_account_id("../auth_access"));
        assert!(!valid_refresh_account_id("a b"));
        assert!(!valid_refresh_account_id(&"a".repeat(REFRESH_ACCOUNT_ID_MAX_LEN + 1)));
    }

    #[test]
    fn refresh_map_round_trips_and_is_domain_separated() {
        let key = test_key(11);
        let mut map = HashMap::new();

        map.insert("account-a".to_string(), "refresh-a".to_string());
        map.insert("account-b".to_string(), "refresh-b".to_string());
        let sealed = refresh_map_seal(&key, &map).unwrap();

        assert_eq!(refresh_map_open(&key, &sealed).unwrap(), map);
        assert!(aead_open(&key, MAGIC_AUTH, &sealed).is_err());
        assert!(refresh_map_open(&test_key(12), &sealed).is_err());
        assert!(refresh_map_open(&key, &aead_seal(&key, MAGIC_AUTH, b"{}").unwrap()).is_err());
    }

    #[test]
    fn refresh_file_is_distinct_from_the_other_device_files() {
        let refresh = auth_file_path(REFRESH_FILE_NAME).unwrap();
        let access = auth_file_path(auth_slot_ids(AUTH_SLOT_ACCESS).unwrap().1).unwrap();
        let csrf = auth_file_path(auth_slot_ids(AUTH_SLOT_CSRF).unwrap().1).unwrap();

        assert_ne!(refresh, access);
        assert_ne!(refresh, csrf);
        assert_ne!(refresh, identity_file_path().unwrap());
        assert_ne!(refresh, passphrase_file_path().unwrap());
        assert_ne!(refresh, wrap_key_file_path().unwrap());
        assert!(!is_passphrase_file_name(REFRESH_FILE_NAME));
    }

    #[test]
    fn auth_blobs_do_not_open_under_another_domain() {
        let key = test_key(9);
        let sealed = aead_seal(&key, MAGIC_AUTH, b"header.payload.signature").unwrap();

        assert_eq!(
            aead_open(&key, MAGIC_AUTH, &sealed).unwrap(),
            b"header.payload.signature"
        );
        assert!(aead_open(&key, MAGIC_ID, &sealed).is_err());
        assert!(aead_open(&key, MAGIC_PP, &sealed).is_err());
    }

    #[test]
    fn aes_gcm_commands_bind_the_additional_data() {
        let key = test_key(3).to_vec();
        let iv = vec![5u8; 12];
        let aad = b"ratchet header".to_vec();
        let sealed =
            crypto_aes_gcm_encrypt(key.clone(), iv.clone(), b"hello".to_vec(), Some(aad.clone()))
                .unwrap();

        assert_eq!(
            crypto_aes_gcm_decrypt(key.clone(), iv.clone(), sealed.clone(), Some(aad)).unwrap(),
            b"hello"
        );
        assert!(crypto_aes_gcm_decrypt(key.clone(), iv.clone(), sealed.clone(), None).is_err());
        assert!(
            crypto_aes_gcm_decrypt(key, iv, sealed, Some(b"other header".to_vec())).is_err()
        );
    }

    #[test]
    fn aes_gcm_commands_treat_absent_and_empty_additional_data_alike() {
        let key = test_key(4).to_vec();
        let iv = vec![6u8; 12];
        let sealed = crypto_aes_gcm_encrypt(key.clone(), iv.clone(), b"hi".to_vec(), None).unwrap();

        assert_eq!(
            crypto_aes_gcm_decrypt(key, iv, sealed, Some(Vec::new())).unwrap(),
            b"hi"
        );
    }
}

#[cfg(test)]
mod challenge_signing_tests {
    use super::*;

    #[test]
    fn refuses_anything_that_is_not_a_login_nonce() {
        for len in [0usize, 31, 33, 64, 1024] {
            assert!(challenge_signing_input(&vec![1u8; len], Some(2)).is_err());
            assert!(challenge_signing_input(&vec![1u8; len], None).is_err());
        }
    }

    #[test]
    fn binds_the_login_context_when_the_server_asks_for_it() {
        let nonce = [9u8; DEVICE_LOGIN_NONCE_LEN];
        let input = challenge_signing_input(&nonce, Some(2)).unwrap();
        assert!(input.starts_with(DEVICE_LOGIN_SIGNATURE_CONTEXT));
        assert!(input.ends_with(&nonce));
        assert_eq!(input.len(), DEVICE_LOGIN_SIGNATURE_CONTEXT.len() + nonce.len());
    }

    #[test]
    fn keeps_the_older_server_format() {
        let nonce = [9u8; DEVICE_LOGIN_NONCE_LEN];
        assert_eq!(challenge_signing_input(&nonce, Some(1)).unwrap(), nonce.to_vec());
    }

    #[test]
    fn uses_the_labeled_challenge_when_the_server_names_no_version() {
        let nonce = [9u8; DEVICE_LOGIN_NONCE_LEN];
        assert_eq!(
            challenge_signing_input(&nonce, None).unwrap(),
            super::super::challenge::device_challenge_message(&nonce).unwrap()
        );
    }

    #[test]
    fn refuses_an_unknown_version() {
        assert!(challenge_signing_input(&[9u8; DEVICE_LOGIN_NONCE_LEN], Some(3)).is_err());
    }
}

#[cfg(test)]
mod file_restriction_tests {
    use super::*;

    #[test]
    fn reads_the_account_sid_from_the_last_field() {
        assert_eq!(
            parse_account_sid("\"desk\\sam\",\"S-1-5-21-1-2-3-1001\"\r\n").as_deref(),
            Some("S-1-5-21-1-2-3-1001")
        );
        assert_eq!(
            parse_account_sid("\"a,b\",\"S-1-5-18\"").as_deref(),
            Some("S-1-5-18")
        );
    }

    #[test]
    fn refuses_output_that_is_not_a_sid() {
        for bad in [
            "",
            "\"sam\"",
            "\"sam\",\"S-1-\"",
            "\"sam\",\"S-1-5-x\"",
            "\"sam\",\"Everyone:(F)\"",
            "\"sam\",\"S-1-5-21 /grant x\"",
        ] {
            assert!(parse_account_sid(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn fails_when_the_file_cannot_be_restricted() {
        let missing = std::env::temp_dir()
            .join(format!("aster_absent_{}", std::process::id()))
            .join("none.bin");

        assert!(set_file_permissions_restrictive(&missing).is_err());
    }
}
