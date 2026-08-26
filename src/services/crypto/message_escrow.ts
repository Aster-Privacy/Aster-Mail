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
import { set_cached_ratchet_plaintext } from "./ratchet_plaintext_cache";

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

async function decrypt_escrow_payload(
  escrow_key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      escrow_key,
      ciphertext,
    );
  } catch (primary_error) {
    const recovered = await decrypt_with_legacy_derived_keys(
      derive_escrow_key_from_base,
      ciphertext,
      nonce,
    );

    if (!recovered) {
      throw primary_error;
    }

    return recovered;
  }
}

export async function upload_to_escrow(
  dedupe_key: string,
  plaintext: string,
): Promise<void> {
  if (!dedupe_key || !plaintext) return;

  const plaintext_bytes = new TextEncoder().encode(plaintext);

  if (plaintext_bytes.length > MAX_ESCROW_PLAINTEXT_BYTES) return;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return;

  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    escrow_key,
    plaintext_bytes,
  );

  await api_client.post(`${API_BASE}/plaintext`, {
    message_id: dedupe_key,
    encrypted_plaintext: array_to_base64(new Uint8Array(ciphertext)),
    plaintext_nonce: array_to_base64(nonce),
  });

  escrow_misses.delete(dedupe_key);
  flush_escrow_misses();
}

export async function fetch_from_escrow(
  dedupe_key: string,
): Promise<string | null> {
  if (!dedupe_key) return null;

  if (has_recent_escrow_miss(dedupe_key)) return null;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return null;

  const response = await api_client.get<EscrowEntry>(
    `${API_BASE}/plaintext/${encodeURIComponent(dedupe_key)}`,
  );

  if (response.code === "NOT_FOUND") {
    record_escrow_miss(dedupe_key);

    return null;
  }

  if (response.error || !response.data) return null;

  escrow_misses.delete(dedupe_key);
  flush_escrow_misses();

  try {
    const ciphertext = base64_to_array(response.data.encrypted_plaintext);
    const nonce = base64_to_array(response.data.plaintext_nonce);

    const plaintext_bytes = await decrypt_escrow_payload(
      escrow_key,
      ciphertext,
      nonce,
    );

    const plaintext = new TextDecoder().decode(plaintext_bytes);

    await set_cached_ratchet_plaintext(dedupe_key, plaintext);

    return plaintext;
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
    try {
      const ciphertext = base64_to_array(entry.encrypted_plaintext);
      const nonce = base64_to_array(entry.plaintext_nonce);

      const plaintext_bytes = await decrypt_escrow_payload(
        escrow_key,
        ciphertext,
        nonce,
      );

      const plaintext = new TextDecoder().decode(plaintext_bytes);

      await set_cached_ratchet_plaintext(entry.message_id, plaintext);
    } catch {
      /* skip entries that fail to decrypt */
    }
  }
}
