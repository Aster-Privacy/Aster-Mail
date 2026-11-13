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

export type envelope_version = 1 | 2;

export const ENVELOPE_VERSIONS: readonly envelope_version[] = [1, 2];

export interface envelope_recipient {
  ed25519_pk: Uint8Array;
  mlkem_pk: Uint8Array;
  x25519_pk: Uint8Array;
}

const ENROLL_INFO_V1 = new TextEncoder().encode("astermail-device-enroll-v1");
const ENROLL_INFO_V2 = new TextEncoder().encode("astermail-device-enroll-v2");
const ENVELOPE_V2_MAGIC = new TextEncoder().encode("AEV2");
const ED25519_PK_LEN = 32;
const MLKEM_PK_LEN = 1184;
const MLKEM_CT_LEN = 1088;
const X25519_PK_LEN = 32;
const NONCE_LEN = 24;
const HEADER_LEN = X25519_PK_LEN + MLKEM_CT_LEN + NONCE_LEN;
const TAG_LEN = 16;

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

function starts_with_magic(data: Uint8Array): boolean {
  if (data.length < ENVELOPE_V2_MAGIC.length) return false;

  return ENVELOPE_V2_MAGIC.every((byte, index) => data[index] === byte);
}

export function choose_envelope_version(offered: unknown): envelope_version {
  return Array.isArray(offered) && offered.includes(2) ? 2 : 1;
}

function envelope_v2_transcript(
  recipient: envelope_recipient,
  eph_pk: Uint8Array,
  mlkem_ct: Uint8Array,
): Uint8Array {
  if (
    recipient.ed25519_pk.length !== ED25519_PK_LEN ||
    recipient.mlkem_pk.length !== MLKEM_PK_LEN ||
    recipient.x25519_pk.length !== X25519_PK_LEN
  ) {
    throw new Error("envelope recipient key size");
  }

  return sha256(
    concat_bytes(
      ENROLL_INFO_V2,
      ENVELOPE_V2_MAGIC,
      recipient.ed25519_pk,
      recipient.mlkem_pk,
      recipient.x25519_pk,
      eph_pk,
      mlkem_ct,
    ),
  );
}

function envelope_key(
  ss_pq: Uint8Array,
  ss_cl: Uint8Array,
  nonce: Uint8Array,
  transcript: Uint8Array | null,
): Uint8Array {
  const ikm = concat_bytes(ss_pq, ss_cl);
  const info = transcript
    ? concat_bytes(ENROLL_INFO_V2, transcript)
    : ENROLL_INFO_V1;

  try {
    return hkdf(sha256, ikm, nonce, info, 32);
  } finally {
    ikm.fill(0);
  }
}

function envelope_aad(transcript: Uint8Array | null): Uint8Array | undefined {
  return transcript ? concat_bytes(ENVELOPE_V2_MAGIC, transcript) : undefined;
}

export async function seal_vault_key_for_device(
  vault_key_bytes: Uint8Array,
  recipient: envelope_recipient,
  version: envelope_version,
): Promise<Uint8Array> {
  if (!ENVELOPE_VERSIONS.includes(version)) {
    throw new Error("unsupported envelope version");
  }
  if (recipient.x25519_pk.length !== X25519_PK_LEN) {
    throw new Error("envelope recipient key size");
  }

  const { cipherText: mlkem_ct, sharedSecret: ss_pq } =
    ml_kem768.encapsulate(recipient.mlkem_pk);
  const eph_sk = randomBytes(32);
  const eph_pk = x25519.getPublicKey(eph_sk);
  const ss_cl = x25519.getSharedSecret(eph_sk, recipient.x25519_pk);
  const nonce = randomBytes(NONCE_LEN);
  let shared: Uint8Array | null = null;

  try {
    const transcript =
      version === 2
        ? envelope_v2_transcript(recipient, eph_pk, mlkem_ct)
        : null;

    shared = envelope_key(ss_pq, ss_cl, nonce, transcript);
    const ct = xchacha20poly1305(shared, nonce, envelope_aad(transcript)).encrypt(
      vault_key_bytes,
    );

    return transcript
      ? concat_bytes(ENVELOPE_V2_MAGIC, eph_pk, mlkem_ct, nonce, ct)
      : concat_bytes(eph_pk, mlkem_ct, nonce, ct);
  } finally {
    eph_sk.fill(0);
    ss_cl.fill(0);
    ss_pq.fill(0);
    shared?.fill(0);
  }
}

export function open_vault_key_envelope(
  sealed: Uint8Array,
  recipient: envelope_recipient,
  device_mlkem_sk: Uint8Array,
  device_x25519_sk: Uint8Array,
): Uint8Array {
  const versioned = starts_with_magic(sealed);
  const body = versioned ? sealed.subarray(ENVELOPE_V2_MAGIC.length) : sealed;

  if (body.length < HEADER_LEN + TAG_LEN) {
    throw new Error("envelope too short");
  }

  const eph_pk = body.subarray(0, X25519_PK_LEN);
  const mlkem_ct = body.subarray(X25519_PK_LEN, X25519_PK_LEN + MLKEM_CT_LEN);
  const nonce = body.subarray(X25519_PK_LEN + MLKEM_CT_LEN, HEADER_LEN);
  const ct = body.subarray(HEADER_LEN);
  const transcript = versioned
    ? envelope_v2_transcript(recipient, eph_pk, mlkem_ct)
    : null;

  const ss_pq = ml_kem768.decapsulate(mlkem_ct, device_mlkem_sk);
  const ss_cl = x25519.getSharedSecret(device_x25519_sk, eph_pk);
  const shared = envelope_key(ss_pq, ss_cl, nonce, transcript);

  try {
    return xchacha20poly1305(shared, nonce, envelope_aad(transcript)).decrypt(ct);
  } finally {
    ss_pq.fill(0);
    ss_cl.fill(0);
    shared.fill(0);
  }
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
