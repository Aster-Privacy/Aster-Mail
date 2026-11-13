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

import { base64_to_array } from "./base64";
import {
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "./key_manager";
import { load_pq_secret } from "./pq_prekey_store";
import { complete_p256_private_jwk } from "./p256_jwk";
import { is_pqxdh_transcript_binding_enabled } from "./crypto_enforcement_policy";

import { HASH_ALG } from "@/services/crypto/constants";
import { ignore_error } from "@/lib/ignore_error";

const ECDH_ALGORITHM = "ECDH";
const ECDH_CURVE = "P-256";

const X3DH_INFO_CLASSICAL = new TextEncoder().encode("Aster Mail_X3DH_v1");
const X3DH_INFO_PQ = new TextEncoder().encode("Aster Mail_PQXDH_v1");
const X3DH_INFO_PQ_IDENTITY = new TextEncoder().encode(
  "Aster Mail_PQXDH_identity_v1",
);
const X3DH_INFO_CLASSICAL_V2 = new TextEncoder().encode("Aster Mail_X3DH_v2");
const X3DH_INFO_PQ_V2 = new TextEncoder().encode("Aster Mail_PQXDH_v2");
const X3DH_INFO_PQ_IDENTITY_V2 = new TextEncoder().encode(
  "Aster Mail_PQXDH_identity_v2",
);
const X3DH_INFO_CLASSICAL_V3 = new TextEncoder().encode("Aster Mail_X3DH_v3");
const X3DH_INFO_PQ_V3 = new TextEncoder().encode("Aster Mail_PQXDH_v3");
const X3DH_INFO_PQ_IDENTITY_V3 = new TextEncoder().encode(
  "Aster Mail_PQXDH_identity_v3",
);
const X3DH_INFO_CLASSICAL_V4 = new TextEncoder().encode("Aster Mail_X3DH_v4");
const X3DH_INFO_PQ_V4 = new TextEncoder().encode("Aster Mail_PQXDH_v4");
const X3DH_INFO_PQ_IDENTITY_V4 = new TextEncoder().encode(
  "Aster Mail_PQXDH_identity_v4",
);
const X3DH_SALT = new Uint8Array(32);

export const X3DH_VERSION_LEGACY = 1;
export const X3DH_VERSION_TRANSCRIPT_BOUND = 2;
export const X3DH_VERSION_KEY_BOUND = 3;
export const X3DH_VERSION_ONE_TIME_BOUND = 4;
export const X3DH_VERSION_MAX = X3DH_VERSION_KEY_BOUND;
export const X3DH_READ_VERSION_MAX = X3DH_VERSION_ONE_TIME_BOUND;

export const PQ_IDENTITY_KEY_ID = -1;
export const ML_KEM_768_EK_LEN = 1184;
export const P256_RAW_PUBLIC_KEY_LEN = 65;
export const ONE_TIME_PREKEY_ID_MAX = 0x7fffffff;
export const SIGNED_PREKEY_ID_BYTES = 8;

export type PqBootstrapMode = "onetime" | "identity" | "none";

const X3DH_INFO: Record<
  PqBootstrapMode,
  [Uint8Array, Uint8Array, Uint8Array, Uint8Array]
> = {
  none: [
    X3DH_INFO_CLASSICAL,
    X3DH_INFO_CLASSICAL_V2,
    X3DH_INFO_CLASSICAL_V3,
    X3DH_INFO_CLASSICAL_V4,
  ],
  onetime: [X3DH_INFO_PQ, X3DH_INFO_PQ_V2, X3DH_INFO_PQ_V3, X3DH_INFO_PQ_V4],
  identity: [
    X3DH_INFO_PQ_IDENTITY,
    X3DH_INFO_PQ_IDENTITY_V2,
    X3DH_INFO_PQ_IDENTITY_V3,
    X3DH_INFO_PQ_IDENTITY_V4,
  ],
};

interface PqPrekey {
  key_id: number;
  public_key: string;
}

interface EcOneTimePrekey {
  key_id: number;
  public_key: string;
}

interface X3dhSenderResult {
  shared_secret: Uint8Array;
  ephemeral_public_key: Uint8Array;
  pq_ciphertext?: Uint8Array;
  pq_key_id?: number;
  pq_mode: PqBootstrapMode;
  x3dh_version: number;
  one_time_prekey_id?: number;
  signed_prekey_id?: string;
}

interface PrekeyBundle {
  kem_identity_key: string;
  signed_prekey: string;
  signed_prekey_signature: string;
  one_time_prekey?: string | null;
  pq_prekey?: PqPrekey | null;
  pq_kem_public_key?: string | null;
  x3dh_max_version?: number | null;
  pq_capable?: boolean | null;
  ec_one_time_prekey?: EcOneTimePrekey | null;
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

function base64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function jwk_to_raw_public(private_jwk: JsonWebKey): Uint8Array | null {
  const jwk = complete_p256_private_jwk(private_jwk);

  if (!jwk.x || !jwk.y) return null;

  const x = base64url_to_bytes(jwk.x);
  const y = base64url_to_bytes(jwk.y);

  if (x.length !== 32 || y.length !== 32) return null;

  const raw = new Uint8Array(65);

  raw[0] = 0x04;
  raw.set(x, 1);
  raw.set(y, 33);

  return raw;
}

interface X3dhTranscript {
  initiator_identity: Uint8Array | null;
  responder_identity: Uint8Array | null;
  responder_signed_prekey: Uint8Array | null;
  initiator_ephemeral: Uint8Array;
  kem_ciphertext: Uint8Array | null;
  responder_one_time_prekey?: Uint8Array | null;
  one_time_prekey_id?: number | null;
}

export function is_valid_one_time_prekey_id(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= ONE_TIME_PREKEY_ID_MAX
  );
}

export function encode_one_time_prekey_id(key_id: number): Uint8Array {
  if (!is_valid_one_time_prekey_id(key_id)) {
    throw new Error("Invalid one-time prekey id");
  }

  const encoded = new Uint8Array(4);

  new DataView(encoded.buffer).setUint32(0, key_id, false);

  return encoded;
}

export async function compute_signed_prekey_id(
  signed_prekey_raw: Uint8Array,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", signed_prekey_raw),
  );
  let hex = "";

  for (let i = 0; i < SIGNED_PREKEY_ID_BYTES; i++) {
    hex += digest[i].toString(16).padStart(2, "0");
  }

  return hex;
}

