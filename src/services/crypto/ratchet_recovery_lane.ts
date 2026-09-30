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

import { array_to_base64, base64_to_array } from "./base64";
import {
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "./key_manager";

import { HASH_ALG } from "@/services/crypto/constants";

export const RECOVERY_LANE_VERSION = 1;

const LANE_LABEL = "aster.ratchet.recovery.lane.v1";
const AES_ALG = "AES-GCM";
const NONCE_BYTES = 12;

export interface RecoveryLaneData {
  v: number;
  epk: string;
  kem_ct?: string;
  ciphertext: string;
  nonce: string;
  rid: string;
}

export interface RecoveryLaneRecipientKeys {
  identity_public: string;
  pq_identity_public?: string;
}

export interface RecoveryLaneOwnKeys {
  identity_jwk: string;
  identity_public: string;
  pq_identity_secret?: string;
}

async function build_binding_info(
  conversation_id: string,
  sender_identity_public: string,
  recipient: RecoveryLaneRecipientKeys,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const parts = [
    LANE_LABEL,
    conversation_id,
    sender_identity_public,
    recipient.identity_public,
    recipient.pq_identity_public ?? "",
  ].map((part) => encoder.encode(part));

  let total_length = 0;

  for (const part of parts) {
    total_length += 4 + part.length;
  }

  const framed = new Uint8Array(total_length);
  const view = new DataView(framed.buffer);
  let offset = 0;

  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    framed.set(part, offset);
    offset += part.length;
  }

  return new Uint8Array(await crypto.subtle.digest(HASH_ALG, framed));
}

async function lane_salt(): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    HASH_ALG,
    new TextEncoder().encode(LANE_LABEL),
  );

  return new Uint8Array(digest);
}

async function derive_lane_key(
  secrets: Uint8Array[],
  info: Uint8Array,
): Promise<CryptoKey> {
  let total_length = 0;

  for (const secret of secrets) {
    total_length += secret.length;
  }

  const concatenated = new Uint8Array(total_length);
  let offset = 0;

  for (const secret of secrets) {
    concatenated.set(secret, offset);
    offset += secret.length;
  }

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    concatenated,
    "HKDF",
    false,
    ["deriveKey"],
  );

  try {
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: HASH_ALG,
        salt: await lane_salt(),
        info,
      },
      hkdf_key,
      { name: AES_ALG, length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    concatenated.fill(0);
  }
}

export function can_seal_recovery_lane(
  recipient: Partial<RecoveryLaneRecipientKeys> | null | undefined,
): recipient is RecoveryLaneRecipientKeys {
  return (
    !!recipient &&
    typeof recipient.identity_public === "string" &&
    recipient.identity_public.length > 0
  );
}

export function recovery_lane_is_post_quantum(
  recipient: RecoveryLaneRecipientKeys,
): boolean {
  return (
    typeof recipient.pq_identity_public === "string" &&
    recipient.pq_identity_public.length > 0
  );
}

export async function seal_recovery_lane(
  plaintext: string,
  conversation_id: string,
  sender_identity_public: string,
  recipient: RecoveryLaneRecipientKeys,
): Promise<RecoveryLaneData> {
  const info = await build_binding_info(
    conversation_id,
    sender_identity_public,
    recipient,
  );

  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const ephemeral_public_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );

  const recipient_identity = await import_ke_public_key(
    base64_to_array(recipient.identity_public),
  );

  const dh_secret = await compute_agreement_bits(
    ephemeral.privateKey,
    recipient_identity,
  );

  const encapsulation = recovery_lane_is_post_quantum(recipient)
    ? ml_kem768.encapsulate(base64_to_array(recipient.pq_identity_public!))
    : null;

  const pq_secret = encapsulation?.sharedSecret ?? null;

  try {
    const lane_key = await derive_lane_key(
      pq_secret ? [dh_secret, pq_secret] : [dh_secret],
      info,
    );
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: AES_ALG, iv: nonce, additionalData: info },
        lane_key,
        new TextEncoder().encode(plaintext),
      ),
    );

    return {
      v: RECOVERY_LANE_VERSION,
      epk: array_to_base64(ephemeral_public_raw),
      kem_ct: encapsulation
        ? array_to_base64(encapsulation.cipherText)
        : undefined,
      ciphertext: array_to_base64(ciphertext),
      nonce: array_to_base64(nonce),
      rid: recipient.identity_public,
    };
  } finally {
    dh_secret.fill(0);
    pq_secret?.fill(0);
  }
}

export async function open_recovery_lane(
  data: RecoveryLaneData,
  conversation_id: string,
  sender_identity_public: string,
  own_keys: RecoveryLaneOwnKeys,
  own_pq_identity_public: string,
): Promise<string | null> {
  if (data.v !== RECOVERY_LANE_VERSION) return null;

  const info = await build_binding_info(
    conversation_id,
    sender_identity_public,
    {
      identity_public: own_keys.identity_public,
      pq_identity_public: data.kem_ct ? own_pq_identity_public : "",
    },
  );

  let dh_secret: Uint8Array | null = null;
  let pq_secret: Uint8Array | null = null;
  let pq_secret_key: Uint8Array | null = null;

  try {
    const identity_private = await import_ke_private_key(
      JSON.parse(own_keys.identity_jwk) as JsonWebKey,
    );

    const ephemeral_public = await import_ke_public_key(
      base64_to_array(data.epk),
    );

    dh_secret = await compute_agreement_bits(
      identity_private,
      ephemeral_public,
    );

    if (data.kem_ct) {
      if (!own_keys.pq_identity_secret) return null;

      pq_secret_key = base64_to_array(own_keys.pq_identity_secret);
      pq_secret = ml_kem768.decapsulate(
        base64_to_array(data.kem_ct),
        pq_secret_key,
      );
    }

    const lane_key = await derive_lane_key(
      pq_secret ? [dh_secret, pq_secret] : [dh_secret],
      info,
    );

    const plaintext = await crypto.subtle.decrypt(
      {
        name: AES_ALG,
        iv: base64_to_array(data.nonce),
        additionalData: info,
      },
      lane_key,
      base64_to_array(data.ciphertext),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  } finally {
    dh_secret?.fill(0);
    pq_secret?.fill(0);
    pq_secret_key?.fill(0);
  }
}
