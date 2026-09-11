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
use std::ffi::{c_char, CStr, CString};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

const PRODUCT_PREFIX: &str = "org.astermail.ios.";
const MAX_PRODUCT_SUFFIX_LENGTH: usize = 64;
const MAX_PRODUCTS_PER_REQUEST: usize = 32;
const TRANSACTION_EVENT: &str = "aster://storekit-transaction";
const MANAGE_SUBSCRIPTIONS_URL: &str = "https://apps.apple.com/account/subscriptions";
const UNAVAILABLE: &str = "storekit_unavailable";
const INVALID_REPLY: &str = "storekit_invalid_reply";
const INVALID_PRODUCT: &str = "invalid_product";
const INVALID_TRANSACTION: &str = "invalid_transaction";

type ReplyCallback = extern "C" fn(u64, *const c_char);
type TransactionCallback = extern "C" fn(*const c_char);

extern "C" {
    fn aster_storekit_products(product_ids: *const c_char, context: u64, reply: ReplyCallback);
    fn aster_storekit_purchase(
        product_id: *const c_char,
        account_token: *const c_char,
        context: u64,
        reply: ReplyCallback,
    );
    fn aster_storekit_restore(sync: bool, context: u64, reply: ReplyCallback);
    fn aster_storekit_finish(transaction_id: u64, context: u64, reply: ReplyCallback);
    fn aster_storekit_start_listener(on_transaction: TransactionCallback);
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoreTransaction {
    pub transaction_id: String,
    pub original_transaction_id: String,
    pub product_id: String,
    pub signed_transaction: String,
    pub revoked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

static NEXT_CONTEXT: AtomicU64 = AtomicU64::new(1);
static WAITERS: OnceLock<Mutex<HashMap<u64, oneshot::Sender<String>>>> = OnceLock::new();
static PENDING: Mutex<Vec<StoreTransaction>> = Mutex::new(Vec::new());
static APP: OnceLock<AppHandle> = OnceLock::new();

fn waiters() -> &'static Mutex<HashMap<u64, oneshot::Sender<String>>> {
    WAITERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn read_c_string(pointer: *const c_char) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    Some(unsafe { CStr::from_ptr(pointer) }.to_string_lossy().into_owned())
}

extern "C" fn on_reply(context: u64, payload: *const c_char) {
    let text = read_c_string(payload).unwrap_or_default();
    let sender = waiters()
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&context));
    if let Some(sender) = sender {
        let _ = sender.send(text);
    }
}

extern "C" fn on_transaction(payload: *const c_char) {
    let Some(text) = read_c_string(payload) else {
        return;
    };
    let Ok(transaction) = serde_json::from_str::<StoreTransaction>(&text) else {
        return;
    };
    if !is_valid_product_id(&transaction.product_id) {
        return;
    }
    if enqueue(&PENDING, transaction) {
        if let Some(app) = APP.get() {
            let _ = app.emit(TRANSACTION_EVENT, ());
        }
    }
}

fn enqueue(queue: &Mutex<Vec<StoreTransaction>>, transaction: StoreTransaction) -> bool {
    let Ok(mut pending) = queue.lock() else {
        return false;
    };
    if pending
        .iter()
        .any(|existing| existing.transaction_id == transaction.transaction_id)
    {
        return false;
    }
    pending.push(transaction);
    true
}

fn parse_reply(text: &str) -> Result<Value, String> {
    let mut value: Value = serde_json::from_str(text).map_err(|_| INVALID_REPLY.to_string())?;
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        return Err(error.to_string());
    }
    value
        .get_mut("ok")
        .map(Value::take)
        .ok_or_else(|| INVALID_REPLY.to_string())
}

fn is_valid_product_id(product_id: &str) -> bool {
    let Some(suffix) = product_id.strip_prefix(PRODUCT_PREFIX) else {
        return false;
    };
    !suffix.is_empty()
        && suffix.len() <= MAX_PRODUCT_SUFFIX_LENGTH
        && suffix
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_')
}

fn normalize_account_token(token: Option<&str>) -> String {
    token
        .and_then(|value| uuid::Uuid::parse_str(value).ok())
        .map(|value| value.hyphenated().to_string())
        .unwrap_or_default()
}

async fn call_bridge(invoke: impl FnOnce(u64, ReplyCallback)) -> Result<Value, String> {
    let context = NEXT_CONTEXT.fetch_add(1, Ordering::Relaxed);
    let (sender, receiver) = oneshot::channel();
    waiters()
        .lock()
        .map_err(|_| UNAVAILABLE.to_string())?
        .insert(context, sender);
    invoke(context, on_reply);
    let text = receiver.await.map_err(|_| UNAVAILABLE.to_string())?;
    parse_reply(&text)
}

pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    unsafe { aster_storekit_start_listener(on_transaction) };
}