export async function signed_prekey_id_from_private_jwk(
  signed_prekey_jwk: JsonWebKey,
): Promise<string | null> {
  const raw = jwk_to_raw_public(signed_prekey_jwk);

  return raw ? compute_signed_prekey_id(raw) : null;
}

function transcript_inputs(
  version: number,
  transcript: X3dhTranscript,
): Uint8Array[] {
  const inputs: Uint8Array[] = [];

  if (version < X3DH_VERSION_TRANSCRIPT_BOUND) return inputs;

  if (transcript.initiator_identity) inputs.push(transcript.initiator_identity);

  if (transcript.responder_identity) inputs.push(transcript.responder_identity);

  if (version >= X3DH_VERSION_KEY_BOUND) {
    if (transcript.responder_signed_prekey) {
      inputs.push(transcript.responder_signed_prekey);
    }

    inputs.push(transcript.initiator_ephemeral);
  }

  if (version === X3DH_VERSION_ONE_TIME_BOUND) {
    if (
      !transcript.initiator_identity ||
      !transcript.responder_identity ||
      !transcript.responder_signed_prekey ||
      !transcript.responder_one_time_prekey ||
      transcript.responder_one_time_prekey.length !== P256_RAW_PUBLIC_KEY_LEN ||
      !is_valid_one_time_prekey_id(transcript.one_time_prekey_id)
    ) {
      throw new Error("Incomplete transcript for the one-time bound handshake");
    }

    inputs.push(transcript.responder_one_time_prekey);
    inputs.push(encode_one_time_prekey_id(transcript.one_time_prekey_id));
  }

  if (transcript.kem_ciphertext) inputs.push(transcript.kem_ciphertext);

  return inputs;
}

