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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  get_or_create_session_key,
  clear_session_key,
  get_session_key_from_db,
  get_session_encryption_key,
  set_session_encryption_key,
} from "./session_key_db";

import {
  check_session_expired,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";

const ENCRYPTED_VAULT_KEY_PREFIX = "astermail_encrypted_vault_";
const VAULT_NONCE_KEY_PREFIX = "astermail_vault_nonce_";
const SESSION_PASSPHRASE_KEY_PREFIX = "astermail_session_passphrase_";
const SESSION_PASSPHRASE_IV_KEY_PREFIX = "astermail_session_passphrase_iv_";
const SESSION_TIMESTAMP_KEY_PREFIX = "astermail_session_timestamp_";

export function store_encrypted_vault(
  account_id: string,
  encrypted_vault: string,
  vault_nonce: string,
): void {
  localStorage.setItem(
    ENCRYPTED_VAULT_KEY_PREFIX + account_id,
    encrypted_vault,
  );
  localStorage.setItem(VAULT_NONCE_KEY_PREFIX + account_id, vault_nonce);
  localStorage.setItem(
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

  const encrypted_vault = localStorage.getItem(
    ENCRYPTED_VAULT_KEY_PREFIX + account_id,
  );
  const vault_nonce = localStorage.getItem(VAULT_NONCE_KEY_PREFIX + account_id);

  return encrypted_vault && vault_nonce
    ? { encrypted_vault, vault_nonce }
    : null;
}

export function clear_stored_encrypted_vault(account_id: string): void {
  localStorage.removeItem(ENCRYPTED_VAULT_KEY_PREFIX + account_id);
  localStorage.removeItem(VAULT_NONCE_KEY_PREFIX + account_id);
  localStorage.removeItem(SESSION_TIMESTAMP_KEY_PREFIX + account_id);
}

export async function store_session_passphrase(
  account_id: string,
  passphrase: string,
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

  localStorage.setItem(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
    encrypted_base64,
  );
  localStorage.setItem(
    SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id,
    iv_base64,
  );
}

export async function get_session_passphrase(
  account_id: string,
): Promise<string | null> {
  const encrypted_base64 = localStorage.getItem(
    SESSION_PASSPHRASE_KEY_PREFIX + account_id,
  );
  const iv_base64 = localStorage.getItem(
    SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id,
  );

  if (!encrypted_base64 || !iv_base64) {
    return null;
  }

  let current_key = get_session_encryption_key();

  if (!current_key) {
    const stored_key = await get_session_key_from_db();

    if (stored_key) {
      set_session_encryption_key(stored_key);
      current_key = stored_key;
    } else {
      return null;
    }
  }

  try {
    const encrypted = Uint8Array.from(atob(encrypted_base64), (c) =>
      c.charCodeAt(0),
    );
    const iv = Uint8Array.from(atob(iv_base64), (c) => c.charCodeAt(0));

    const decrypted = await decrypt_aes_gcm_with_fallback(current_key, encrypted, iv);

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function clear_session_passphrase(
  account_id: string,
): Promise<void> {
  localStorage.removeItem(SESSION_PASSPHRASE_KEY_PREFIX + account_id);
  localStorage.removeItem(SESSION_PASSPHRASE_IV_KEY_PREFIX + account_id);
}

export async function clear_all_session_passphrases(): Promise<void> {
  const keys_to_remove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (
      key &&
      (key.startsWith(SESSION_PASSPHRASE_KEY_PREFIX) ||
        key.startsWith(SESSION_PASSPHRASE_IV_KEY_PREFIX) ||
        key.startsWith(ENCRYPTED_VAULT_KEY_PREFIX) ||
        key.startsWith(VAULT_NONCE_KEY_PREFIX) ||
        key.startsWith(SESSION_TIMESTAMP_KEY_PREFIX))
    ) {
      keys_to_remove.push(key);
    }
  }

  keys_to_remove.forEach((key) => localStorage.removeItem(key));
  await clear_session_key();
}
