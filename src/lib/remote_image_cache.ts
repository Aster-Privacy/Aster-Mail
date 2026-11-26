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
import type { ProxiedImageResult } from "@/lib/image_proxy_grant";

import { release_on_version_change } from "@/lib/idb_release";
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

export const IMAGE_CACHE_DB_NAME = "astermail_image_cache";
export const IMAGE_CACHE_ENABLED_KEY = "aster_image_cache_enabled";
export const IMAGE_PREFETCH_ENABLED_KEY = "aster_image_prefetch_enabled";

export const MAX_CACHED_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_CACHE_BYTES = 64 * 1024 * 1024;
export const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DB_VERSION = 1;
const ENTRY_STORE = "entries";
const BLOB_STORE = "blobs";
const SECRET_STORE = "secrets";
const ACCOUNT_INDEX = "account";
const USED_INDEX = "used_at";
const SECRET_BYTES = 64;
const IV_BYTES = 12;
const USE_TOUCH_INTERVAL_MS = 60_000;
const MAX_UNSEAL_FAILURES = 3;

const CACHEABLE_TYPES = new Set([
  "image/png",
  "image/apng",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/tiff",
  "image/heic",
  "image/svg+xml",
]);

export interface ImageCacheEnvironment {
  get_account_id(): Promise<string | null>;
  seal(plain: string): Promise<string>;
  unseal(sealed: string): Promise<string>;
  may_persist(account_id: string): Promise<boolean>;
  now(): number;
}

interface EntryRecord {
  name: string;
  account: string;
  size: number;
  stored_at: number;
  used_at: number;
}

interface BlobRecord {
  name: string;
  iv: Uint8Array;
  data: ArrayBuffer;
}

interface SecretRecord {
  account: string;
  sealed: string;
}

interface AccountKeys {
  name_key: CryptoKey;
  content_key: CryptoKey;
}

type CachedImage = Extract<ProxiedImageResult, { kind: "image" }>;

const listeners = new Set<() => void>();
const account_keys = new Map<string, Promise<AccountKeys | null>>();
const unseal_failures = new Map<string, number>();
let environment: ImageCacheEnvironment | null = null;
let db_promise: Promise<IDBDatabase> | null = null;
let maintenance: Promise<void> = Promise.resolve();
let generation = 0;

export function configure_image_cache(env: ImageCacheEnvironment): void {
  environment = env;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe_image_cache_settings(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function is_image_cache_enabled(): boolean {
  return safe_local_get(IMAGE_CACHE_ENABLED_KEY) !== "off";
}

export function is_image_prefetch_enabled(): boolean {
  return (
    is_image_cache_enabled() &&
    safe_local_get(IMAGE_PREFETCH_ENABLED_KEY) === "on"
  );
}

export async function set_image_cache_enabled(enabled: boolean): Promise<void> {
  if (enabled) {
    safe_local_remove(IMAGE_CACHE_ENABLED_KEY);
  } else {
    safe_local_set(IMAGE_CACHE_ENABLED_KEY, "off");
    safe_local_remove(IMAGE_PREFETCH_ENABLED_KEY);
  }
  notify();
  if (!enabled) await clear_remote_image_cache();
}

export function set_image_prefetch_enabled(enabled: boolean): void {
  if (enabled) {
    safe_local_set(IMAGE_PREFETCH_ENABLED_KEY, "on");
  } else {
    safe_local_remove(IMAGE_PREFETCH_ENABLED_KEY);
  }
  notify();
}

function has_indexed_db(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function has_subtle_crypto(): boolean {
  return typeof crypto !== "undefined" && crypto.subtle !== undefined;
}

function request_result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction_done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function open_db(): Promise<IDBDatabase> {
  if (db_promise) return db_promise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IMAGE_CACHE_DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        const entries = db.createObjectStore(ENTRY_STORE, { keyPath: "name" });

        entries.createIndex(ACCOUNT_INDEX, "account");
        entries.createIndex(USED_INDEX, "used_at");
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(SECRET_STORE)) {
        db.createObjectStore(SECRET_STORE, { keyPath: "account" });
      }
    };
    request.onsuccess = () =>
      resolve(
        release_on_version_change(request.result, () => {
          if (db_promise === opening) db_promise = null;
        }),
      );
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("image cache open blocked"));
  });

  db_promise = opening;
  opening.catch(() => {
    if (db_promise === opening) db_promise = null;
  });

  return opening;
}

