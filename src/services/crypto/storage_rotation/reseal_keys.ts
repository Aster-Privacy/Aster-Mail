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
import type { EncryptedVault } from "../key_manager";

import { array_to_base64, base64_to_array } from "../base64";
import { zero_uint8_array } from "../secure_memory";
import {
  STORAGE_WRITE_KEY_LENGTH,
  decode_vault_storage_key,
  derive_storage_hmac_key,
  import_storage_aes_key,
} from "../storage_write_key";

import { HASH_ALG } from "@/services/crypto/constants";

export const ESCROW_HKDF_SALT = "Aster_Mail_Plaintext_Escrow";
export const ESCROW_HKDF_INFO = "plaintext_escrow_key";
export const RATCHET_HKDF_SALT = "Aster Mail_Ratchet_State_Encryption";
export const RATCHET_HKDF_INFO = "ratchet_state_key";
export const NONCE_LENGTH = 12;

export type EscrowFallback = (
  ciphertext: Uint8Array,
  nonce: Uint8Array,
) => Promise<ArrayBuffer | null>;

export interface SealedValue {
  ciphertext: string;
  nonce: string;
}

export interface ResealKeys {
  key_id: string;
  new_aes: CryptoKey;
  new_escrow: CryptoKey;
  old_aes: CryptoKey[];
  old_escrow: CryptoKey[];
  new_ratchet: CryptoKey;
  old_ratchet: CryptoKey[];
  escrow_fallback: EscrowFallback | null;
  hmac(info: string): Promise<CryptoKey>;
  old_hmacs(info: string): Promise<CryptoKey[]>;
  dispose(): void;
}

export interface ResealKeyOptions {
  extra_old_raws?: Uint8Array[];
  extra_old_aes?: CryptoKey[];
  escrow_fallback?: EscrowFallback | null;
}

type StorageKeySource = Pick<
  EncryptedVault,
  "data_kek" | "legacy_keks" | "storage_rekey" | "data_kek_random"
>;

function bytes_equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

