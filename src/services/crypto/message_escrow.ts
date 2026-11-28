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
  load_storage_write_key_bytes,
  load_verifying_storage_key_bytes,
} from "./storage_write_key";
import { decrypt_with_legacy_derived_keys } from "./legacy_keks";
import { stored_unbound_policy } from "./aes_gcm_aad_fallback";
import {
  is_cached_plaintext_foreign,
  set_cached_ratchet_plaintext,
  type PlaintextBinding,
} from "./ratchet_plaintext_cache";
import {
  mark_downgraded_plaintext,
  mark_unconfirmed_sender_plaintext,
} from "./ratchet_verification_status";

import { ignore_error } from "@/lib/ignore_error";
import { api_client } from "@/services/api/client";
import { HASH_ALG } from "@/services/crypto/constants";
import { note_transient_failure } from "@/services/crypto/decrypt_readiness";

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

export async function derive_escrow_key_from_base(
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

async function escrow_key_from(
  master_key: Uint8Array | null,
): Promise<CryptoKey | null> {
  if (!master_key) return null;

  try {
    return await derive_escrow_key(master_key);
  } finally {
    master_key.fill(0);
  }
}

export async function get_escrow_key(): Promise<CryptoKey | null> {
  return escrow_key_from(await load_storage_write_key_bytes());
}

async function get_verifying_escrow_key(): Promise<CryptoKey | null> {
  return escrow_key_from(await load_verifying_storage_key_bytes());
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

  const accepts_unbound = stored_unbound_policy() === "accept_unbound";
  const unbound = accepts_unbound
    ? await open_escrow(escrow_key, ciphertext, nonce)
    : null;

  if (unbound) return unbound;

  const legacy_bound = await decrypt_with_legacy_derived_keys(
    derive_escrow_key_from_base,
    ciphertext,
    nonce,
    escrow_aad_v2(dedupe_key),
  );

  if (legacy_bound) return legacy_bound;

  if (!accepts_unbound) throw new Error("escrow entry did not decrypt");

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
  downgraded: boolean;
  account_unbound: boolean;
  sent_at?: number;
}

export interface EscrowedPlaintext {
  plaintext: string;
  verified: boolean;
  unconfirmed_sender: boolean;
  downgraded: boolean;
  account_unbound: boolean;
  sent_at?: number;
}

export interface EscrowOpening {
  account_unbound?: boolean;
  account_bound?: boolean;
  sent_at?: number;
}

function escrow_sent_at(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function normalize_sender(sender: string): string {
  return sender.trim().toLowerCase();
}

function encode_bound_payload(
  binding: PlaintextBinding,
  plaintext: string,
  unconfirmed_sender: boolean,
  downgraded: boolean,
  opening: EscrowOpening,
): Uint8Array {
  const sent_at = escrow_sent_at(opening.sent_at);
  const header = JSON.stringify({
    s: normalize_sender(binding.sender),
    c: binding.conversation_id,
    ...(unconfirmed_sender || downgraded ? { u: 1 } : {}),
    ...(downgraded ? { m: 1 } : {}),
    ...(opening.account_unbound === true ? { a: 1 } : {}),
    ...(opening.account_bound === true ? { b: 1 } : {}),
    ...(sent_at !== undefined ? { t: sent_at } : {}),
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
      m?: unknown;
      a?: unknown;
      b?: unknown;
      t?: unknown;
    };

    if (typeof header.s !== "string" || typeof header.c !== "string") {
      return null;
    }

    return {
      sender: header.s,
      conversation_id: header.c,
      plaintext: text.slice(split + 1),
      unconfirmed_sender: header.u === 1 || header.m === 1,
      downgraded: header.m === 1,
      account_unbound: header.a === 1 || header.b !== 1,
      sent_at: escrow_sent_at(header.t),
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
  downgraded = false,
  opening: EscrowOpening = {},
): Promise<void> {
  if (!dedupe_key || !plaintext) return;

  if (new TextEncoder().encode(plaintext).length > MAX_ESCROW_PLAINTEXT_BYTES) {
    return;
  }

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return;

  const verifying_key = await get_verifying_escrow_key();

  if (verifying_key) {
    await post_escrow_entry(
      verifying_key,
      bound_escrow_key(dedupe_key),
      encode_bound_payload(
        binding,
        plaintext,
        unconfirmed_sender,
        downgraded,
        opening,
      ),
      escrow_aad_v3(dedupe_key),
    );
  }

  if (await unbound_escrow_writes_retired()) return;

  await post_escrow_entry(
    escrow_key,
    dedupe_key,
    new TextEncoder().encode(plaintext),
    escrow_aad_v2(dedupe_key),
  );
}

async function unbound_escrow_writes_retired(): Promise<boolean> {
  try {
    const { get_account_key_capabilities } =
      await import("@/services/api/account_key");

    return (await get_account_key_capabilities()).bound_escrow_writes === true;
  } catch {
    return false;
  }
}

type EscrowRowLookup =
  | { state: "absent" }
  | { state: "unavailable" }
  | { state: "found"; row: EscrowEntry };

async function lookup_escrow_row(row_key: string): Promise<EscrowRowLookup> {
  if (has_recent_escrow_miss(row_key)) return { state: "absent" };

  const response = await api_client.get<EscrowEntry>(
    `${API_BASE}/plaintext/${encodeURIComponent(row_key)}`,
  );

  if (response.code === "NOT_FOUND") {
    record_escrow_miss(row_key);

    return { state: "absent" };
  }

  if (response.error || !response.data) return { state: "unavailable" };

  escrow_misses.delete(row_key);
  flush_escrow_misses();

  return { state: "found", row: response.data };
}

async function get_escrow_row(row_key: string): Promise<EscrowEntry | null> {
  const lookup = await lookup_escrow_row(row_key);

  return lookup.state === "found" ? lookup.row : null;
}

async function open_bound_row(
  escrow_key: CryptoKey,
  row: EscrowEntry,
  dedupe_key: string,
): Promise<BoundEscrowPayload | null> {
  try {
    const ciphertext = base64_to_array(row.encrypted_plaintext);
    const nonce = base64_to_array(row.plaintext_nonce);
    const additional_data = escrow_aad_v3(dedupe_key);
    const opened = await open_escrow(
      escrow_key,
      ciphertext,
      nonce,
      additional_data,
    );

    return opened ? decode_bound_payload(opened) : null;
  } catch {
    return null;
  }
}

export class EscrowUnavailableError extends Error {
  constructor() {
    super("escrow lookup unavailable");
    this.name = "EscrowUnavailableError";
    note_transient_failure();
  }
}

type BoundEscrowLookup =
  | { state: "absent" }
  | { state: "unavailable" }
  | { state: "refused" }
  | { state: "opened"; payload: BoundEscrowPayload };

async function lookup_bound_escrow(
  escrow_key: CryptoKey,
  dedupe_key: string,
): Promise<BoundEscrowLookup> {
  const row_key = bound_escrow_key(dedupe_key);
  const first = await lookup_escrow_row(row_key);
  const lookup =
    first.state === "unavailable" ? await lookup_escrow_row(row_key) : first;

  if (lookup.state === "absent") return { state: "absent" };
  if (lookup.state === "unavailable") return { state: "unavailable" };

  const payload = await open_bound_row(escrow_key, lookup.row, dedupe_key);

  return payload ? { state: "opened", payload } : { state: "refused" };
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

  if (bound.downgraded) {
    mark_downgraded_plaintext(bound.plaintext, dedupe_key);
  }

  await set_cached_ratchet_plaintext(
    dedupe_key,
    bound.plaintext,
    false,
    binding,
    bound.unconfirmed_sender,
    undefined,
    {
      downgraded: bound.downgraded,
      account_unbound: bound.account_unbound,
      sent_at: bound.sent_at,
    },
  );
}

export async function fetch_verified_from_escrow(
  dedupe_key: string,
  binding: PlaintextBinding,
): Promise<string | null> {
  if (!dedupe_key) return null;

  if (await claimed_by_other_sender(dedupe_key, binding)) return null;

  const verifying_key = await get_verifying_escrow_key();

  if (!verifying_key) return null;

  const lookup = await lookup_bound_escrow(verifying_key, dedupe_key);

  if (lookup.state === "unavailable") throw new EscrowUnavailableError();
  if (lookup.state !== "opened") return null;

  const bound = lookup.payload;

  if (!payload_matches_binding(bound, binding)) return null;

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

  const verifying_key = await get_verifying_escrow_key();
  const lookup: BoundEscrowLookup = verifying_key
    ? await lookup_bound_escrow(verifying_key, dedupe_key)
    : { state: "absent" };

  if (lookup.state === "unavailable") throw new EscrowUnavailableError();
  if (lookup.state === "refused") return null;

  if (lookup.state === "opened") {
    const bound = lookup.payload;

    if (!payload_matches_binding(bound, binding)) return null;

    await adopt_bound_payload(dedupe_key, bound, binding);

    return {
      plaintext: bound.plaintext,
      verified: true,
      unconfirmed_sender: bound.unconfirmed_sender,
      downgraded: bound.downgraded,
      account_unbound: bound.account_unbound,
      sent_at: bound.sent_at,
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

    return {
      plaintext,
      verified: false,
      unconfirmed_sender: false,
      downgraded: false,
      account_unbound: true,
    };
  } catch {
    return null;
  }
}

export async function sync_escrow_to_cache(): Promise<void> {
  const escrow_key = await get_verifying_escrow_key();

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
      undefined,
      {
        downgraded: payload.downgraded,
        account_unbound: payload.account_unbound,
        sent_at: payload.sent_at,
      },
    );
  }
}
