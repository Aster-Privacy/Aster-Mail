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
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64, base64_to_array } from "./base64";
import { list_known_login_salts } from "./auth_salt_guard";
import { fallback_key_server_id, PUBLIC_FALLBACK_KEY } from "./legacy_keks";
import {
  get_session_server_known_ids,
  server_known_kek_id,
} from "./server_known_keys";
import { mark_legacy_unverified_plaintext } from "./sent_encryption_evidence";
import { zero_uint8_array } from "./secure_memory";

import { clamp_password } from "@/services/sanitize";
import { ignore_error } from "@/lib/ignore_error";

const LOGIN_HASH_ITERATIONS = 310000;
const LOGIN_V2_INFO = "aster-login-v2";
const MAX_RETIRED_SALTS = 8;

const session_pepper = crypto.getRandomValues(new Uint8Array(32));
const login_hash_ids = new Map<string, Promise<string[]>>();

let retired_salts: string[] | null = null;

export class UnmarkableLegacyOpenError extends Error {
  constructor() {
    super("unmarkable_legacy_open");
    this.name = "UnmarkableLegacyOpenError";
  }
}

export function clear_server_derivable_cache(): void {
  login_hash_ids.clear();
  retired_salts = null;
}

function cache_id(passphrase: Uint8Array, salt: string): string {
  const salt_bytes = new TextEncoder().encode(salt);
  const input = new Uint8Array(
    session_pepper.length + salt_bytes.length + 1 + passphrase.length,
  );

  input.set(session_pepper, 0);
  input.set(salt_bytes, session_pepper.length);
  input.set(passphrase, session_pepper.length + salt_bytes.length + 1);

  try {
    return array_to_base64(sha256(input));
  } finally {
    zero_uint8_array(input);
  }
}

function clamped_passphrase(passphrase: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(passphrase);

  return new TextEncoder().encode(clamp_password(text));
}

async function derive_login_hash_ids(
  passphrase: Uint8Array,
  encoded_salt: string,
): Promise<string[]> {
  let salt: Uint8Array;

  try {
    salt = base64_to_array(encoded_salt);
  } catch {
    return [];
  }
  if (salt.length === 0) return [];

  const material = await crypto.subtle.importKey(
    "raw",
    passphrase,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const v1 = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: LOGIN_HASH_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      256,
    ),
  );
  const ikm = await crypto.subtle.importKey("raw", v1, "HKDF", false, [
    "deriveBits",
  ]);
  const v2 = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(LOGIN_V2_INFO),
      },
      ikm,
      256,
    ),
  );

  try {
    return [server_known_kek_id(v1), server_known_kek_id(v2)];
  } finally {
    zero_uint8_array(v1);
    zero_uint8_array(v2);
  }
}

async function load_retired_salts(): Promise<string[] | null> {
  if (retired_salts) return retired_salts;

  try {
    const { get_retired_login_salts } = await import("@/services/api/auth");
    const salts = await get_retired_login_salts();

    if (salts.length > MAX_RETIRED_SALTS) return null;
    retired_salts = salts;

    return salts;
  } catch (caught) {
    ignore_error(
      "services/crypto/server_derivable_keks:load_retired_salts",
      caught,
    );

    return null;
  }
}

function cached_login_hash_ids(
  passphrase: Uint8Array,
  salt: string,
): Promise<string[]> {
  const key = cache_id(passphrase, salt);
  const cached = login_hash_ids.get(key);

  if (cached) return cached;

  const pending = derive_login_hash_ids(passphrase, salt);

  login_hash_ids.set(key, pending);
  pending.catch(() => {
    if (login_hash_ids.get(key) === pending) login_hash_ids.delete(key);
  });

  return pending;
}

async function memory_state(): Promise<{
  passphrase: Uint8Array | null;
  vault_ids: string[];
}> {
  try {
    const store = await import("./memory_key_store");

    return {
      passphrase: store.get_passphrase_bytes(),
      vault_ids: store.get_vault_from_memory()?.server_known_kek_ids ?? [],
    };
  } catch (caught) {
    ignore_error("services/crypto/server_derivable_keks:memory_state", caught);

    return { passphrase: null, vault_ids: [] };
  }
}

async function login_hash_kek_ids(
  passphrase: Uint8Array,
): Promise<Set<string> | null> {
  const retired = await load_retired_salts();

  if (retired === null) return null;

  const salts = new Set([...list_known_login_salts(), ...retired]);

  if (salts.size === 0) return null;

  const clamped = clamped_passphrase(passphrase);
  const ids = new Set<string>();

  try {
    for (const salt of salts) {
      (await cached_login_hash_ids(clamped, salt)).forEach((id) =>
        ids.add(id),
      );
    }
  } finally {
    zero_uint8_array(clamped);
  }

  return ids;
}

export async function is_server_derivable_fallback(
  key: CryptoKey | null,
  passphrase_bytes?: Uint8Array | null,
): Promise<boolean> {
  if (!key) return false;

  const id = fallback_key_server_id(key);

  if (id === null) return false;
  if (id === PUBLIC_FALLBACK_KEY) return true;

  const memory = await memory_state();

  if (
    get_session_server_known_ids().includes(id) ||
    memory.vault_ids.includes(id)
  ) {
    if (memory.passphrase) zero_uint8_array(memory.passphrase);

    return true;
  }

  const passphrase = passphrase_bytes ?? memory.passphrase;

  try {
    if (!passphrase) return true;

    const ids = await login_hash_kek_ids(passphrase);

    return ids === null || ids.has(id);
  } finally {
    if (memory.passphrase) zero_uint8_array(memory.passphrase);
  }
}

export async function settle_fallback_plaintext(
  plaintext: ArrayBuffer,
  fallback_key: CryptoKey | null,
  passphrase_bytes?: Uint8Array | null,
): Promise<ArrayBuffer> {
  if (!(await is_server_derivable_fallback(fallback_key, passphrase_bytes))) {
    return plaintext;
  }

  return mark_server_derivable_plaintext(plaintext);
}

export function mark_server_derivable_plaintext(
  plaintext: ArrayBuffer,
): ArrayBuffer {
  const opened = new Uint8Array(plaintext);
  const marked = mark_legacy_unverified_plaintext(opened);

  opened.fill(0);
  if (!marked) throw new UnmarkableLegacyOpenError();

  return marked.buffer.slice(
    marked.byteOffset,
    marked.byteOffset + marked.byteLength,
  ) as ArrayBuffer;
}