function close_db(): Promise<void> {
  const pending = db_promise;

  db_promise = null;
  if (!pending) return Promise.resolve();

  return pending.then(
    (db) => db.close(),
    () => undefined,
  );
}

function random_bytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);

  return bytes;
}

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function from_base64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function import_keys(secret: Uint8Array): Promise<AccountKeys> {
  const name_key = await crypto.subtle.importKey(
    "raw",
    secret.slice(0, 32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const content_key = await crypto.subtle.importKey(
    "raw",
    secret.slice(32, 64),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  secret.fill(0);

  return { name_key, content_key };
}

async function delete_account_records(
  db: IDBDatabase,
  account: string,
  include_secret: boolean,
): Promise<void> {
  const tx = db.transaction(
    [ENTRY_STORE, BLOB_STORE, SECRET_STORE],
    "readwrite",
  );
  const entries = tx.objectStore(ENTRY_STORE);
  const blobs = tx.objectStore(BLOB_STORE);
  const names = await request_result(
    entries.index(ACCOUNT_INDEX).getAllKeys(IDBKeyRange.only(account)),
  );

  for (const name of names) {
    entries.delete(name);
    blobs.delete(name);
  }
  if (include_secret) tx.objectStore(SECRET_STORE).delete(account);

  await transaction_done(tx);
}

async function create_account_secret(
  env: ImageCacheEnvironment,
  account: string,
  started: number,
): Promise<AccountKeys | null> {
  if (!(await env.may_persist(account))) return null;

  const secret = random_bytes(SECRET_BYTES);
  const sealed = await env.seal(to_base64(secret));
  let stored = false;

  await schedule(async () => {
    if (started !== generation) return;

    const db = await open_db();

    await delete_account_records(db, account, true);
    if (started !== generation) return;

    const tx = db.transaction(SECRET_STORE, "readwrite");
    const record: SecretRecord = { account, sealed };

    tx.objectStore(SECRET_STORE).put(record);
    await transaction_done(tx);
    stored = true;
  });

  if (!stored || started !== generation) {
    secret.fill(0);

    return null;
  }

  return import_keys(secret);
}

function decode_secret(value: string): Uint8Array | null {
  try {
    const secret = from_base64(value);

    return secret.length === SECRET_BYTES ? secret : null;
  } catch {
    return null;
  }
}

async function load_account_keys(
  env: ImageCacheEnvironment,
  account: string,
  started: number,
): Promise<AccountKeys | null> {
  const db = await open_db();
  const tx = db.transaction(SECRET_STORE, "readonly");
  const record = (await request_result(
    tx.objectStore(SECRET_STORE).get(account),
  )) as SecretRecord | undefined;

  if (started !== generation) return null;
  if (!record) return create_account_secret(env, account, started);

  let unsealed: string;

  try {
    unsealed = await env.unseal(record.sealed);
  } catch {
    const failures = (unseal_failures.get(account) ?? 0) + 1;

    unseal_failures.set(account, failures);
    if (failures < MAX_UNSEAL_FAILURES) return null;
    unseal_failures.delete(account);

    return create_account_secret(env, account, started);
  }

  unseal_failures.delete(account);

  const secret = decode_secret(unsealed);

  if (!secret) return create_account_secret(env, account, started);
  if (started !== generation) {
    secret.fill(0);

    return null;
  }

  return import_keys(secret);
}

function keys_for(
  env: ImageCacheEnvironment,
  account: string,
): Promise<AccountKeys | null> {
  let pending = account_keys.get(account);

  if (!pending) {
    pending = load_account_keys(env, account, generation).catch(() => null);
    account_keys.set(account, pending);
    pending.then((keys) => {
      if (keys === null && account_keys.get(account) === pending) {
        account_keys.delete(account);
      }
    });
  }

  return pending;
}

async function entry_name(keys: AccountKeys, url: string): Promise<string> {
  const digest = await crypto.subtle.sign(
    "HMAC",
    keys.name_key,
    new TextEncoder().encode(url),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function additional_data(name: string, account: string): Uint8Array {
  return new TextEncoder().encode(`${account}\u0000${name}`);
}

function encode_payload(image: CachedImage): Uint8Array {
  const type = new TextEncoder().encode(image.content_type);
  const payload = new Uint8Array(1 + type.length + image.bytes.length);

  payload[0] = type.length;
  payload.set(type, 1);
  payload.set(image.bytes, 1 + type.length);

  return payload;
}

function decode_payload(payload: Uint8Array): CachedImage | null {
  const type_length = payload[0];

  if (type_length === undefined || payload.length < 1 + type_length) {
    return null;
  }

  const content_type = new TextDecoder().decode(
    payload.subarray(1, 1 + type_length),
  );

  if (!CACHEABLE_TYPES.has(content_type)) return null;

  return {
    kind: "image",
    content_type,
    bytes: payload.slice(1 + type_length),
  };
}

async function resolve_context(expected_account?: string): Promise<{
  env: ImageCacheEnvironment;
  account: string;
  keys: AccountKeys;
} | null> {
  const env = environment;

  if (!env || !is_image_cache_enabled()) return null;
  if (!has_indexed_db() || !has_subtle_crypto()) return null;

  const account = await env.get_account_id();

  if (!account) return null;
  if (expected_account !== undefined && expected_account !== account) {
    return null;
  }
  if (!(await env.may_persist(account))) {
    await clear_remote_image_cache(account);

    return null;
  }

  const keys = await keys_for(env, account);

  return keys ? { env, account, keys } : null;
}

async function delete_entry(name: string): Promise<void> {
  const db = await open_db();
  const tx = db.transaction([ENTRY_STORE, BLOB_STORE], "readwrite");

  tx.objectStore(ENTRY_STORE).delete(name);
  tx.objectStore(BLOB_STORE).delete(name);
  await transaction_done(tx);
}

async function touch_entry(entry: EntryRecord, now: number): Promise<void> {
  const db = await open_db();
  const tx = db.transaction(ENTRY_STORE, "readwrite");

  tx.objectStore(ENTRY_STORE).put({ ...entry, used_at: now });
  await transaction_done(tx);
}

export async function read_cached_image(
  url: string,
): Promise<CachedImage | null> {
  const started = generation;
  const context = await resolve_context();

  if (!context || started !== generation) return null;

  const { env, account, keys } = context;
  const name = await entry_name(keys, url);
  const db = await open_db();
  const tx = db.transaction([ENTRY_STORE, BLOB_STORE], "readonly");
  const [entry, blob] = (await Promise.all([
    request_result(tx.objectStore(ENTRY_STORE).get(name)),
    request_result(tx.objectStore(BLOB_STORE).get(name)),
  ])) as [EntryRecord | undefined, BlobRecord | undefined];

  if (!entry || !blob) return null;

  const now = env.now();

  if (entry.account !== account || now - entry.stored_at > IMAGE_CACHE_TTL_MS) {
    await delete_entry(name).catch(() => undefined);

    return null;
  }

  let image: CachedImage | null = null;

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: blob.iv as BufferSource,
        additionalData: additional_data(name, account) as BufferSource,
      },
      keys.content_key,
      blob.data,
    );

    image = decode_payload(new Uint8Array(plain));
  } catch {
    image = null;
  }

  if (!image) {
    await delete_entry(name).catch(() => undefined);

    return null;
  }
  if (started !== generation) return null;
  if (now - entry.used_at > USE_TOUCH_INTERVAL_MS) {
    void touch_entry(entry, now).catch(() => undefined);
  }

  return image;
}

async function evict(now: number): Promise<void> {
  const db = await open_db();
  const tx = db.transaction([ENTRY_STORE, BLOB_STORE], "readwrite");
  const entries = tx.objectStore(ENTRY_STORE);
  const blobs = tx.objectStore(BLOB_STORE);
  const all = (await request_result(
    entries.index(USED_INDEX).getAll(),
  )) as EntryRecord[];
  let total = 0;

  for (const entry of all) {
    if (now - entry.stored_at > IMAGE_CACHE_TTL_MS) {
      entries.delete(entry.name);
      blobs.delete(entry.name);
    } else {
      total += entry.size;
    }
  }

  for (const entry of all) {
    if (total <= MAX_IMAGE_CACHE_BYTES) break;
    if (now - entry.stored_at > IMAGE_CACHE_TTL_MS) continue;
    entries.delete(entry.name);
    blobs.delete(entry.name);
    total -= entry.size;
  }

  await transaction_done(tx);
}

function schedule(task: () => Promise<void>): Promise<void> {
  const next = maintenance.then(task, task);

  maintenance = next.catch(() => undefined);

  return next;
}

async function current_cache_account(): Promise<string | null> {
  const env = environment;

  if (!env) return null;

  return env.get_account_id().catch(() => null);
}

export async function store_cached_image(
  url: string,
  image: ProxiedImageResult,
  expected_account?: string,
  expected_generation: number = generation,
): Promise<boolean> {
  const started = expected_generation;

  if (image.kind !== "image") return false;
  if (!CACHEABLE_TYPES.has(image.content_type)) return false;
  if (image.bytes.length === 0) return false;
  if (image.bytes.length > MAX_CACHED_IMAGE_BYTES) return false;
  if (started !== generation) return false;

  const context = await resolve_context(expected_account);

  if (!context || started !== generation) return false;

  const { env, account, keys } = context;
  const name = await entry_name(keys, url);
  const iv = random_bytes(IV_BYTES);
  const data = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: additional_data(name, account) as BufferSource,
    },
    keys.content_key,
    encode_payload(image) as BufferSource,
  );

  if (started !== generation || !is_image_cache_enabled()) return false;

  const now = env.now();
  const entry: EntryRecord = {
    name,
    account,
    size: data.byteLength,
    stored_at: now,
    used_at: now,
  };
  const blob: BlobRecord = { name, iv, data };

  await schedule(async () => {
    if (started !== generation) return;

    const db = await open_db();
    const tx = db.transaction([ENTRY_STORE, BLOB_STORE], "readwrite");

    tx.objectStore(ENTRY_STORE).put(entry);
    tx.objectStore(BLOB_STORE).put(blob);
    await transaction_done(tx);
    await evict(now);
  });

  return started === generation;
}

