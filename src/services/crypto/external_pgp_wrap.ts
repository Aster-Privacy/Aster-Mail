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

export const EXTERNAL_PGP_WRAP_LABEL = "aster-external-pgp-v1";
export const EXTERNAL_PGP_CHALLENGE_LABEL = "aster-external-pgp-challenge-v1";
export const EXTERNAL_PGP_WRAP_VERSION = 0x01;

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const DATA_KEK_LENGTH = 32;
const FINGERPRINT_PATTERN = /^[0-9a-f]{40}$/;

const encoder = new TextEncoder();

export class external_key_unwrap_error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "external_key_unwrap_error";
  }
}

function normalize_user_id(user_id: string): string {
  const normalized = user_id.trim().toLowerCase();

  if (!normalized) throw new Error("user id required");

  return normalized;
}

export function normalize_external_fingerprint(fingerprint: string): string {
  const normalized = fingerprint.replace(/\s+/g, "").toLowerCase();

  if (!FINGERPRINT_PATTERN.test(normalized)) {
    throw new Error("expected a v4 fingerprint");
  }

  return normalized;
}

export function external_wrap_aad(
  user_id: string,
  fingerprint: string,
): Uint8Array {
  return encoder.encode(
    `${EXTERNAL_PGP_WRAP_LABEL}|${normalize_user_id(user_id)}|${normalize_external_fingerprint(fingerprint)}`,
  );
}

export function external_challenge_message(
  user_id: string,
  challenge: string,
): Uint8Array {
  return encoder.encode(
    `${EXTERNAL_PGP_CHALLENGE_LABEL}:${normalize_user_id(user_id)}:${challenge}`,
  );
}

async function derive_wrap_key(
  data_kek: Uint8Array,
  user_id: string,
): Promise<CryptoKey> {
  if (data_kek.length !== DATA_KEK_LENGTH) {
    throw new Error("data key has the wrong length");
  }

  const ikm = await crypto.subtle.importKey(
    "raw",
    data_kek,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(EXTERNAL_PGP_WRAP_LABEL),
      info: encoder.encode(normalize_user_id(user_id)),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrap_external_private_key(
  plaintext: Uint8Array,
  data_kek: Uint8Array,
  user_id: string,
  fingerprint: string,
): Promise<string> {
  const key = await derive_wrap_key(data_kek, user_id);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: external_wrap_aad(user_id, fingerprint),
        tagLength: TAG_LENGTH * 8,
      },
      key,
      plaintext,
    ),
  );
  const blob = new Uint8Array(1 + NONCE_LENGTH + sealed.length);

  blob[0] = EXTERNAL_PGP_WRAP_VERSION;
  blob.set(nonce, 1);
  blob.set(sealed, 1 + NONCE_LENGTH);

  return array_to_base64(blob);
}

export async function unwrap_external_private_key(
  wrapped: string,
  data_kek: Uint8Array,
  user_id: string,
  fingerprint: string,
): Promise<Uint8Array> {
  let blob: Uint8Array;

  try {
    blob = base64_to_array(wrapped);
  } catch {
    throw new external_key_unwrap_error("wrapped key is not base64");
  }

  if (blob.length < 1 + NONCE_LENGTH + TAG_LENGTH + 1) {
    throw new external_key_unwrap_error("wrapped key is too short");
  }

  if (blob[0] !== EXTERNAL_PGP_WRAP_VERSION) {
    throw new external_key_unwrap_error("unknown wrap version");
  }

  const key = await derive_wrap_key(data_kek, user_id);

  try {
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: blob.subarray(1, 1 + NONCE_LENGTH),
        additionalData: external_wrap_aad(user_id, fingerprint),
        tagLength: TAG_LENGTH * 8,
      },
      key,
      blob.subarray(1 + NONCE_LENGTH),
    );

    return new Uint8Array(opened);
  } catch {
    throw new external_key_unwrap_error("wrapped key failed to open");
  }
}
