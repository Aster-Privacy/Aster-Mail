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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { x25519 } from "@noble/curves/ed25519";
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { concat_bytes, uuid_bytes } from "./guard_action";

export const GUARD_SEAL_VERSION = 0x01;
export const GUARD_SEAL_EPH_LEN = 32;
export const GUARD_SEAL_MLKEM_CT_LEN = 1088;
export const GUARD_SEAL_NONCE_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN =
  1 + GUARD_SEAL_EPH_LEN + GUARD_SEAL_MLKEM_CT_LEN + GUARD_SEAL_NONCE_LEN;

const encoder = new TextEncoder();
const CONTEXT_DOMAIN = encoder.encode("aster-guard-context-v1");
const CODE_SECRET_DOMAIN = encoder.encode("aster-guard-code-secret-v1");

export class GuardSealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardSealError";
  }
}

export function context_aad(request_id: string, device_id: string): Uint8Array {
  return concat_bytes(CONTEXT_DOMAIN, uuid_bytes(request_id), uuid_bytes(device_id));
}

export function code_secret_aad(device_id: string): Uint8Array {
  return concat_bytes(CODE_SECRET_DOMAIN, uuid_bytes(device_id));
}

export function guard_seal_key(
  x25519_shared: Uint8Array,
  mlkem_shared: Uint8Array,
  eph: Uint8Array,
  mlkem_ct: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  const ikm = concat_bytes(x25519_shared, mlkem_shared);
  const info = concat_bytes(eph, mlkem_ct, aad);

  try {
    return hkdf(sha256, ikm, CONTEXT_DOMAIN, info, 32);
  } finally {
    ikm.fill(0);
  }
}

export function open_guard_seal(
  sealed: Uint8Array,
  aad: Uint8Array,
  mlkem_sk: Uint8Array,
  x25519_sk: Uint8Array,
): Uint8Array {
  if (sealed.length < HEADER_LEN + TAG_LEN) {
    throw new GuardSealError("seal too short");
  }
  if (sealed[0] !== GUARD_SEAL_VERSION) {
    throw new GuardSealError("seal version");
  }

  let offset = 1;
  const eph = sealed.subarray(offset, offset + GUARD_SEAL_EPH_LEN);

  offset += GUARD_SEAL_EPH_LEN;
  const mlkem_ct = sealed.subarray(offset, offset + GUARD_SEAL_MLKEM_CT_LEN);

  offset += GUARD_SEAL_MLKEM_CT_LEN;
  const nonce = sealed.subarray(offset, offset + GUARD_SEAL_NONCE_LEN);

  offset += GUARD_SEAL_NONCE_LEN;
  const ct = sealed.subarray(offset);

  let x_shared: Uint8Array | null = null;
  let kem_shared: Uint8Array | null = null;
  let key: Uint8Array | null = null;

  try {
    x_shared = x25519.getSharedSecret(x25519_sk, eph);
    kem_shared = ml_kem768.decapsulate(mlkem_ct, mlkem_sk);
    key = guard_seal_key(x_shared, kem_shared, eph, mlkem_ct, aad);

    return gcm(key, nonce, aad).decrypt(ct);
  } catch (error) {
    if (error instanceof GuardSealError) throw error;
    throw new GuardSealError("seal open failed");
  } finally {
    x_shared?.fill(0);
    kem_shared?.fill(0);
    key?.fill(0);
  }
}