#[tauri::command]
pub async fn storekit_products(product_ids: Vec<String>) -> Result<Value, String> {
    if product_ids.is_empty()
        || product_ids.len() > MAX_PRODUCTS_PER_REQUEST
        || !product_ids.iter().all(|id| is_valid_product_id(id))
    {
        return Err(INVALID_PRODUCT.into());
    }
    let joined = CString::new(product_ids.join(",")).map_err(|_| INVALID_PRODUCT.to_string())?;
    call_bridge(move |context, reply| unsafe {
        aster_storekit_products(joined.as_ptr(), context, reply)
    })
    .await
}

#[tauri::command]
pub async fn storekit_purchase(
    product_id: String,
    app_account_token: Option<String>,
) -> Result<Value, String> {
    if !is_valid_product_id(&product_id) {
        return Err(INVALID_PRODUCT.into());
    }
    let product = CString::new(product_id).map_err(|_| INVALID_PRODUCT.to_string())?;
    let token = CString::new(normalize_account_token(app_account_token.as_deref()))
        .map_err(|_| INVALID_PRODUCT.to_string())?;
    call_bridge(move |context, reply| unsafe {
        aster_storekit_purchase(product.as_ptr(), token.as_ptr(), context, reply)
    })
    .await
}

#[tauri::command]
pub async fn storekit_restore() -> Result<Value, String> {
    call_bridge(|context, reply| unsafe { aster_storekit_restore(true, context, reply) }).await
}

#[tauri::command]
pub async fn storekit_current_entitlements() -> Result<Value, String> {
    call_bridge(|context, reply| unsafe { aster_storekit_restore(false, context, reply) }).await
}

#[tauri::command]
pub async fn storekit_finish(transaction_id: String) -> Result<Value, String> {
    let id: u64 = transaction_id
        .parse()
        .map_err(|_| INVALID_TRANSACTION.to_string())?;
    if let Ok(mut pending) = PENDING.lock() {
        pending.retain(|entry| entry.transaction_id != transaction_id);
    }
    call_bridge(move |context, reply| unsafe { aster_storekit_finish(id, context, reply) }).await
}

#[tauri::command]
pub fn storekit_take_pending() -> Vec<StoreTransaction> {
    PENDING
        .lock()
        .map(|mut pending| std::mem::take(&mut *pending))
        .unwrap_or_default()
}

#[tauri::command]
pub fn storekit_manage_subscriptions(app: AppHandle) {
    crate::open_in_default_handler(&app, MANAGE_SUBSCRIPTIONS_URL.to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str) -> StoreTransaction {
        StoreTransaction {
            transaction_id: id.to_string(),
            original_transaction_id: id.to_string(),
            product_id: "org.astermail.ios.star.monthly".to_string(),
            signed_transaction: "header.payload.signature".to_string(),
            revoked: false,
            expires_at: None,
        }
    }

    #[test]
    fn product_ids_must_use_the_app_store_prefix() {
        assert!(is_valid_product_id("org.astermail.ios.star.monthly"));
        assert!(is_valid_product_id("org.astermail.ios.supernova.yearly"));
        assert!(!is_valid_product_id("org.astermail.ios."));
        assert!(!is_valid_product_id("com.astermail.mail.star.monthly"));
        assert!(!is_valid_product_id("org.astermail.ios.star,monthly"));
        assert!(!is_valid_product_id("org.astermail.ios.Star.monthly"));
    }

    #[test]
    fn reply_unwraps_ok_and_surfaces_errors() {
        assert_eq!(parse_reply(r#"{"ok":true}"#), Ok(Value::Bool(true)));
        assert_eq!(
            parse_reply(r#"{"error":"purchase_failed"}"#),
            Err("purchase_failed".to_string())
        );
        assert_eq!(parse_reply("not json"), Err(INVALID_REPLY.to_string()));
        assert_eq!(parse_reply("{}"), Err(INVALID_REPLY.to_string()));
    }

    #[test]
    fn account_token_accepts_only_uuids() {
        assert_eq!(
            normalize_account_token(Some("6F9619FF-8B86-D011-B42D-00C04FC964FF")),
            "6f9619ff-8b86-d011-b42d-00c04fc964ff"
        );
        assert_eq!(normalize_account_token(Some("not-a-uuid")), "");
        assert_eq!(normalize_account_token(None), "");
    }

    #[test]
    fn pending_queue_skips_duplicate_transactions() {
        let queue = Mutex::new(Vec::new());
        assert!(enqueue(&queue, sample("100")));
        assert!(!enqueue(&queue, sample("100")));
        assert!(enqueue(&queue, sample("101")));
        assert_eq!(queue.lock().expect("lock").len(), 2);
    }

    #[test]
    fn transaction_payload_round_trips() {
        let text = r#"{"transaction_id":"7","original_transaction_id":"5","product_id":"org.astermail.ios.nova.yearly","signed_transaction":"a.b.c","revoked":true}"#;
        let parsed: StoreTransaction = serde_json::from_str(text).expect("parses");
        assert!(parsed.revoked);
        assert_eq!(parsed.expires_at, None);
    }
}
