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
import { get_derived_encryption_key } from "./memory_key_store";
import { decrypt_with_legacy_derived_keys } from "./legacy_keks";
import {
  is_cached_plaintext_foreign,
  set_cached_ratchet_plaintext,
  type PlaintextBinding,
} from "./ratchet_plaintext_cache";
import { mark_unconfirmed_sender_plaintext } from "./ratchet_verification_status";

import { ignore_error } from "@/lib/ignore_error";
import { api_client } from "@/services/api/client";
import { HASH_ALG } from "@/services/crypto/constants";

const API_BASE = "/crypto/v1/ratchet";
const MAX_ESCROW_PLAINTEXT_BYTES = 100 * 1024;
const ESCROW_MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_ESCROW_MISSES = 5000;
const ESCROW_MISS_STORAGE_KEY = "astermail_escrow_misses";

const escrow_misses = new Map<string, number>();

let escrow_misses_loaded = false;
let escrow_miss_flush_handle: ReturnType<typeof setTimeout> | null = null;

function load_escrow_misses(): void {
  if (escrow_misses_loaded) return;

  escrow_misses_loaded = true;

  try {
    const raw = localStorage.getItem(ESCROW_MISS_STORAGE_KEY);

    if (!raw) return;

    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();

    for (const [key, missed_at] of Object.entries(parsed)) {
      if (typeof missed_at !== "number") continue;
      if (now - missed_at > ESCROW_MISS_TTL_MS) continue;

      escrow_misses.set(key, missed_at);
    }
  } catch {
    escrow_misses.clear();
  }
}

function flush_escrow_misses(): void {
  if (escrow_miss_flush_handle !== null) return;

  escrow_miss_flush_handle = setTimeout(() => {
    escrow_miss_flush_handle = null;

    try {
      localStorage.setItem(
        ESCROW_MISS_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(escrow_misses)),
      );
    } catch (caught) {
      ignore_error(
        "services/crypto/message_escrow:flush_escrow_misses",
        caught,
      );
    }
  }, 2000);
}

function record_escrow_miss(dedupe_key: string): void {
  load_escrow_misses();

  if (escrow_misses.size >= MAX_TRACKED_ESCROW_MISSES) {
    const now = Date.now();

    for (const [key, missed_at] of escrow_misses) {
      if (now - missed_at > ESCROW_MISS_TTL_MS) escrow_misses.delete(key);
    }

    while (escrow_misses.size >= MAX_TRACKED_ESCROW_MISSES) {
      const oldest = escrow_misses.keys().next();

      if (oldest.done) break;

      escrow_misses.delete(oldest.value);
    }
  }

  escrow_misses.set(dedupe_key, Date.now());
  flush_escrow_misses();
}

function has_recent_escrow_miss(dedupe_key: string): boolean {
  load_escrow_misses();

  const missed_at = escrow_misses.get(dedupe_key);

  if (missed_at === undefined) return false;

  if (Date.now() - missed_at > ESCROW_MISS_TTL_MS) {
    escrow_misses.delete(dedupe_key);
    flush_escrow_misses();

    return false;
  }

  return true;
}

export function clear_escrow_miss_cache(): void {
  escrow_misses.clear();
  escrow_misses_loaded = true;

  try {
    localStorage.removeItem(ESCROW_MISS_STORAGE_KEY);
  } catch (caught) {
    ignore_error(
      "services/crypto/message_escrow:clear_escrow_miss_cache",
      caught,
    );
  }
}

interface EscrowEntry {
  message_id: string;
  encrypted_plaintext: string;
  plaintext_nonce: string;
}

async function derive_escrow_key_from_base(
  key_material: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode("Aster_Mail_Plaintext_Escrow"),
      info: new TextEncoder().encode("plaintext_escrow_key"),
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function derive_escrow_key(master_key: Uint8Array): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    master_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return derive_escrow_key_from_base(key_material);
}

async function get_escrow_key(): Promise<CryptoKey | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) return null;

  const key = await derive_escrow_key(master_key);

  master_key.fill(0);

  return key;
}

const ESCROW_AAD_V2_PREFIX = "aster.escrow.v2\0";

export function escrow_aad_v2(dedupe_key: string): Uint8Array {
  return new TextEncoder().encode(ESCROW_AAD_V2_PREFIX + dedupe_key);
}

