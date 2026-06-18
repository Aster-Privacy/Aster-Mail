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
  encrypted_get,
  encrypted_set,
  encrypted_delete,
} from "./encrypted_storage";
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";
import { api_client } from "@/services/api/client";
import { derive_ratchet_encryption_key } from "./ratchet_sync";

const PQ_PREKEY_STORAGE_PREFIX = "pq_prekey_secret_";
const PQ_PREKEY_INDEX_KEY = "pq_prekey_secret_index";

interface StoredPqSecret {
  key_id: number;
  secret_key_b64: string;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function secure_zero(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}

// Negative cache for one-time PQ prekey secrets that are gone (consumed on
// another device or never stored). Without it, every render/hover of an
// undecryptable message re-requests the same missing key_id and floods the
// network with 404s. Entries are account-scoped (record_key), persisted so a
// page refresh does not re-flood, expire after a TTL so a secret that later
// becomes available can be retried, and are cleared the moment the secret is
// saved locally.
const PQ_MISSING_STORAGE_KEY = "pq_prekey_missing";
const PQ_MISSING_TTL_MS = 24 * 60 * 60 * 1000;
let missing_cache: Record<string, number> | null = null;

function load_missing_cache(): Record<string, number> {
  if (missing_cache) return missing_cache;

  try {
    const raw = localStorage.getItem(PQ_MISSING_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();

    missing_cache = Object.fromEntries(
      Object.entries(parsed).filter(
        ([, ts]) => typeof ts === "number" && now - ts < PQ_MISSING_TTL_MS,
      ),
    );
  } catch {
    missing_cache = {};
  }

  return missing_cache;
}

function persist_missing_cache(): void {
  try {
    localStorage.setItem(
      PQ_MISSING_STORAGE_KEY,
      JSON.stringify(missing_cache ?? {}),
    );
  } catch {
    /* best-effort */
  }
}

function is_pq_secret_missing(rk: string): boolean {
  const cache = load_missing_cache();
  const ts = cache[rk];

  if (ts === undefined) return false;
  if (Date.now() - ts >= PQ_MISSING_TTL_MS) {
    delete cache[rk];
    persist_missing_cache();

    return false;
  }

  return true;
}

function mark_pq_secret_missing(rk: string): void {
  const cache = load_missing_cache();

  cache[rk] = Date.now();
  persist_missing_cache();
}

const pq_inflight = new Map<string, Promise<Uint8Array | null>>();

const PQ_TRANSIENT_ERROR_TTL_MS = 60_000;
const pq_transient_errors = new Map<string, number>();

const PQ_UPLOAD_RATE_LIMIT_COOLDOWN_MS = 60000;
let pq_upload_rate_limited_until = 0;

export function is_pq_upload_rate_limited(): boolean {
  return Date.now() < pq_upload_rate_limited_until;
}

function enter_pq_upload_cooldown(): void {
  pq_upload_rate_limited_until = Date.now() + PQ_UPLOAD_RATE_LIMIT_COOLDOWN_MS;
}

function clear_pq_secret_missing(rk: string): void {
  const cache = load_missing_cache();

  if (cache[rk] !== undefined) {
    delete cache[rk];
    persist_missing_cache();
  }
}

async function get_storage_key(): Promise<CryptoKey> {
  if (!has_vault_in_memory()) {
    throw new Error("Session expired. Please log in again.");
  }

  const master = get_derived_encryption_key();

  if (!master) {
    throw new Error("Key material unavailable. Please log in again.");
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    master,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  secure_zero(master);

  return crypto_key;
}

async function current_account_uid(): Promise<string | null> {
  try {
    const { get_current_account_id } = await import(
      "@/services/account_manager"
    );

    return await get_current_account_id();
  } catch {
    return null;
  }
}

function legacy_record_key(key_id: number): string {
  return `${PQ_PREKEY_STORAGE_PREFIX}${key_id}`;
}

function record_key(uid: string | null, key_id: number): string {
  if (!uid) return legacy_record_key(key_id);

  return `${PQ_PREKEY_STORAGE_PREFIX}${uid}_${key_id}`;
}

function index_key(uid: string | null): string {
  if (!uid) return PQ_PREKEY_INDEX_KEY;

  return `${PQ_PREKEY_INDEX_KEY}_${uid}`;
}

async function read_index(
  storage_key: CryptoKey,
  uid: string | null,
): Promise<number[]> {
  const namespaced =
    (await encrypted_get<number[]>(index_key(uid), storage_key)) || [];

  if (namespaced.length > 0 || !uid) return namespaced;

  return (
    (await encrypted_get<number[]>(PQ_PREKEY_INDEX_KEY, storage_key)) || []
  );
}

async function update_index(
  storage_key: CryptoKey,
  uid: string | null,
  mutate: (current: number[]) => number[],
): Promise<void> {
  const current = await read_index(storage_key, uid);
  const next = mutate(current);

  if (next.length === 0) {
    await encrypted_delete(index_key(uid));
  } else {
    await encrypted_set(index_key(uid), next, storage_key);
  }
}

async function get_sync_key(): Promise<CryptoKey | null> {
  if (!has_vault_in_memory()) return null;
  const master = get_derived_encryption_key();

  if (!master) return null;
  try {
    return await derive_ratchet_encryption_key(master);
  } finally {
    master.fill(0);
  }
}

async function encrypt_pq_for_server(
  secret: Uint8Array,
  sync_key: CryptoKey,
): Promise<{ encrypted_secret: string; secret_nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    sync_key,
    secret,
  );

  return {
    encrypted_secret: array_to_base64(new Uint8Array(ciphertext)),
    secret_nonce: array_to_base64(nonce),
  };
}

async function decrypt_pq_from_server(
  encrypted_secret: string,
  secret_nonce: string,
  sync_key: CryptoKey,
): Promise<Uint8Array> {
  const ciphertext = base64_to_array(encrypted_secret);
  const nonce = base64_to_array(secret_nonce);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    sync_key,
    ciphertext,
  );

  return new Uint8Array(plaintext);
}

async function upload_pq_secret_to_server(
  key_id: number,
  secret: Uint8Array,
): Promise<void> {
  try {
    const sync_key = await get_sync_key();

    if (!sync_key) return;

    const { encrypted_secret, secret_nonce } = await encrypt_pq_for_server(
      secret,
      sync_key,
    );

    const response = await api_client.post("/crypto/v1/ratchet/pq-secret", {
      key_id,
      encrypted_secret,
      secret_nonce,
    });

    if (response.code === "RATE_LIMIT_EXCEEDED") {
      enter_pq_upload_cooldown();
      throw new Error("pq_upload_rate_limited");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "pq_upload_rate_limited") {
      throw error;
    }
    /* best-effort */
  }
}

async function fetch_pq_secret_from_server(
  key_id: number,
): Promise<{ secret: Uint8Array | null; not_found: boolean }> {
  try {
    const sync_key = await get_sync_key();

    if (!sync_key) return { secret: null, not_found: false };

    const response = await api_client.get<{
      key_id: number;
      encrypted_secret: string;
      secret_nonce: string;
    }>(`/crypto/v1/ratchet/pq-secret/${key_id}`);

    if (response.error || !response.data) {
      return { secret: null, not_found: response.code === "NOT_FOUND" };
    }

    const secret = await decrypt_pq_from_server(
      response.data.encrypted_secret,
      response.data.secret_nonce,
      sync_key,
    );

    return { secret, not_found: false };
  } catch {
    return { secret: null, not_found: false };
  }
}

async function delete_pq_secret_on_server(key_id: number): Promise<void> {
  try {
    await api_client.delete(`/crypto/v1/ratchet/pq-secret/${key_id}`);
  } catch {
    /* best-effort */
  }
}

export async function save_pq_secret(
  key_id: number,
  secret: Uint8Array,
): Promise<void> {
  const storage_key = await get_storage_key();
  const uid = await current_account_uid();
  const record: StoredPqSecret = {
    key_id,
    secret_key_b64: array_to_base64(secret),
  };

  await encrypted_set(record_key(uid, key_id), record, storage_key);
  clear_pq_secret_missing(record_key(uid, key_id));

  await update_index(storage_key, uid, (current) => {
    if (current.includes(key_id)) {
      return current;
    }

    return [...current, key_id];
  });

  await upload_pq_secret_to_server(key_id, secret);
}

export async function save_pq_secrets_bulk(
  items: { key_id: number; secret: Uint8Array }[],
): Promise<void> {
  if (items.length === 0) return;

  const storage_key = await get_storage_key();
  const uid = await current_account_uid();

  for (const { key_id, secret } of items) {
    const record: StoredPqSecret = {
      key_id,
      secret_key_b64: array_to_base64(secret),
    };

    await encrypted_set(record_key(uid, key_id), record, storage_key);
    clear_pq_secret_missing(record_key(uid, key_id));

    await update_index(storage_key, uid, (current) => {
      if (current.includes(key_id)) {
        return current;
      }

      return [...current, key_id];
    });
  }

  try {
    const sync_key = await get_sync_key();

    if (!sync_key) return;

    const secrets: {
      key_id: number;
      encrypted_secret: string;
      secret_nonce: string;
    }[] = [];

    for (const { key_id, secret } of items) {
      const { encrypted_secret, secret_nonce } = await encrypt_pq_for_server(
        secret,
        sync_key,
      );

      secrets.push({ key_id, encrypted_secret, secret_nonce });
    }

    const response = await api_client.post(
      "/crypto/v1/ratchet/pq-secret/bulk",
      { secrets },
    );

    if (response.code === "RATE_LIMIT_EXCEEDED") {
      enter_pq_upload_cooldown();
      throw new Error("pq_upload_rate_limited");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "pq_upload_rate_limited") {
      throw error;
    }
    /* best-effort */
  }
}

export async function load_pq_secret(
  key_id: number,
): Promise<Uint8Array | null> {
  const uid = await current_account_uid();
  const rk = record_key(uid, key_id);

  try {
    const storage_key = await get_storage_key();
    const record = await encrypted_get<StoredPqSecret>(rk, storage_key);

    if (record) {
      clear_pq_secret_missing(rk);

      return base64_to_array(record.secret_key_b64);
    }

    if (uid) {
      const legacy = await encrypted_get<StoredPqSecret>(
        legacy_record_key(key_id),
        storage_key,
      );

      if (legacy) {
        try {
          await encrypted_set(rk, legacy, storage_key);
          await update_index(storage_key, uid, (current) =>
            current.includes(key_id) ? current : [...current, key_id],
          );
        } catch {
          /* best-effort migration */
        }

        clear_pq_secret_missing(rk);

        return base64_to_array(legacy.secret_key_b64);
      }
    }
  } catch {
    /* fall through */
  }

  if (is_pq_secret_missing(rk)) {
    return null;
  }

  const transient_until = pq_transient_errors.get(rk);
  if (transient_until !== undefined && Date.now() < transient_until) {
    return null;
  }

  const existing = pq_inflight.get(rk);

  if (existing) return existing;

  const fetch_promise = (async (): Promise<Uint8Array | null> => {
    const { secret: remote, not_found } = await fetch_pq_secret_from_server(
      key_id,
    );

    if (remote) {
      clear_pq_secret_missing(rk);

      try {
        const storage_key = await get_storage_key();
        const record: StoredPqSecret = {
          key_id,
          secret_key_b64: array_to_base64(remote),
        };

        await encrypted_set(rk, record, storage_key);
        await update_index(storage_key, uid, (current) =>
          current.includes(key_id) ? current : [...current, key_id],
        );
      } catch {
        /* best-effort cache */
      }
    } else if (not_found) {
      mark_pq_secret_missing(rk);
    } else {
      pq_transient_errors.set(rk, Date.now() + PQ_TRANSIENT_ERROR_TTL_MS);
    }

    return remote;
  })();

  pq_inflight.set(rk, fetch_promise);

  try {
    return await fetch_promise;
  } finally {
    pq_inflight.delete(rk);
  }
}

export async function delete_pq_secret(key_id: number): Promise<void> {
  try {
    const storage_key = await get_storage_key();
    const uid = await current_account_uid();

    await encrypted_delete(record_key(uid, key_id));
    if (uid) {
      await encrypted_delete(legacy_record_key(key_id));
    }

    await update_index(storage_key, uid, (current) =>
      current.filter((id) => id !== key_id),
    );
  } catch {
    /* fall through */
  }

  await delete_pq_secret_on_server(key_id);
}

export async function backfill_pq_secrets_to_server(): Promise<void> {
  try {
    const storage_key = await get_storage_key();
    const uid = await current_account_uid();
    const ids = await read_index(storage_key, uid);

    for (const key_id of ids) {
      let record = await encrypted_get<StoredPqSecret>(
        record_key(uid, key_id),
        storage_key,
      );

      if (!record && uid) {
        record = await encrypted_get<StoredPqSecret>(
          legacy_record_key(key_id),
          storage_key,
        );
      }

      if (!record) continue;

      const secret = base64_to_array(record.secret_key_b64);

      await upload_pq_secret_to_server(key_id, secret);
      secret.fill(0);
    }
  } catch {
    /* best-effort */
  }
}

export async function list_pq_secret_ids(): Promise<number[]> {
  try {
    const storage_key = await get_storage_key();
    const uid = await current_account_uid();

    return await read_index(storage_key, uid);
  } catch {
    return [];
  }
}
