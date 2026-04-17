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
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";

const ENROLL_INFO = "astermail-device-enroll-v1";

function concat_bytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;

  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;

  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }

  return out;
}

export async function seal_vault_key_for_device(
  vault_key_bytes: Uint8Array,
  _device_ed25519_pk: Uint8Array,
  device_mlkem_pk: Uint8Array,
  device_x25519_pk: Uint8Array,
): Promise<Uint8Array> {
  const { cipherText: mlkem_ct, sharedSecret: ss_pq } =
    ml_kem768.encapsulate(device_mlkem_pk);

  const eph_sk = randomBytes(32);
  const eph_pk = x25519.getPublicKey(eph_sk);
  const ss_cl = x25519.getSharedSecret(eph_sk, device_x25519_pk);

  const nonce = randomBytes(24);
  const ikm = concat_bytes(ss_pq, ss_cl);
  const info = new TextEncoder().encode(ENROLL_INFO);
  const shared = hkdf(sha256, ikm, nonce, info, 32);

  const ct = xchacha20poly1305(shared, nonce).encrypt(vault_key_bytes);

  return concat_bytes(eph_pk, mlkem_ct, nonce, ct);
}

export function base64url_encode(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64url_decode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(pad);
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);

  return out;
}
