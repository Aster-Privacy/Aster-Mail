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
import { array_to_base64, base64_to_array } from "./base64";
import {
  encrypted_get,
  encrypted_set,
  encrypted_delete,
} from "./encrypted_storage";
import { has_vault_in_memory } from "./memory_key_store";
import { load_storage_write_key_bytes } from "./storage_write_key";
import { derive_ratchet_encryption_key } from "./ratchet_sync";

import { api_client } from "@/services/api/client";

const EC_PREKEY_STORAGE_PREFIX = "ec_one_time_prekey_secret_";
const EC_PREKEY_SECRET_ROUTE = "/crypto/v1/keys/ec-prekeys/secret";
const EC_PREKEY_ROUTE = "/crypto/v1/keys/ec-prekeys";
const EC_SCALAR_LEN = 32;
const EC_KEY_ID_MAX = 0x7fffffff;
const EC_MISSING_TTL_MS = 10 * 60 * 1000;
const EC_MISSING_MAX_ENTRIES = 500;

const missing_cache = new Map<string, number>();

interface StoredEcSecret {
  key_id: number;
  d: string;
}

function is_valid_key_id(key_id: unknown): key_id is number {
  return (
    typeof key_id === "number" &&
    Number.isInteger(key_id) &&
    key_id >= 1 &&
    key_id <= EC_KEY_ID_MAX
  );
}

function scalar_to_base64url(scalar: Uint8Array): string {
  return array_to_base64(scalar)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64url_to_scalar(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const scalar = base64_to_array(
      normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "=",
      ),
    );

    return scalar.length === EC_SCALAR_LEN ? scalar : null;
  } catch {
    return null;
  }
}

function private_jwk_from_scalar(d: string): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    d,
    ext: true,
    key_ops: ["deriveBits"],
  };
}

async function get_storage_key(): Promise<CryptoKey> {
  if (!has_vault_in_memory()) {
    throw new Error("Session expired. Please log in again.");
  }

  const master = await load_storage_write_key_bytes();

  if (!master) {
    throw new Error("Key material unavailable. Please log in again.");
  }

  try {
    return await crypto.subtle.importKey(
      "raw",
      master,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    master.fill(0);
  }
}

async function get_sync_key(): Promise<CryptoKey | null> {
  if (!has_vault_in_memory()) return null;

  const master = await load_storage_write_key_bytes();

  if (!master) return null;

  try {
    return await derive_ratchet_encryption_key(master);
  } finally {
    master.fill(0);
  }
}

async function current_account_uid(): Promise<string | null> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");

    return await get_current_account_id();
  } catch {
    return null;
  }
}

function record_key(uid: string | null, key_id: number): string {
  return `${EC_PREKEY_STORAGE_PREFIX}${uid ?? "unknown"}_${key_id}`;
}

function is_marked_missing(rk: string): boolean {
  const marked_at = missing_cache.get(rk);

  if (marked_at === undefined) return false;

  if (Date.now() - marked_at >= EC_MISSING_TTL_MS) {
    missing_cache.delete(rk);

    return false;
  }

  return true;
}

function mark_missing(rk: string): void {
  if (missing_cache.size >= EC_MISSING_MAX_ENTRIES) missing_cache.clear();

  missing_cache.set(rk, Date.now());
}

export async function ec_one_time_storage_available(): Promise<boolean> {
  try {
    if (typeof indexedDB === "undefined") return false;

    await get_storage_key();

    return (await get_sync_key()) !== null;
  } catch {
    return false;
  }
}

export async function encrypt_ec_one_time_secret(
  d: string,
): Promise<{ encrypted_secret: string; secret_nonce: string } | null> {
  const scalar = base64url_to_scalar(d);

  if (!scalar) return null;

  try {
    const sync_key = await get_sync_key();

    if (!sync_key) return null;

    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      sync_key,
      scalar,
    );

    return {
      encrypted_secret: array_to_base64(new Uint8Array(ciphertext)),
      secret_nonce: array_to_base64(nonce),
    };
  } catch {
    return null;
  } finally {
    scalar.fill(0);
  }
}

export async function save_ec_one_time_secret(
  key_id: number,
  d: string,
): Promise<void> {
  if (!is_valid_key_id(key_id) || !base64url_to_scalar(d)) {
    throw new Error("Invalid one-time prekey secret");
  }

  const storage_key = await get_storage_key();
  const uid = await current_account_uid();
  const stored: StoredEcSecret = { key_id, d };

  await encrypted_set(record_key(uid, key_id), stored, storage_key);
  missing_cache.delete(record_key(uid, key_id));
}

async function load_local_secret(
  key_id: number,
  uid: string | null,
): Promise<string | null> {
  const storage_key = await get_storage_key();
  const stored = await encrypted_get<StoredEcSecret>(
    record_key(uid, key_id),
    storage_key,
  );

  if (!stored || stored.key_id !== key_id || typeof stored.d !== "string") {
    return null;
  }

  return base64url_to_scalar(stored.d) ? stored.d : null;
}

export async function has_local_ec_one_time_secret(
  key_id: number,
): Promise<boolean> {
  if (!is_valid_key_id(key_id)) return false;

  const uid = await current_account_uid();

  return (await load_local_secret(key_id, uid)) !== null;
}

async function fetch_server_secret(key_id: number): Promise<string | null> {
  const sync_key = await get_sync_key();

  if (!sync_key) return null;

  const response = await api_client.get<{
    key_id: number;
    encrypted_secret: string;
    secret_nonce: string;
  }>(`${EC_PREKEY_SECRET_ROUTE}/${key_id}`);

  if (response.error || !response.data) return null;

  if (response.data.key_id !== key_id) return null;

  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(response.data.secret_nonce) },
      sync_key,
      base64_to_array(response.data.encrypted_secret),
    ),
  );

  try {
    if (plaintext.length !== EC_SCALAR_LEN) return null;

    return scalar_to_base64url(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

export async function load_ec_one_time_secret(
  key_id: number,
): Promise<JsonWebKey | null> {
  if (!is_valid_key_id(key_id)) return null;

  const uid = await current_account_uid();
  const rk = record_key(uid, key_id);

  try {
    const local = await load_local_secret(key_id, uid);

    if (local) return private_jwk_from_scalar(local);
  } catch {
    return null;
  }

  if (is_marked_missing(rk)) return null;

  try {
    const fetched = await fetch_server_secret(key_id);

    if (!fetched) {
      mark_missing(rk);

      return null;
    }

    try {
      await save_ec_one_time_secret(key_id, fetched);
    } catch {
      return private_jwk_from_scalar(fetched);
    }

    return private_jwk_from_scalar(fetched);
  } catch {
    mark_missing(rk);

    return null;
  }
}

export async function delete_local_ec_one_time_secret(
  key_id: number,
): Promise<void> {
  if (!is_valid_key_id(key_id)) return;

  try {
    const uid = await current_account_uid();

    await encrypted_delete(record_key(uid, key_id));
    mark_missing(record_key(uid, key_id));
  } catch {
    return;
  }
}

export async function delete_ec_one_time_secret(key_id: number): Promise<void> {
  if (!is_valid_key_id(key_id)) return;

  await delete_local_ec_one_time_secret(key_id);

  try {
    await api_client.delete(`${EC_PREKEY_ROUTE}/${key_id}`);
  } catch {
    return;
  }
}

export function reset_ec_one_time_missing_cache(): void {
  missing_cache.clear();
}