async function open_escrow(
  escrow_key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  additional_data?: Uint8Array,
): Promise<ArrayBuffer | null> {
  const params: AesGcmParams = additional_data
    ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
    : { name: "AES-GCM", iv: nonce };

  return crypto.subtle
    .decrypt(params, escrow_key, ciphertext)
    .catch(() => null);
}

async function decrypt_escrow_payload(
  escrow_key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  dedupe_key: string,
): Promise<ArrayBuffer> {
  const bound = await open_escrow(
    escrow_key,
    ciphertext,
    nonce,
    escrow_aad_v2(dedupe_key),
  );

  if (bound) return bound;

  const unbound = await open_escrow(escrow_key, ciphertext, nonce);

  if (unbound) return unbound;

  const recovered = await decrypt_with_legacy_derived_keys(
    derive_escrow_key_from_base,
    ciphertext,
    nonce,
  );

  if (!recovered) throw new Error("escrow entry did not decrypt");

  return recovered;
}

const ESCROW_AAD_V3_PREFIX = "aster.escrow.v3\0";
const BOUND_ESCROW_KEY_PREFIX = "v3:";

export function escrow_aad_v3(dedupe_key: string): Uint8Array {
  return new TextEncoder().encode(ESCROW_AAD_V3_PREFIX + dedupe_key);
}

export function bound_escrow_key(dedupe_key: string): string {
  return BOUND_ESCROW_KEY_PREFIX + dedupe_key;
}

interface BoundEscrowPayload {
  sender: string;
  conversation_id: string;
  plaintext: string;
  unconfirmed_sender: boolean;
}

export interface EscrowedPlaintext {
  plaintext: string;
  verified: boolean;
  unconfirmed_sender: boolean;
}

function normalize_sender(sender: string): string {
  return sender.trim().toLowerCase();
}

function encode_bound_payload(
  binding: PlaintextBinding,
  plaintext: string,
  unconfirmed_sender: boolean,
): Uint8Array {
  const header = JSON.stringify({
    s: normalize_sender(binding.sender),
    c: binding.conversation_id,
    ...(unconfirmed_sender ? { u: 1 } : {}),
  });

  return new TextEncoder().encode(`${header}\n${plaintext}`);
}

function decode_bound_payload(bytes: ArrayBuffer): BoundEscrowPayload | null {
  const text = new TextDecoder().decode(bytes);
  const split = text.indexOf("\n");

  if (split < 0) return null;

  try {
    const header = JSON.parse(text.slice(0, split)) as {
      s?: unknown;
      c?: unknown;
      u?: unknown;
    };

    if (typeof header.s !== "string" || typeof header.c !== "string") {
      return null;
    }

    return {
      sender: header.s,
      conversation_id: header.c,
      plaintext: text.slice(split + 1),
      unconfirmed_sender: header.u === 1,
    };
  } catch {
    return null;
  }
}

function payload_matches_binding(
  payload: BoundEscrowPayload,
  binding: PlaintextBinding,
): boolean {
  return (
    payload.sender === normalize_sender(binding.sender) &&
    payload.conversation_id === binding.conversation_id
  );
}

async function post_escrow_entry(
  escrow_key: CryptoKey,
  row_key: string,
  payload: Uint8Array,
  additional_data: Uint8Array,
): Promise<void> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: additional_data },
    escrow_key,
    payload,
  );

  await api_client.post(`${API_BASE}/plaintext`, {
    message_id: row_key,
    encrypted_plaintext: array_to_base64(new Uint8Array(ciphertext)),
    plaintext_nonce: array_to_base64(nonce),
  });

  escrow_misses.delete(row_key);
  flush_escrow_misses();
}

export async function upload_to_escrow(
  dedupe_key: string,
  plaintext: string,
  binding: PlaintextBinding,
  unconfirmed_sender = false,
): Promise<void> {
  if (!dedupe_key || !plaintext) return;

  const plaintext_bytes = new TextEncoder().encode(plaintext);

  if (plaintext_bytes.length > MAX_ESCROW_PLAINTEXT_BYTES) return;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return;

  await post_escrow_entry(
    escrow_key,
    bound_escrow_key(dedupe_key),
    encode_bound_payload(binding, plaintext, unconfirmed_sender),
    escrow_aad_v3(dedupe_key),
  );

  await post_escrow_entry(
    escrow_key,
    dedupe_key,
    plaintext_bytes,
    escrow_aad_v2(dedupe_key),
  );
}

