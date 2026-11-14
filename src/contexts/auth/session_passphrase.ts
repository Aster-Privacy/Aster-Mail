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
import {
  get_or_create_session_key,
  clear_session_key,
  get_session_key_from_db,
  get_session_encryption_key,
  set_session_encryption_key,
  RequiresReauthError,
} from "./session_key_db";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  check_session_expired,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
  safe_session_get,
  safe_session_keys,
  safe_session_remove,
  safe_session_set,
} from "@/lib/safe_storage";
import { is_account_server_wrapped } from "@/services/app_lock_store";
import {
  clear_pending_passphrase,
  forget_all_unlocked_locks,
  get_pending_passphrase,
  get_unlocked_key,
  has_wrapped_passphrase,
  open_wrapped_passphrase,
  read_wrapped_record,
  remove_all_wrapped_passphrases,
  remove_wrapped_passphrase,
  set_pending_passphrase,
  write_wrapped_passphrase,
} from "@/services/app_lock_wrap";
import {
  can_native_seal,
  is_native_sealed,
  native_open_base64,
  native_seal_base64,
} from "@/native/local_secret_seal";

const ENCRYPTED_VAULT_KEY_PREFIX = "astermail_encrypted_vault_";
const VAULT_NONCE_KEY_PREFIX = "astermail_vault_nonce_";
const SESSION_PASSPHRASE_KEY_PREFIX = "astermail_session_passphrase_";
const SESSION_PASSPHRASE_IV_KEY_PREFIX = "astermail_session_passphrase_iv_";
const SESSION_TIMESTAMP_KEY_PREFIX = "astermail_session_timestamp_";
const LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX = "astermail_spf_";
const LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX = "astermail_spf_iv_";

export function store_encrypted_vault(
  account_id: string,
  encrypted_vault: string,
  vault_nonce: string,
): void {
  safe_local_set(ENCRYPTED_VAULT_KEY_PREFIX + account_id, encrypted_vault);
  safe_local_set(VAULT_NONCE_KEY_PREFIX + account_id, vault_nonce);
  safe_local_set(
    SESSION_TIMESTAMP_KEY_PREFIX + account_id,
    Date.now().toString(),
  );
}

export function get_stored_encrypted_vault(account_id: string): {
  encrypted_vault: string;
  vault_nonce: string;
} | null {
  if (check_session_expired(account_id)) {
    clear_stored_encrypted_vault(account_id);
    clear_session_timeout_data(account_id);

    return null;
  }

  const encrypted_vault = safe_local_get(
    ENCRYPTED_VAULT_KEY_PREFIX + account_id,
  );
  const vault_nonce = safe_local_get(VAULT_NONCE_KEY_PREFIX + account_id);

  return encrypted_vault && vault_nonce
    ? { encrypted_vault, vault_nonce }
    : null;
}

export function clear_stored_encrypted_vault(account_id: string): void {
  safe_local_remove(ENCRYPTED_VAULT_KEY_PREFIX + account_id);
  safe_local_remove(VAULT_NONCE_KEY_PREFIX + account_id);
  safe_local_remove(SESSION_TIMESTAMP_KEY_PREFIX + account_id);
}

function read_stored_passphrase(
  account_id: string,
): { encrypted_base64: string; iv_base64: string } | null {
  const local_encrypted = safe_local_get(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
  );
  const local_iv = safe_local_get(
    SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id,
  );

  if (local_encrypted && local_iv) {
    return { encrypted_base64: local_encrypted, iv_base64: local_iv };
  }

  const tab_encrypted = safe_session_get(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
  );
  const tab_iv = safe_session_get(
    SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id,
  );

  if (tab_encrypted && tab_iv) {
    return { encrypted_base64: tab_encrypted, iv_base64: tab_iv };
  }

  return null;
}

function remove_stored_passphrase(account_id: string): void {
  safe_local_remove(SESSION_PASSPHRASE_KEY_PREFIX + account_id);
  safe_local_remove(SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id);
  safe_session_remove(SESSION_PASSPHRASE_KEY_PREFIX + account_id);
  safe_session_remove(SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id);
}

export async function store_session_passphrase(
  account_id: string,
  passphrase: string,
  remember_on_device: boolean = true,
): Promise<void> {
  if (is_account_server_wrapped(account_id)) {
    await store_pin_wrapped_passphrase(
      account_id,
      passphrase,
      remember_on_device,
    );

    return;
  }

  remove_wrapped_passphrase(account_id);
  await store_unwrapped_passphrase(account_id, passphrase, remember_on_device);
}

async function store_pin_wrapped_passphrase(
  account_id: string,
  passphrase: string,
  remember_on_device: boolean,
): Promise<void> {
  const lock_key = get_unlocked_key(account_id);

  if (lock_key) {
    await write_wrapped_passphrase(
      account_id,
      lock_key,
      passphrase,
      remember_on_device,
    );
    clear_pending_passphrase(account_id);
  } else {
    set_pending_passphrase(account_id, passphrase, remember_on_device);
  }

  remove_stored_passphrase(account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX + account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX + account_id);
}

export async function store_unwrapped_passphrase(
  account_id: string,
  passphrase: string,
  remember_on_device: boolean = true,
): Promise<void> {
  const key = await get_or_create_session_key();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(passphrase);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  const encrypted_base64 = btoa(
    String.fromCharCode(...new Uint8Array(encrypted)),
  );
  const iv_base64 = btoa(String.fromCharCode(...iv));
  const sealed_base64 = await native_seal_base64(encrypted_base64);

  remove_stored_passphrase(account_id);

  const write = remember_on_device ? safe_local_set : safe_session_set;

  write(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
    sealed_base64 ?? encrypted_base64,
  );
  write(SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id, iv_base64);

  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX + account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX + account_id);
}