function x3dh_info(version: number, mode: PqBootstrapMode): Uint8Array {
  const [legacy, transcript_bound, key_bound, one_time_bound] = X3DH_INFO[mode];

  if (version === X3DH_VERSION_ONE_TIME_BOUND) return one_time_bound;

  if (version >= X3DH_VERSION_KEY_BOUND) return key_bound;

  if (version === X3DH_VERSION_TRANSCRIPT_BOUND) return transcript_bound;

  return legacy;
}

function bounded_x3dh_version(
  value: number | null | undefined,
  ceiling: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return X3DH_VERSION_LEGACY;
  }

  return Math.min(Math.max(Math.floor(value), X3DH_VERSION_LEGACY), ceiling);
}

export function negotiate_x3dh_version(
  advertised: number | null | undefined,
  remembered: number | null | undefined,
): number {
  return Math.max(
    bounded_x3dh_version(advertised, X3DH_VERSION_MAX),
    bounded_x3dh_version(remembered, X3DH_VERSION_TRANSCRIPT_BOUND),
  );
}

function receiver_x3dh_version(
  requested: number | undefined,
  receiver_identity_raw: Uint8Array | null,
  receiver_signed_prekey_raw: Uint8Array | null,
): number {
  if (requested === X3DH_VERSION_ONE_TIME_BOUND) {
    if (!receiver_identity_raw || !receiver_signed_prekey_raw) {
      throw new Error("Missing public keys for the one-time bound handshake");
    }

    return X3DH_VERSION_ONE_TIME_BOUND;
  }

  if (requested === X3DH_VERSION_KEY_BOUND) {
    if (!receiver_identity_raw || !receiver_signed_prekey_raw) {
      throw new Error("Missing public keys for the key bound handshake");
    }

    return X3DH_VERSION_KEY_BOUND;
  }

  return requested === X3DH_VERSION_TRANSCRIPT_BOUND &&
    receiver_identity_raw !== null
    ? X3DH_VERSION_TRANSCRIPT_BOUND
    : X3DH_VERSION_LEGACY;
}

function select_pq_encapsulation_target(recipient_bundle: PrekeyBundle): {
  public_key: Uint8Array;
  key_id: number;
  mode: Exclude<PqBootstrapMode, "none">;
} | null {
  if (recipient_bundle.pq_prekey) {
    const onetime = base64_to_array(recipient_bundle.pq_prekey.public_key);

    if (onetime.length === ML_KEM_768_EK_LEN) {
      return {
        public_key: onetime,
        key_id: recipient_bundle.pq_prekey.key_id,
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
        mode: "identity",
      };
    }
  }

  return null;
}

function select_one_time_prekey(recipient_bundle: PrekeyBundle): {
  public_key: Uint8Array;
  key_id: number;
} | null {
  const advertised = recipient_bundle.x3dh_max_version;
  const offered = recipient_bundle.ec_one_time_prekey;

  if (
    typeof advertised !== "number" ||
    !Number.isFinite(advertised) ||
    advertised < X3DH_VERSION_ONE_TIME_BOUND
  ) {
    return null;
  }

  if (!offered || typeof offered.public_key !== "string") return null;

  if (!is_valid_one_time_prekey_id(offered.key_id)) return null;

  let public_key: Uint8Array;

  try {
    public_key = base64_to_array(offered.public_key);
  } catch {
    return null;
  }

  if (public_key.length !== P256_RAW_PUBLIC_KEY_LEN || public_key[0] !== 0x04) {
    return null;
  }

  return { public_key, key_id: offered.key_id };
}

export function bundle_offers_one_time_prekey(
  recipient_bundle: PrekeyBundle,
): boolean {
  return select_one_time_prekey(recipient_bundle) !== null;
}

export function restrict_bundle_to_signed_pq_key(
  recipient_bundle: PrekeyBundle,
  signature_covers_pq_identity: boolean,
): PrekeyBundle {
  if (!signature_covers_pq_identity) return recipient_bundle;

  if (!recipient_bundle.pq_prekey || !recipient_bundle.pq_kem_public_key) {
    return recipient_bundle;
  }

  if (
    base64_to_array(recipient_bundle.pq_kem_public_key).length !==
    ML_KEM_768_EK_LEN
  ) {
    return recipient_bundle;
  }

  const { pq_prekey: _unsigned_prekey, ...signed_only } = recipient_bundle;

  return signed_only;
}