export async function derive_escrow_aes_key(
  raw: Uint8Array,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode(ESCROW_HKDF_SALT),
      info: new TextEncoder().encode(ESCROW_HKDF_INFO),
      hash: HASH_ALG,
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function derive_ratchet_aes_key(
  raw: Uint8Array,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode(RATCHET_HKDF_SALT),
      info: new TextEncoder().encode(RATCHET_HKDF_INFO),
      hash: HASH_ALG,
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function storage_key_id(raw: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(HASH_ALG, raw);

  return array_to_base64(new Uint8Array(digest).slice(0, 12));
}

export function collect_old_storage_raws(
  vault: Pick<EncryptedVault, "data_kek" | "legacy_keks" | "storage_rekey">,
  extra: Uint8Array[] = [],
): Uint8Array[] {
  const current = decode_vault_storage_key(vault.data_kek);
  const out: Uint8Array[] = [];
  const consider = (raw: Uint8Array | null): void => {
    if (!raw) return;

    const rejected =
      raw.length !== STORAGE_WRITE_KEY_LENGTH ||
      (current !== null && bytes_equal(raw, current)) ||
      out.some((seen) => bytes_equal(seen, raw));

    if (rejected) {
      zero_uint8_array(raw);

      return;
    }
    out.push(raw);
  };

  for (const value of vault.storage_rekey?.prior_keys ?? []) {
    consider(decode_vault_storage_key(value));
  }
  for (const entry of vault.legacy_keks ?? []) {
    consider(decode_vault_storage_key(entry.k));
  }
  for (const raw of extra) {
    consider(new Uint8Array(raw));
  }
  if (current) zero_uint8_array(current);

  return out;
}

export async function build_reseal_keys(
  vault: StorageKeySource,
  options: ResealKeyOptions = {},
): Promise<ResealKeys | null> {
  if (vault.data_kek_random !== true) return null;

  const new_raw = decode_vault_storage_key(vault.data_kek);

  if (!new_raw || new_raw.length !== STORAGE_WRITE_KEY_LENGTH) return null;

  const old_raws = collect_old_storage_raws(vault, options.extra_old_raws);
  const key_id = await storage_key_id(new_raw);
  const new_aes = await import_storage_aes_key(new_raw);
  const new_escrow = await derive_escrow_aes_key(new_raw);
  const old_aes = [
    ...(await Promise.all(old_raws.map((raw) => import_storage_aes_key(raw)))),
    ...(options.extra_old_aes ?? []),
  ];
  const old_escrow = await Promise.all(
    old_raws.map((raw) => derive_escrow_aes_key(raw)),
  );
  const new_ratchet = await derive_ratchet_aes_key(new_raw);
  const old_ratchet = await Promise.all(
    old_raws.map((raw) => derive_ratchet_aes_key(raw)),
  );
  const new_hmacs = new Map<string, Promise<CryptoKey>>();
  const old_hmac_sets = new Map<string, Promise<CryptoKey[]>>();

  let disposed = false;

  return {
    key_id,
    new_aes,
    new_escrow,
    old_aes,
    old_escrow,
    new_ratchet,
    old_ratchet,
    escrow_fallback: options.escrow_fallback ?? null,
    old_hmacs(info: string): Promise<CryptoKey[]> {
      if (disposed) {
        return Promise.reject(new Error("reseal keys disposed"));
      }

      let pending = old_hmac_sets.get(info);

      if (!pending) {
        pending = Promise.all(
          old_raws.map((raw) => derive_storage_hmac_key(raw, info)),
        );
        old_hmac_sets.set(info, pending);
      }

      return pending;
    },
    hmac(info: string): Promise<CryptoKey> {
      if (disposed) {
        return Promise.reject(new Error("reseal keys disposed"));
      }

      let pending = new_hmacs.get(info);

      if (!pending) {
        pending = derive_storage_hmac_key(new_raw, info);
        new_hmacs.set(info, pending);
      }

      return pending;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      zero_uint8_array(new_raw);
      old_raws.forEach((raw) => zero_uint8_array(raw));
    },
  };
}

export async function try_open(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  additional_data?: Uint8Array,
): Promise<Uint8Array | null> {
  if (nonce.length === 0) return null;

  const params: AesGcmParams = additional_data
    ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
    : { name: "AES-GCM", iv: nonce };

  try {
    return new Uint8Array(await crypto.subtle.decrypt(params, key, ciphertext));
  } catch {
    return null;
  }
}

export async function open_with_any(
  keys: CryptoKey[],
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  additional_data?: Uint8Array,
): Promise<Uint8Array | null> {
  for (let i = 0; i < keys.length; i++) {
    const opened = await try_open(keys[i], ciphertext, nonce, additional_data);

    if (opened) {
      if (i > 0) {
        const [hit] = keys.splice(i, 1);

        keys.unshift(hit);
      }

      return opened;
    }
  }

  return null;
}

export function decode_b64(value: string | null | undefined): Uint8Array | null {
  if (!value) return null;

  try {
    return base64_to_array(value);
  } catch {
    return null;
  }
}

export async function opens_under_new(
  keys: ResealKeys,
  ciphertext_b64: string | null | undefined,
  nonce_b64: string | null | undefined,
): Promise<boolean> {
  const ciphertext = decode_b64(ciphertext_b64);
  const nonce = decode_b64(nonce_b64);

  if (!ciphertext || !nonce) return false;

  const opened = await try_open(keys.new_aes, ciphertext, nonce);

  if (!opened) return false;
  zero_uint8_array(opened);

  return true;
}

export async function open_under_old(
  keys: ResealKeys,
  ciphertext_b64: string | null | undefined,
  nonce_b64: string | null | undefined,
): Promise<Uint8Array | null> {
  const ciphertext = decode_b64(ciphertext_b64);
  const nonce = decode_b64(nonce_b64);

  if (!ciphertext || !nonce) return null;

  return open_with_any(keys.old_aes, ciphertext, nonce);
}

export async function seal_under_new(
  keys: ResealKeys,
  plaintext: Uint8Array,
  additional_data?: Uint8Array,
  aes_key: CryptoKey = keys.new_aes,
): Promise<SealedValue> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const params: AesGcmParams = additional_data
    ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
    : { name: "AES-GCM", iv: nonce };
  const ciphertext = await crypto.subtle.encrypt(params, aes_key, plaintext);

  return {
    ciphertext: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

export async function sign_under_new(
  keys: ResealKeys,
  info: string,
  value: string,
): Promise<string> {
  const key = await keys.hmac(info);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return array_to_base64(new Uint8Array(signature));
}
