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

import {
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "./key_manager";
import { load_pq_secret, delete_pq_secret } from "./pq_prekey_store";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

const HASH_ALG = ["SHA", "256"].join("-");
const X3DH_INFO_CLASSICAL = new TextEncoder().encode("Aster Mail_X3DH_v1");
const X3DH_INFO_PQ = new TextEncoder().encode("Aster Mail_PQXDH_v1");
const X3DH_SALT = new Uint8Array(32);

interface PqPrekey {
  key_id: number;
  public_key: string;
}

interface X3dhSenderResult {
  shared_secret: Uint8Array;
  ephemeral_public_key: Uint8Array;
  pq_ciphertext?: Uint8Array;
  pq_key_id?: number;
}

interface PrekeyBundle {
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  one_time_prekey?: string | null;
  pq_prekey?: PqPrekey | null;
}

interface PqReceiverInput {
  pq_ciphertext: Uint8Array;
  pq_key_id: number;
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function generate_ephemeral_keypair(): Promise<{
  public_key: CryptoKey;
  secret_key: CryptoKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    false,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );

  return {
    public_key: keypair.publicKey,
    secret_key: keypair.privateKey,
    public_key_raw: new Uint8Array(public_key_raw),
  };
}

async function kdf_x3dh(
  dh_outputs: Uint8Array[],
  info: Uint8Array,
): Promise<Uint8Array> {
  let total_length = 0;

  for (const dh of dh_outputs) {
    total_length += dh.length;
  }

  const concatenated = new Uint8Array(total_length);
  let offset = 0;

  for (const dh of dh_outputs) {
    concatenated.set(dh, offset);
    offset += dh.length;
  }

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    concatenated,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: X3DH_SALT,
      info,
    },
    hkdf_key,
    256,
  );

  concatenated.fill(0);

  return new Uint8Array(derived);
}

export async function perform_x3dh_sender(
  sender_identity_jwk: JsonWebKey,
  recipient_bundle: PrekeyBundle,
): Promise<X3dhSenderResult> {
  const sender_identity_private =
    await import_ke_private_key(sender_identity_jwk);

  const recipient_identity_raw = base64_to_array(
    recipient_bundle.kem_identity_key,
  );
  const recipient_signed_prekey_raw = base64_to_array(
    recipient_bundle.signed_prekey,
  );

  const recipient_identity_public = await import_ke_public_key(
    recipient_identity_raw,
  );
  const recipient_signed_prekey_public = await import_ke_public_key(
    recipient_signed_prekey_raw,
  );

  const ephemeral = await generate_ephemeral_keypair();

  const dh1 = await compute_agreement_bits(
    sender_identity_private,
    recipient_signed_prekey_public,
  );

  const dh2 = await compute_agreement_bits(
    ephemeral.secret_key,
    recipient_identity_public,
  );

  const dh3 = await compute_agreement_bits(
    ephemeral.secret_key,
    recipient_signed_prekey_public,
  );

  let shared_secret: Uint8Array;
  let pq_ciphertext: Uint8Array | undefined;
  let pq_key_id: number | undefined;

  if (recipient_bundle.pq_prekey) {
    const pq_pub = base64_to_array(recipient_bundle.pq_prekey.public_key);
    const encap = ml_kem768.encapsulate(pq_pub);
    const pq_ss = encap.sharedSecret;

    try {
      shared_secret = await kdf_x3dh([dh1, dh2, dh3, pq_ss], X3DH_INFO_PQ);
    } finally {
      pq_ss.fill(0);
    }

    pq_ciphertext = encap.cipherText;
    pq_key_id = recipient_bundle.pq_prekey.key_id;
  } else {
    shared_secret = await kdf_x3dh([dh1, dh2, dh3], X3DH_INFO_CLASSICAL);
  }

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);

  const result: X3dhSenderResult = {
    shared_secret,
    ephemeral_public_key: ephemeral.public_key_raw,
  };

  if (pq_ciphertext !== undefined && pq_key_id !== undefined) {
    result.pq_ciphertext = pq_ciphertext;
    result.pq_key_id = pq_key_id;
  }

  return result;
}

export async function perform_x3dh_receiver(
  receiver_identity_jwk: JsonWebKey,
  receiver_signed_prekey_jwk: JsonWebKey,
  sender_identity_raw: Uint8Array,
  sender_ephemeral_raw: Uint8Array,
  pq_input?: PqReceiverInput | null,
): Promise<Uint8Array> {
  const receiver_identity_private = await import_ke_private_key(
    receiver_identity_jwk,
  );
  const receiver_signed_prekey_private = await import_ke_private_key(
    receiver_signed_prekey_jwk,
  );

  const sender_identity_public =
    await import_ke_public_key(sender_identity_raw);
  const sender_ephemeral_public =
    await import_ke_public_key(sender_ephemeral_raw);

  const dh1 = await compute_agreement_bits(
    receiver_signed_prekey_private,
    sender_identity_public,
  );

  const dh2 = await compute_agreement_bits(
    receiver_identity_private,
    sender_ephemeral_public,
  );

  const dh3 = await compute_agreement_bits(
    receiver_signed_prekey_private,
    sender_ephemeral_public,
  );

  let shared_secret: Uint8Array;

  if (pq_input) {
    const pq_sk = await load_pq_secret(pq_input.pq_key_id);

    if (!pq_sk) {
      dh1.fill(0);
      dh2.fill(0);
      dh3.fill(0);
      throw new Error("Missing PQ prekey secret for the supplied key id");
    }

    let pq_ss: Uint8Array;

    try {
      pq_ss = ml_kem768.decapsulate(pq_input.pq_ciphertext, pq_sk);
    } finally {
      pq_sk.fill(0);
    }

    try {
      shared_secret = await kdf_x3dh([dh1, dh2, dh3, pq_ss], X3DH_INFO_PQ);
    } finally {
      pq_ss.fill(0);
    }

    await delete_pq_secret(pq_input.pq_key_id);
  } else {
    shared_secret = await kdf_x3dh([dh1, dh2, dh3], X3DH_INFO_CLASSICAL);
  }

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);

  return shared_secret;
}

export type { PrekeyBundle, X3dhSenderResult, PqPrekey, PqReceiverInput };
