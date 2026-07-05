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
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

import { zero_uint8_array } from "./secure_memory";

const PHRASE_STRENGTH_BITS = 128;
const WRAP_KDF_ITERATIONS = 310000;
const WRAP_KEY_LENGTH = 32;
const VERIFIER_CONTEXT = "aster-mk-phrase-verifier-v1";

export const RECOVERY_PHRASE_WORD_COUNT = 12;

export interface PhraseWrapResult {
  verifier_hash: string;
  wrapped_vault: string;
  wrap_nonce: string;
  wrap_salt: string;
}

export function generate_recovery_phrase(): string {
  return generateMnemonic(wordlist, PHRASE_STRENGTH_BITS);
}

export function normalize_recovery_phrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFKD");
}

export function is_valid_recovery_phrase(phrase: string): boolean {
  return validateMnemonic(normalize_recovery_phrase(phrase), wordlist);
}

export function get_phrase_wordlist(): readonly string[] {
  return wordlist;
}

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }

  return btoa(binary);
}

function base64_to_array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function derive_phrase_wrap_key(
  phrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const phrase_bytes = new TextEncoder().encode(
    normalize_recovery_phrase(phrase),
  );

  const key_material = await crypto.subtle.importKey(
    "raw",
    phrase_bytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: WRAP_KDF_ITERATIONS,
      hash: "SHA-256",
    },
    key_material,
    WRAP_KEY_LENGTH * 8,
  );

  zero_uint8_array(phrase_bytes);

  return new Uint8Array(derived_bits);
}

async function derive_phrase_verifier(phrase: string): Promise<Uint8Array> {
  const context = new TextEncoder().encode(VERIFIER_CONTEXT);
  const phrase_bytes = new TextEncoder().encode(
    normalize_recovery_phrase(phrase),
  );
  const combined = new Uint8Array(context.length + phrase_bytes.length);

  combined.set(context, 0);
  combined.set(phrase_bytes, context.length);

  const hash = await crypto.subtle.digest("SHA-256", combined);

  zero_uint8_array(phrase_bytes);
  zero_uint8_array(combined);

  return new Uint8Array(hash);
}

export async function wrap_vault_with_phrase(
  vault_json: string,
  phrase: string,
): Promise<PhraseWrapResult> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const wrap_key = await derive_phrase_wrap_key(phrase, salt);
  const verifier = await derive_phrase_verifier(phrase);

  const aes_key = await crypto.subtle.importKey(
    "raw",
    wrap_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    new TextEncoder().encode(vault_json),
  );

  zero_uint8_array(wrap_key);

  return {
    verifier_hash: array_to_base64(verifier),
    wrapped_vault: array_to_base64(new Uint8Array(ciphertext)),
    wrap_nonce: array_to_base64(nonce),
    wrap_salt: array_to_base64(salt),
  };
}

export async function compute_phrase_verifier(phrase: string): Promise<string> {
  const verifier = await derive_phrase_verifier(phrase);

  return array_to_base64(verifier);
}

export async function unwrap_vault_with_phrase(
  phrase: string,
  wrapped_vault: string,
  wrap_nonce: string,
  wrap_salt: string,
): Promise<string | null> {
  try {
    const wrap_key = await derive_phrase_wrap_key(
      phrase,
      base64_to_array(wrap_salt),
    );

    const aes_key = await crypto.subtle.importKey(
      "raw",
      wrap_key,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    zero_uint8_array(wrap_key);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(wrap_nonce) },
      aes_key,
      base64_to_array(wrapped_vault),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