export async function clear_remote_image_cache(
  account_id?: string | null,
): Promise<void> {
  generation += 1;

  if (account_id) {
    account_keys.delete(account_id);
    unseal_failures.delete(account_id);
  } else {
    account_keys.clear();
    unseal_failures.clear();
  }
  if (!has_indexed_db()) return;

  await schedule(async () => {
    if (account_id) {
      const db = await open_db();

      await delete_account_records(db, account_id, true);

      return;
    }

    await close_db();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(IMAGE_CACHE_DB_NAME);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }).catch(() => undefined);
}

export async function image_cache_usage(): Promise<{
  entries: number;
  bytes: number;
}> {
  if (!has_indexed_db()) return { entries: 0, bytes: 0 };

  const db = await open_db();
  const tx = db.transaction(ENTRY_STORE, "readonly");
  const all = (await request_result(
    tx.objectStore(ENTRY_STORE).getAll(),
  )) as EntryRecord[];

  return {
    entries: all.length,
    bytes: all.reduce((sum, entry) => sum + entry.size, 0),
  };
}

export type CachedImageLoader = (
  url: string,
  options: { signal?: AbortSignal },
) => Promise<ProxiedImageResult>;

export function create_cached_image_loader(
  fetch_image: CachedImageLoader,
): CachedImageLoader {
  return async (url, options) => {
    const started = generation;
    const account = await current_cache_account();
    const hit = await read_cached_image(url).catch(() => null);

    if (hit) return hit;
    if (options.signal?.aborted) return { kind: "failed", retryable: false };

    const result = await fetch_image(url, options);

    if (result.kind === "image" && account) {
      await store_cached_image(url, result, account, started).catch(
        () => false,
      );
    }

    return result;
  };
}

export async function reset_image_cache_for_tests(): Promise<void> {
  generation += 1;
  account_keys.clear();
  unseal_failures.clear();
  environment = null;
  maintenance = Promise.resolve();
  await close_db();
}
