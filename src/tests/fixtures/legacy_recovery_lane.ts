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

import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
import {
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "@/services/crypto/key_manager";

import { HASH_ALG } from "@/services/crypto/constants";
import { decrypt_aes_gcm_bound_or_unbound } from "@/services/crypto/aes_gcm_aad_fallback";

export const RECOVERY_LANE_VERSION = 1;

const LANE_LABEL = "aster.ratchet.recovery.lane.v1";
const SENDER_LANE_LABEL = "aster.ratchet.recovery.lane.sender.v1";
const AES_ALG = "AES-GCM";
const NONCE_BYTES = 12;

export interface RecoveryLaneData {
  v: number;
  epk: string;
  kem_ct?: string;
  ciphertext: string;
  nonce: string;
  rid: string;
  sct?: string;
  snonce?: string;
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

interface LaneSecrets {
  dh_secret: Uint8Array;
  pq_secret: Uint8Array | null;
}

async function frame_and_digest(values: string[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const parts = values.map((part) => encoder.encode(part));

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

function build_binding_info(
  conversation_id: string,
  sender_identity_public: string,
  recipient: RecoveryLaneRecipientKeys,
): Promise<Uint8Array> {
  return frame_and_digest([
    LANE_LABEL,
    conversation_id,
    sender_identity_public,
    recipient.identity_public,
    recipient.pq_identity_public ?? "",
  ]);
}

function build_sender_binding_info(
  conversation_id: string,
  sender_identity_public: string,
  recipient: RecoveryLaneRecipientKeys,
  epk: string,
  kem_ct: string,
): Promise<Uint8Array> {
  return frame_and_digest([
    SENDER_LANE_LABEL,
    conversation_id,
    sender_identity_public,
    recipient.identity_public,
    recipient.pq_identity_public ?? "",
    epk,
    kem_ct,
  ]);
}

async function lane_salt(label: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    HASH_ALG,
    new TextEncoder().encode(label),
  );

  return new Uint8Array(digest);
}

async function derive_lane_key(
  secrets: Uint8Array[],
  info: Uint8Array,
  label: string,
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
        salt: await lane_salt(label),
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

function lane_secrets(
  secrets: LaneSecrets,
  static_secret: Uint8Array | null,
): Uint8Array[] {
  return [
    secrets.dh_secret,
    ...(static_secret ? [static_secret] : []),
    ...(secrets.pq_secret ? [secrets.pq_secret] : []),
  ];
}

async function static_agreement(
  identity_jwk: string,
  peer_identity_public: string,
): Promise<Uint8Array> {
  const own_private = await import_ke_private_key(
    JSON.parse(identity_jwk) as JsonWebKey,
  );
  const peer_public = await import_ke_public_key(
    base64_to_array(peer_identity_public),
  );

  return compute_agreement_bits(own_private, peer_public);
}

async function seal_with_key(
  key: CryptoKey,
  plaintext: string,
  info: Uint8Array,
): Promise<{ ciphertext: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: AES_ALG, iv: nonce, additionalData: info },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );

  return {
    ciphertext: array_to_base64(ciphertext),
    nonce: array_to_base64(nonce),
  };
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

function recovery_lane_has_sender_proof(
  data: RecoveryLaneData,
): boolean {
  return (
    typeof data.sct === "string" &&
    data.sct.length > 0 &&
    typeof data.snonce === "string" &&
    data.snonce.length > 0
  );
}

export async function seal_recovery_lane(
  plaintext: string,
  conversation_id: string,
  sender_identity_public: string,
  recipient: RecoveryLaneRecipientKeys,
  sender_identity_jwk?: string,
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

  const epk = array_to_base64(
    new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)),
  );

  const recipient_identity = await import_ke_public_key(
    base64_to_array(recipient.identity_public),
  );

  const encapsulation = recovery_lane_is_post_quantum(recipient)
    ? ml_kem768.encapsulate(base64_to_array(recipient.pq_identity_public!))
    : null;
  const kem_ct = encapsulation
    ? array_to_base64(encapsulation.cipherText)
    : undefined;

  const secrets: LaneSecrets = {
    dh_secret: await compute_agreement_bits(
      ephemeral.privateKey,
      recipient_identity,
    ),
    pq_secret: encapsulation?.sharedSecret ?? null,
  };
  let static_secret: Uint8Array | null = null;

  try {
    const lane_key = await derive_lane_key(
      lane_secrets(secrets, null),
      info,
      LANE_LABEL,
    );
    const sealed = await seal_with_key(lane_key, plaintext, info);
    const lane: RecoveryLaneData = {
      v: RECOVERY_LANE_VERSION,
      epk,
      kem_ct,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      rid: recipient.identity_public,
    };

    if (!sender_identity_jwk) return lane;

    static_secret = await static_agreement(
      sender_identity_jwk,
      recipient.identity_public,
    );

    const sender_info = await build_sender_binding_info(
      conversation_id,
      sender_identity_public,
      recipient,
      epk,
      kem_ct ?? "",
    );
    const sender_key = await derive_lane_key(
      lane_secrets(secrets, static_secret),
      sender_info,
      SENDER_LANE_LABEL,
    );
    const sender_sealed = await seal_with_key(
      sender_key,
      plaintext,
      sender_info,
    );

    return {
      ...lane,
      sct: sender_sealed.ciphertext,
      snonce: sender_sealed.nonce,
    };
  } finally {
    secrets.dh_secret.fill(0);
    secrets.pq_secret?.fill(0);
    static_secret?.fill(0);
  }
}

async function recover_lane_secrets(
  data: RecoveryLaneData,
  own_keys: RecoveryLaneOwnKeys,
): Promise<LaneSecrets | null> {
  if (data.kem_ct && !own_keys.pq_identity_secret) return null;

  const identity_private = await import_ke_private_key(
    JSON.parse(own_keys.identity_jwk) as JsonWebKey,
  );
  const ephemeral_public = await import_ke_public_key(
    base64_to_array(data.epk),
  );
  const dh_secret = await compute_agreement_bits(
    identity_private,
    ephemeral_public,
  );

  if (!data.kem_ct) return { dh_secret, pq_secret: null };

  const pq_secret_key = base64_to_array(own_keys.pq_identity_secret!);

  try {
    return {
      dh_secret,
      pq_secret: ml_kem768.decapsulate(
        base64_to_array(data.kem_ct),
        pq_secret_key,
      ),
    };
  } catch (error) {
    dh_secret.fill(0);
    throw error;
  } finally {
    pq_secret_key.fill(0);
  }
}

function own_lane_recipient(
  data: RecoveryLaneData,
  own_keys: RecoveryLaneOwnKeys,
  own_pq_identity_public: string,
): RecoveryLaneRecipientKeys {
  return {
    identity_public: own_keys.identity_public,
    pq_identity_public: data.kem_ct ? own_pq_identity_public : "",
  };
}

export async function open_recovery_lane(
  data: RecoveryLaneData,
  conversation_id: string,
  sender_identity_public: string,
  own_keys: RecoveryLaneOwnKeys,
  own_pq_identity_public: string,
): Promise<string | null> {
  if (
    data.v !== RECOVERY_LANE_VERSION ||
    !recovery_lane_has_sender_proof(data)
  ) {
    return null;
  }

  let secrets: LaneSecrets | null = null;
  let static_secret: Uint8Array | null = null;

  try {
    secrets = await recover_lane_secrets(data, own_keys);

    if (!secrets) return null;

    static_secret = await static_agreement(
      own_keys.identity_jwk,
      sender_identity_public,
    );

    const sender_info = await build_sender_binding_info(
      conversation_id,
      sender_identity_public,
      own_lane_recipient(data, own_keys, own_pq_identity_public),
      data.epk,
      data.kem_ct ?? "",
    );
    const sender_key = await derive_lane_key(
      lane_secrets(secrets, static_secret),
      sender_info,
      SENDER_LANE_LABEL,
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: AES_ALG,
        iv: base64_to_array(data.snonce!),
        additionalData: sender_info,
      },
      sender_key,
      base64_to_array(data.sct!),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  } finally {
    secrets?.dh_secret.fill(0);
    secrets?.pq_secret?.fill(0);
    static_secret?.fill(0);
  }
}

export async function open_unauthenticated_recovery_lane(
  data: RecoveryLaneData,
  conversation_id: string,
  sender_identity_public: string,
  own_keys: RecoveryLaneOwnKeys,
  own_pq_identity_public: string,
): Promise<string | null> {
  if (data.v !== RECOVERY_LANE_VERSION) return null;

  let secrets: LaneSecrets | null = null;

  try {
    secrets = await recover_lane_secrets(data, own_keys);

    if (!secrets) return null;

    const info = await build_binding_info(
      conversation_id,
      sender_identity_public,
      own_lane_recipient(data, own_keys, own_pq_identity_public),
    );
    const lane_key = await derive_lane_key(
      lane_secrets(secrets, null),
      info,
      LANE_LABEL,
    );
    const plaintext = await decrypt_aes_gcm_bound_or_unbound(
      lane_key,
      base64_to_array(data.nonce),
      base64_to_array(data.ciphertext),
      info,
      "accept_unbound",
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  } finally {
    secrets?.dh_secret.fill(0);
    secrets?.pq_secret?.fill(0);
  }
}