export function remove_unwrapped_passphrase(account_id: string): void {
  remove_stored_passphrase(account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX + account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX + account_id);
}

export function is_session_passphrase_pin_locked(account_id: string): boolean {
  if (!is_account_server_wrapped(account_id)) return false;
  if (get_pending_passphrase(account_id) !== null) return false;
  if (get_unlocked_key(account_id) !== null) return false;

  return has_wrapped_passphrase(account_id);
}

export function is_session_passphrase_on_device(account_id: string): boolean {
  if (is_account_server_wrapped(account_id)) {
    const pending = get_pending_passphrase(account_id);

    if (pending) return pending.remember_on_device;

    return read_wrapped_record(account_id)?.on_device ?? false;
  }

  const has_current =
    safe_local_get(SESSION_PASSPHRASE_KEY_PREFIX + account_id) !== null &&
    safe_local_get(SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id) !== null;
  const has_legacy =
    safe_local_get(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX + account_id) !==
      null &&
    safe_local_get(LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX + account_id) !==
      null;

  return has_current || has_legacy;
}

export function has_stored_session_passphrase(account_id: string): boolean {
  try {
    if (check_session_expired(account_id)) {
      return false;
    }

    if (is_account_server_wrapped(account_id)) {
      return (
        get_pending_passphrase(account_id) !== null ||
        has_wrapped_passphrase(account_id)
      );
    }

    const has_current = read_stored_passphrase(account_id) !== null;

    const has_legacy =
      safe_local_get(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX + account_id) !==
        null &&
      safe_local_get(
        LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX + account_id,
      ) !== null;

    return has_current || has_legacy;
  } catch {
    return true;
  }
}

export async function get_session_passphrase(
  account_id: string,
): Promise<string | null> {
  if (check_session_expired(account_id)) {
    await clear_session_passphrase(account_id);

    return null;
  }

  if (is_account_server_wrapped(account_id)) {
    return read_pin_wrapped_passphrase(account_id);
  }

  const stored = read_stored_passphrase(account_id);

  if (!stored) {
    return null;
  }

  const { iv_base64 } = stored;
  const was_sealed = is_native_sealed(stored.encrypted_base64);
  const encrypted_base64 = was_sealed
    ? await native_open_base64(stored.encrypted_base64)
    : stored.encrypted_base64;

  if (!encrypted_base64) {
    return null;
  }

  let current_key = get_session_encryption_key();

  if (!current_key) {
    try {
      const stored_key = await get_session_key_from_db();

      if (stored_key) {
        set_session_encryption_key(stored_key);
        current_key = stored_key;
      }
    } catch (err) {
      if (err instanceof RequiresReauthError) {
        remove_stored_passphrase(account_id);
        throw err;
      }

      return null;
    }
  }

  if (!current_key) {
    return null;
  }

  try {
    const encrypted = Uint8Array.from(atob(encrypted_base64), (c) =>
      c.charCodeAt(0),
    );
    const iv = Uint8Array.from(atob(iv_base64), (c) => c.charCodeAt(0));

    const decrypted = await decrypt_aes_gcm_with_fallback(
      current_key,
      encrypted,
      iv,
    );

    const passphrase = new TextDecoder().decode(decrypted);

    if (!was_sealed && can_native_seal()) {
      await reseal_on_device(account_id, passphrase);
    }

    return passphrase;
  } catch {
    return null;
  }
}

async function reseal_on_device(
  account_id: string,
  passphrase: string,
): Promise<void> {
  try {
    await store_session_passphrase(
      account_id,
      passphrase,
      is_session_passphrase_on_device(account_id),
    );
  } catch {
    return;
  }
}

async function read_pin_wrapped_passphrase(
  account_id: string,
): Promise<string | null> {
  const pending = get_pending_passphrase(account_id);

  if (pending) return pending.passphrase;
  const lock_key = get_unlocked_key(account_id);

  if (!lock_key) return null;
  const opened = await open_wrapped_passphrase(account_id, lock_key);

  if (opened !== null) remove_unwrapped_passphrase(account_id);

  return opened;
}

export async function clear_session_passphrase(
  account_id: string,
): Promise<void> {
  remove_wrapped_passphrase(account_id);
  clear_pending_passphrase(account_id);
  remove_stored_passphrase(account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX + account_id);
  safe_local_remove(LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX + account_id);
}

export async function clear_all_session_passphrases(): Promise<void> {
  const keys_to_remove = safe_local_keys().filter(
    (key) =>
      key.startsWith(SESSION_PASSPHRASE_KEY_PREFIX) ||
      key.startsWith(SESSION_PASSPHRASE_IV_KEY_PREFIX) ||
      key.startsWith(ENCRYPTED_VAULT_KEY_PREFIX) ||
      key.startsWith(VAULT_NONCE_KEY_PREFIX) ||
      key.startsWith(SESSION_TIMESTAMP_KEY_PREFIX) ||
      key.startsWith(LEGACY_SESSION_PASSPHRASE_FB_KEY_PREFIX) ||
      key.startsWith(LEGACY_SESSION_PASSPHRASE_FB_IV_KEY_PREFIX),
  );

  keys_to_remove.forEach((key) => safe_local_remove(key));
  safe_session_keys()
    .filter(
      (key) =>
        key.startsWith(SESSION_PASSPHRASE_KEY_PREFIX) ||
        key.startsWith(SESSION_PASSPHRASE_IV_KEY_PREFIX),
    )
    .forEach((key) => safe_session_remove(key));
  remove_all_wrapped_passphrases();
  forget_all_unlocked_locks();
  await clear_session_key();
}