export function bundle_has_signed_pq_identity(
  recipient_bundle: PrekeyBundle,
  signature_covers_pq_identity: boolean,
): boolean {
  if (!signature_covers_pq_identity) return false;

  return (
    select_pq_encapsulation_target(
      restrict_bundle_to_signed_pq_key(recipient_bundle, true),
    )?.mode === "identity"
  );
}

export function bundle_supports_pq(recipient_bundle: PrekeyBundle): boolean {
  return select_pq_encapsulation_target(recipient_bundle) !== null;
}

function carries_post_quantum_material(recipient_bundle: PrekeyBundle): boolean {
  return (
    Boolean(recipient_bundle.pq_kem_public_key) ||
    Boolean(recipient_bundle.pq_prekey?.public_key)
  );
}

export function bundle_is_downgraded(recipient_bundle: PrekeyBundle): boolean {
  if (bundle_supports_pq(recipient_bundle)) return false;

  return (
    recipient_bundle.pq_capable === true ||
    carries_post_quantum_material(recipient_bundle)
  );
}

export function bundle_supports_transcript_binding(
  recipient_bundle: PrekeyBundle,
): boolean {
  const advertised = recipient_bundle.x3dh_max_version;

  return (
    typeof advertised === "number" &&
    Number.isFinite(advertised) &&
    advertised >= X3DH_VERSION_TRANSCRIPT_BOUND
  );
}

