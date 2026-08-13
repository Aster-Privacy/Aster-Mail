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
import { HASH_ALG } from "@/services/crypto/constants";
import { base64_to_array } from "./base64";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import {
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "./key_manager";
import { load_pq_secret } from "./pq_prekey_store";

import { ignore_error } from "@/lib/ignore_error";

const ECDH_ALGORITHM = "ECDH";
const ECDH_CURVE = "P-256";

const X3DH_INFO_CLASSICAL = new TextEncoder().encode("Aster Mail_X3DH_v1");
const X3DH_INFO_PQ = new TextEncoder().encode("Aster Mail_PQXDH_v1");
const X3DH_INFO_PQ_IDENTITY = new TextEncoder().encode(
  "Aster Mail_PQXDH_identity_v1",
);
const X3DH_SALT = new Uint8Array(32);

export const PQ_IDENTITY_KEY_ID = -1;
export const ML_KEM_768_EK_LEN = 1184;

export type PqBootstrapMode = "onetime" | "identity" | "none";

interface PqPrekey {
  key_id: number;
  public_key: string;
}

interface X3dhSenderResult {
  shared_secret: Uint8Array;
  ephemeral_public_key: Uint8Array;
  pq_ciphertext?: Uint8Array;
  pq_key_id?: number;
  pq_mode: PqBootstrapMode;
}

interface PrekeyBundle {
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  one_time_prekey?: string | null;
  pq_prekey?: PqPrekey | null;
  pq_kem_public_key?: string | null;
}

interface PqReceiverInput {
  pq_ciphertext: Uint8Array;
  pq_key_id: number;
}


async function generate_ephemeral_keypair(): Promise<{
  public_key: CryptoKey;
  secret_key: CryptoKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: ECDH_ALGORITHM, namedCurve: ECDH_CURVE },
    true,
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

function select_pq_encapsulation_target(recipient_bundle: PrekeyBundle): {
  public_key: Uint8Array;
  key_id: number;
  info: Uint8Array;
  mode: Exclude<PqBootstrapMode, "none">;
} | null {
  if (recipient_bundle.pq_prekey) {
    const onetime = base64_to_array(recipient_bundle.pq_prekey.public_key);

    if (onetime.length === ML_KEM_768_EK_LEN) {
      return {
        public_key: onetime,
        key_id: recipient_bundle.pq_prekey.key_id,
        info: X3DH_INFO_PQ,
        mode: "onetime",
      };
    }
  }

  if (recipient_bundle.pq_kem_public_key) {
    const identity = base64_to_array(recipient_bundle.pq_kem_public_key);

    if (identity.length === ML_KEM_768_EK_LEN) {
      return {
        public_key: identity,
        key_id: PQ_IDENTITY_KEY_ID,
        info: X3DH_INFO_PQ_IDENTITY,
        mode: "identity",
      };
    }
  }

  return null;
}

export function bundle_supports_pq(recipient_bundle: PrekeyBundle): boolean {
  return select_pq_encapsulation_target(recipient_bundle) !== null;
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

  const pq_target = select_pq_encapsulation_target(recipient_bundle);

  if (pq_target) {
    const encap = ml_kem768.encapsulate(pq_target.public_key);
    const pq_ss = encap.sharedSecret;

    try {
      shared_secret = await kdf_x3dh([dh1, dh2, dh3, pq_ss], pq_target.info);
    } finally {
      pq_ss.fill(0);
    }

    pq_ciphertext = encap.cipherText;
    pq_key_id = pq_target.key_id;
  } else {
    shared_secret = await kdf_x3dh([dh1, dh2, dh3], X3DH_INFO_CLASSICAL);
  }

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);

  const result: X3dhSenderResult = {
    shared_secret,
    ephemeral_public_key: ephemeral.public_key_raw,
    pq_mode: pq_target ? pq_target.mode : "none",
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
  pq_identity_secret_base64?: string | null,
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
    const from_identity = pq_input.pq_key_id === PQ_IDENTITY_KEY_ID;

    const pq_sk = from_identity
      ? pq_identity_secret_base64
        ? base64_to_array(pq_identity_secret_base64)
        : null
      : await load_pq_secret(pq_input.pq_key_id);

    if (!pq_sk) {
      dh1.fill(0);
      dh2.fill(0);
      dh3.fill(0);

      if (from_identity) {
        throw new Error("Missing PQ identity secret for the PQ bootstrap");
      }

      import("./pq_secret_reconciler")
        .then((m) => m.handle_missing_pq_secret())
        .catch((caught) => ignore_error("services/crypto/x3dh:perform_x3dh_receiver", caught));
      throw new Error("Missing PQ prekey secret for the supplied key id");
    }

    let pq_ss: Uint8Array;

    try {
      pq_ss = ml_kem768.decapsulate(pq_input.pq_ciphertext, pq_sk);
    } finally {
      pq_sk.fill(0);
    }

    try {
      shared_secret = await kdf_x3dh(
        [dh1, dh2, dh3, pq_ss],
        from_identity ? X3DH_INFO_PQ_IDENTITY : X3DH_INFO_PQ,
      );
    } finally {
      pq_ss.fill(0);
    }

    // The one-time prekey is already marked used server-side on hand-out, so it
    // is never re-issued. We intentionally retain the recipient's own secret
    // (local + encrypted server backup) so the message stays decryptable on
    // re-render and on other signed-in devices instead of failing once the
    // bootstrap secret would otherwise be destroyed. Stale secrets are pruned
    // by retention, not eagerly here.
  } else {
    shared_secret = await kdf_x3dh([dh1, dh2, dh3], X3DH_INFO_CLASSICAL);
  }

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);

  return shared_secret;
}

export type { PrekeyBundle, X3dhSenderResult, PqPrekey, PqReceiverInput };
