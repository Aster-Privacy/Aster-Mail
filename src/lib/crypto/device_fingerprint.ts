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

import { base64url_decode } from "./device_envelope";

const FINGERPRINT_DOMAIN = "aster-bridge-device-fingerprint-v1";
const FINGERPRINT_BYTES = 10;
const ED25519_PK_BYTES = 32;
const MLKEM_PK_BYTES = 1184;
const X25519_PK_BYTES = 32;

export interface EncodedDeviceKeys {
  ed25519_pk: string;
  mlkem_pk: string;
  x25519_pk: string;
}

function length_prefixed(key: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + key.length);

  new DataView(out.buffer).setUint32(0, key.length, false);
  out.set(key, 4);

  return out;
}

export function device_key_fingerprint(
  ed25519_pk: Uint8Array,
  mlkem_pk: Uint8Array,
  x25519_pk: Uint8Array,
): string {
  const hasher = sha256.create();

  hasher.update(new TextEncoder().encode(FINGERPRINT_DOMAIN));
  hasher.update(new Uint8Array(1));
  hasher.update(length_prefixed(ed25519_pk));
  hasher.update(length_prefixed(mlkem_pk));
  hasher.update(length_prefixed(x25519_pk));

  const hex = Array.from(hasher.digest().subarray(0, FINGERPRINT_BYTES))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return hex.match(/.{4}/g)!.join(" ");
}

export function fingerprint_of_encoded_device_keys(
  keys: EncodedDeviceKeys,
): string | null {
  try {
    const ed25519_pk = base64url_decode(keys.ed25519_pk);
    const mlkem_pk = base64url_decode(keys.mlkem_pk);
    const x25519_pk = base64url_decode(keys.x25519_pk);

    if (
      ed25519_pk.length !== ED25519_PK_BYTES ||
      mlkem_pk.length !== MLKEM_PK_BYTES ||
      x25519_pk.length !== X25519_PK_BYTES
    ) {
      return null;
    }

    return device_key_fingerprint(ed25519_pk, mlkem_pk, x25519_pk);
  } catch {
    return null;
  }
}
