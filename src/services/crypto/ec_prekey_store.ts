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
import {
  load_prekey_seal_key,
  load_prekey_sealer,
  open_server_prekey_secret,
  prekey_seal_writes_ready,
  seal_prekey_secret,
} from "./prekey_seal";
import { load_storage_write_key_bytes } from "./storage_write_key";

import { api_client } from "@/services/api/client";

const EC_PREKEY_STORAGE_PREFIX = "ec_one_time_prekey_secret_";
const EC_PREKEY_SECRET_ROUTE = "/crypto/v1/keys/ec-prekeys/secret";
const EC_PREKEY_ROUTE = "/crypto/v1/keys/ec-prekeys";
const EC_PREKEY_IDS_ROUTE = "/crypto/v1/keys/ec-prekeys/ids";
const EC_PREKEY_ID_MAX_PAGES = 1000;
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

    return (await load_prekey_sealer()) !== null;
  } catch {
    return false;
  }
}

export async function encrypt_ec_one_time_secret(
  d: string,
  key_id: number,
): Promise<{ encrypted_secret: string; secret_nonce: string } | null> {
  if (!is_valid_key_id(key_id)) return null;

  const scalar = base64url_to_scalar(d);

  if (!scalar) return null;

  try {
    const sealer = await load_prekey_sealer();

    if (!sealer) return null;

    return await sealer.seal("ec", key_id, scalar);
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

interface ServerEcSecret {
  key_id: number;
  encrypted_secret: string;
  secret_nonce: string;
}

async function fetch_server_row(
  key_id: number,
): Promise<ServerEcSecret | null> {
  const response = await api_client.get<ServerEcSecret>(
    `${EC_PREKEY_SECRET_ROUTE}/${key_id}`,
  );

  if (response.error || !response.data) return null;

  if (response.data.key_id !== key_id) return null;

  return response.data;
}

async function open_server_row(
  key_id: number,
  row: ServerEcSecret,
): Promise<{ scalar: Uint8Array; legacy: boolean } | null> {
  const opened = await open_server_prekey_secret("ec", key_id, row);

  if (!opened) return null;

  if (opened.secret.length === EC_SCALAR_LEN) {
    return { scalar: opened.secret, legacy: opened.legacy };
  }

  opened.secret.fill(0);

  return null;
}

async function put_resealed_secret(
  seal_key: CryptoKey,
  key_id: number,
  scalar: Uint8Array,
): Promise<boolean> {
  const sealed = await seal_prekey_secret(seal_key, "ec", key_id, scalar);
  const response = await api_client.put(
    `${EC_PREKEY_SECRET_ROUTE}/${key_id}`,
    sealed,
  );

  return !response.error || response.code === "NOT_FOUND";
}

async function reseal_legacy_row(
  key_id: number,
  scalar: Uint8Array,
): Promise<void> {
  try {
    if (!(await prekey_seal_writes_ready())) return;

    const seal_key = await load_prekey_seal_key();

    if (seal_key) await put_resealed_secret(seal_key, key_id, scalar);
  } catch {
    return;
  }
}

async function fetch_server_secret(key_id: number): Promise<string | null> {
  if (!has_vault_in_memory()) return null;

  const row = await fetch_server_row(key_id);

  if (!row) return null;

  const opened = await open_server_row(key_id, row);

  if (!opened) return null;

  try {
    if (opened.legacy) await reseal_legacy_row(key_id, opened.scalar);

    return scalar_to_base64url(opened.scalar);
  } finally {
    opened.scalar.fill(0);
  }
}

function parse_key_ids(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every(is_valid_key_id)) return null;

  return [...new Set(value as number[])];
}

async function list_server_key_ids(): Promise<number[] | null> {
  const all = new Set<number>();
  let after: number | null = null;

  for (let page = 0; page < EC_PREKEY_ID_MAX_PAGES; page++) {
    const route: string =
      after === null
        ? EC_PREKEY_IDS_ROUTE
        : `${EC_PREKEY_IDS_ROUTE}?after=${after}`;
    const listing = await api_client.get<{
      key_ids?: unknown;
      next_after?: unknown;
    }>(route);

    if (listing.error || !listing.data) return null;

    const key_ids = parse_key_ids(listing.data.key_ids);

    if (!key_ids) return null;

    for (const key_id of key_ids) all.add(key_id);

    const next: unknown = listing.data.next_after;

    if (next === undefined || next === null) return [...all];

    if (!is_valid_key_id(next) || (after !== null && next <= after)) {
      return null;
    }

    after = next;
  }

  return null;
}

export async function reseal_server_ec_secrets(
  seal_key: CryptoKey | null,
  on_unopenable?: (key_id: number) => void,
): Promise<boolean> {
  try {
    const key_ids = await list_server_key_ids();

    if (!key_ids) return false;

    for (const key_id of key_ids) {
      const row = await fetch_server_row(key_id);

      if (!row) continue;

      const opened = await open_server_row(key_id, row);

      if (!opened) {
        on_unopenable?.(key_id);
        continue;
      }

      try {
        if (!opened.legacy || !seal_key) continue;

        if (!(await put_resealed_secret(seal_key, key_id, opened.scalar))) {
          return false;
        }
      } finally {
        opened.scalar.fill(0);
      }
    }

    return true;
  } catch {
    return false;
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

export async function drop_server_ec_secret(key_id: number): Promise<boolean> {
  if (!is_valid_key_id(key_id)) return false;

  try {
    const response = await api_client.delete<{ deleted?: unknown }>(
      `${EC_PREKEY_ROUTE}/${key_id}`,
    );

    if (response.error || response.data?.deleted !== true) return false;
  } catch {
    return false;
  }

  await delete_local_ec_one_time_secret(key_id);

  return true;
}

export function reset_ec_one_time_missing_cache(): void {
  missing_cache.clear();
}