export async function perform_x3dh_sender(
  sender_identity_jwk: JsonWebKey,
  recipient_bundle: PrekeyBundle,
  remembered_x3dh_version?: number | null,
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

  const sender_identity_raw = jwk_to_raw_public(sender_identity_jwk);

  const binding_enabled =
    is_pqxdh_transcript_binding_enabled() && sender_identity_raw !== null;

  let one_time_target = binding_enabled
    ? select_one_time_prekey(recipient_bundle)
    : null;
  let dh4: Uint8Array | null = null;

  if (one_time_target) {
    try {
      dh4 = await compute_agreement_bits(
        ephemeral.secret_key,
        await import_ke_public_key(one_time_target.public_key),
      );
    } catch {
      one_time_target = null;
      dh4 = null;
    }
  }

  const version =
    one_time_target && dh4
      ? X3DH_VERSION_ONE_TIME_BOUND
      : binding_enabled
        ? negotiate_x3dh_version(
            recipient_bundle.x3dh_max_version,
            remembered_x3dh_version,
          )
        : X3DH_VERSION_LEGACY;

  const classical_outputs = dh4 ? [dh1, dh2, dh3, dh4] : [dh1, dh2, dh3];

  try {
    if (pq_target) {
      const encap = ml_kem768.encapsulate(pq_target.public_key);
      const pq_ss = encap.sharedSecret;

      try {
        shared_secret = await kdf_x3dh(
          [
            ...classical_outputs,
            pq_ss,
            ...transcript_inputs(version, {
              initiator_identity: sender_identity_raw,
              responder_identity: recipient_identity_raw,
              responder_signed_prekey: recipient_signed_prekey_raw,
              initiator_ephemeral: ephemeral.public_key_raw,
              kem_ciphertext: encap.cipherText,
              responder_one_time_prekey: one_time_target?.public_key ?? null,
              one_time_prekey_id: one_time_target?.key_id ?? null,
            }),
          ],
          x3dh_info(version, pq_target.mode),
        );
      } finally {
        pq_ss.fill(0);
      }

      pq_ciphertext = encap.cipherText;
      pq_key_id = pq_target.key_id;
    } else {
      shared_secret = await kdf_x3dh(
        [
          ...classical_outputs,
          ...transcript_inputs(version, {
            initiator_identity: sender_identity_raw,
            responder_identity: recipient_identity_raw,
            responder_signed_prekey: recipient_signed_prekey_raw,
            initiator_ephemeral: ephemeral.public_key_raw,
            kem_ciphertext: null,
            responder_one_time_prekey: one_time_target?.public_key ?? null,
            one_time_prekey_id: one_time_target?.key_id ?? null,
          }),
        ],
        x3dh_info(version, "none"),
      );
    }
  } finally {
    dh1.fill(0);
    dh2.fill(0);
    dh3.fill(0);
    dh4?.fill(0);
  }

  const result: X3dhSenderResult = {
    shared_secret,
    ephemeral_public_key: ephemeral.public_key_raw,
    pq_mode: pq_target ? pq_target.mode : "none",
    x3dh_version: version,
  };

  if (pq_ciphertext !== undefined && pq_key_id !== undefined) {
    result.pq_ciphertext = pq_ciphertext;
    result.pq_key_id = pq_key_id;
  }

  if (version === X3DH_VERSION_ONE_TIME_BOUND && one_time_target) {
    result.one_time_prekey_id = one_time_target.key_id;
    result.signed_prekey_id = await compute_signed_prekey_id(
      recipient_signed_prekey_raw,
    );
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
  x3dh_version?: number,
  one_time_prekey_id?: number,
): Promise<Uint8Array> {
  const receiver_identity_raw = jwk_to_raw_public(receiver_identity_jwk);
  const receiver_signed_prekey_raw = jwk_to_raw_public(
    receiver_signed_prekey_jwk,
  );
  const version = receiver_x3dh_version(
    x3dh_version,
    receiver_identity_raw,
    receiver_signed_prekey_raw,
  );

  let one_time_private: CryptoKey | null = null;
  let one_time_public_raw: Uint8Array | null = null;

  if (version === X3DH_VERSION_ONE_TIME_BOUND) {
    if (!is_valid_one_time_prekey_id(one_time_prekey_id)) {
      throw new Error("Missing one-time prekey id for the one-time handshake");
    }

    const { load_ec_one_time_secret } = await import("./ec_prekey_store");
    const one_time_jwk = await load_ec_one_time_secret(one_time_prekey_id);

    if (!one_time_jwk) {
      throw new Error("Missing one-time prekey secret for the supplied key id");
    }

    one_time_public_raw = jwk_to_raw_public(one_time_jwk);

    if (!one_time_public_raw) {
      throw new Error("Missing one-time prekey secret for the supplied key id");
    }

    one_time_private = await import_ke_private_key(one_time_jwk);
  }

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

  const dh4 = one_time_private
    ? await compute_agreement_bits(one_time_private, sender_ephemeral_public)
    : null;
  const classical_outputs = dh4 ? [dh1, dh2, dh3, dh4] : [dh1, dh2, dh3];
  const one_time_transcript = {
    responder_one_time_prekey: one_time_public_raw,
    one_time_prekey_id: dh4 ? (one_time_prekey_id ?? null) : null,
  };

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
      dh4?.fill(0);

      if (from_identity) {
        throw new Error("Missing PQ identity secret for the PQ bootstrap");
      }

      import("./pq_secret_reconciler")
        .then((m) => m.handle_missing_pq_secret(pq_input.pq_key_id))
        .catch((caught) =>
          ignore_error("services/crypto/x3dh:perform_x3dh_receiver", caught),
        );
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
        [
          ...classical_outputs,
          pq_ss,
          ...transcript_inputs(version, {
            initiator_identity: sender_identity_raw,
            responder_identity: receiver_identity_raw,
            responder_signed_prekey: receiver_signed_prekey_raw,
            initiator_ephemeral: sender_ephemeral_raw,
            kem_ciphertext: pq_input.pq_ciphertext,
            ...one_time_transcript,
          }),
        ],
        x3dh_info(version, from_identity ? "identity" : "onetime"),
      );
    } finally {
      pq_ss.fill(0);
    }
  } else {
    shared_secret = await kdf_x3dh(
      [
        ...classical_outputs,
        ...transcript_inputs(version, {
          initiator_identity: sender_identity_raw,
          responder_identity: receiver_identity_raw,
          responder_signed_prekey: receiver_signed_prekey_raw,
          initiator_ephemeral: sender_ephemeral_raw,
          kem_ciphertext: null,
          ...one_time_transcript,
        }),
      ],
      x3dh_info(version, "none"),
    );
  }

  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);
  dh4?.fill(0);

  return shared_secret;
}

export type {
  PrekeyBundle,
  X3dhSenderResult,
  PqPrekey,
  PqReceiverInput,
  EcOneTimePrekey,
};