async function get_escrow_row(row_key: string): Promise<EscrowEntry | null> {
  if (has_recent_escrow_miss(row_key)) return null;

  const response = await api_client.get<EscrowEntry>(
    `${API_BASE}/plaintext/${encodeURIComponent(row_key)}`,
  );

  if (response.code === "NOT_FOUND") {
    record_escrow_miss(row_key);

    return null;
  }

  if (response.error || !response.data) return null;

  escrow_misses.delete(row_key);
  flush_escrow_misses();

  return response.data;
}

async function open_bound_row(
  escrow_key: CryptoKey,
  row: EscrowEntry,
  dedupe_key: string,
): Promise<BoundEscrowPayload | null> {
  try {
    const opened = await open_escrow(
      escrow_key,
      base64_to_array(row.encrypted_plaintext),
      base64_to_array(row.plaintext_nonce),
      escrow_aad_v3(dedupe_key),
    );

    return opened ? decode_bound_payload(opened) : null;
  } catch {
    return null;
  }
}

async function lookup_bound_escrow(
  escrow_key: CryptoKey,
  dedupe_key: string,
): Promise<BoundEscrowPayload | null> {
  const row = await get_escrow_row(bound_escrow_key(dedupe_key));

  if (!row) return null;

  return open_bound_row(escrow_key, row, dedupe_key);
}

async function claimed_by_other_sender(
  dedupe_key: string,
  binding: PlaintextBinding,
): Promise<boolean> {
  return is_cached_plaintext_foreign(dedupe_key, binding).catch(() => true);
}

async function adopt_bound_payload(
  dedupe_key: string,
  bound: BoundEscrowPayload,
  binding: PlaintextBinding,
): Promise<void> {
  if (bound.unconfirmed_sender) {
    mark_unconfirmed_sender_plaintext(bound.plaintext, dedupe_key);
  }

  await set_cached_ratchet_plaintext(
    dedupe_key,
    bound.plaintext,
    false,
    binding,
    bound.unconfirmed_sender,
  );
}

export async function fetch_verified_from_escrow(
  dedupe_key: string,
  binding: PlaintextBinding,
): Promise<string | null> {
  if (!dedupe_key) return null;

  if (await claimed_by_other_sender(dedupe_key, binding)) return null;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return null;

  const bound = await lookup_bound_escrow(escrow_key, dedupe_key);

  if (!bound || !payload_matches_binding(bound, binding)) return null;

  await adopt_bound_payload(dedupe_key, bound, binding);

  return bound.plaintext;
}

export async function fetch_from_escrow(
  dedupe_key: string,
  binding: PlaintextBinding,
): Promise<EscrowedPlaintext | null> {
  if (!dedupe_key) return null;

  if (await claimed_by_other_sender(dedupe_key, binding)) return null;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return null;

  const bound = await lookup_bound_escrow(escrow_key, dedupe_key);

  if (bound) {
    if (!payload_matches_binding(bound, binding)) return null;

    await adopt_bound_payload(dedupe_key, bound, binding);

    return {
      plaintext: bound.plaintext,
      verified: true,
      unconfirmed_sender: bound.unconfirmed_sender,
    };
  }

  const row = await get_escrow_row(dedupe_key);

  if (!row) return null;

  try {
    const plaintext_bytes = await decrypt_escrow_payload(
      escrow_key,
      base64_to_array(row.encrypted_plaintext),
      base64_to_array(row.plaintext_nonce),
      dedupe_key,
    );

    const plaintext = new TextDecoder().decode(plaintext_bytes);

    await set_cached_ratchet_plaintext(dedupe_key, plaintext, true, binding);

    return { plaintext, verified: false, unconfirmed_sender: false };
  } catch {
    return null;
  }
}

export async function sync_escrow_to_cache(): Promise<void> {
  const escrow_key = await get_escrow_key();

  if (!escrow_key) return;

  const response = await api_client.get<EscrowEntry[]>(
    `${API_BASE}/plaintexts`,
  );

  if (response.error || !response.data) return;

  for (const entry of response.data) {
    if (!entry.message_id.startsWith(BOUND_ESCROW_KEY_PREFIX)) continue;

    const dedupe_key = entry.message_id.slice(BOUND_ESCROW_KEY_PREFIX.length);

    if (!dedupe_key) continue;

    const payload = await open_bound_row(escrow_key, entry, dedupe_key);

    if (!payload) continue;

    await set_cached_ratchet_plaintext(
      dedupe_key,
      payload.plaintext,
      false,
      { sender: payload.sender, conversation_id: payload.conversation_id },
      payload.unconfirmed_sender,
    );
  }
}
