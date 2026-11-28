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
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64, base64_to_array } from "./base64";
import { encode_fields, encode_u32 } from "./handshake_encoding";
import {
  import_ke_public_key,
  import_ke_private_key,
  compute_agreement_bits,
} from "./key_manager";
import { load_pq_secret, refuse_used_pq_prekey } from "./pq_prekey_store";
import { judge_one_time_prekey_offer } from "./one_time_prekey_watch";
import { complete_p256_private_jwk } from "./p256_jwk";
import {
  is_pqxdh_transcript_binding_enabled,
  is_signed_ratchet_keys_required,
} from "./crypto_enforcement_policy";
import { base64url_decode } from "./address_sender_identity";

import { ignore_error } from "@/lib/ignore_error";

const ECDH_ALGORITHM = "ECDH";
const ECDH_CURVE = "P-256";
const X3DH_SALT = new Uint8Array(32);
const TRANSCRIPT_LABEL = "aster/handshake/transcript/v5";
const ONE_TIME_PREKEY_SIGNATURE_LABEL = "aster/handshake/one-time-prekey/v5";
const ML_KEM_768_DK_PKE_LEN = 1152;

export const X3DH_VERSION_LEGACY = 1;
export const X3DH_VERSION_TRANSCRIPT_BOUND = 2;
export const X3DH_VERSION_KEY_BOUND = 3;
export const X3DH_VERSION_ONE_TIME_BOUND = 4;
export const X3DH_VERSION_ACCOUNT_BOUND = 5;
export const X3DH_VERSION_MAX = X3DH_VERSION_KEY_BOUND;
export const X3DH_READ_VERSION_MAX = X3DH_VERSION_ACCOUNT_BOUND;

export const PQ_IDENTITY_KEY_ID = -1;
export const ML_KEM_768_EK_LEN = 1184;
export const P256_RAW_PUBLIC_KEY_LEN = 65;
export const ONE_TIME_PREKEY_ID_MAX = 0x7fffffff;
export const SIGNED_PREKEY_ID_BYTES = 8;

export type PqBootstrapMode = "onetime" | "identity" | "none";

type TranscriptField = keyof ReturnType<typeof transcript_fields>;

function info(version: number, mode: PqBootstrapMode): Uint8Array {
  const lane = { none: "X3DH", onetime: "PQXDH", identity: "PQXDH_identity" };

  return text(`Aster Mail_${lane[mode]}_v${version}`);
}

function handshake_spec(framed: boolean, fields: string, required = "") {
  const split = (names: string) =>
    names.split(" ").filter(Boolean) as TranscriptField[];

  return { framed, fields: split(fields), required: split(required) };
}

export const HANDSHAKE_VERSIONS = [
  handshake_spec(false, ""),
  handshake_spec(false, "ik_a ik_b kem_ct"),
  handshake_spec(false, "ik_a ik_b spk ek kem_ct"),
  handshake_spec(
    false,
    "ik_a ik_b spk ek opk opk_id kem_ct",
    "ik_a ik_b spk opk opk_id",
  ),
  handshake_spec(
    true,
    "label version ifp_a ifp_b ik_a ik_b spk ek opk_id opk pq_ik_hash pq_opk_id pq_opk_hash kem_ct_hash",
    "ifp_a ifp_b ik_a ik_b spk",
  ),
];

export type OneTimePrekeyKind = "ec" | "pq";

interface PqPrekey {
  key_id: number;
  public_key: string;
  signature?: string | null;
}

type EcOneTimePrekey = PqPrekey;

interface X3dhSenderResult {
  shared_secret: Uint8Array;
  ephemeral_public_key: Uint8Array;
  pq_ciphertext?: Uint8Array;
  pq_key_id?: number;
  pq_mode: PqBootstrapMode;
  x3dh_version: number;
  one_time_prekey_id?: number;
  signed_prekey_id?: string;
  one_time_prekey_missing?: boolean;
  one_time_prekey_withheld?: boolean;
  session_binding?: Uint8Array;
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
  address_scoped?: boolean | null;
  signing_public_key?: string | null;
  account_signature?: string | null;
}

interface PqReceiverInput {
  pq_ciphertext: Uint8Array;
  pq_key_id: number;
}

export interface HandshakeBinding {
  initiator_fingerprint: Uint8Array;
  responder_fingerprint: Uint8Array;
  responder_pq_identity?: Uint8Array | null;
}

interface HandshakeSecret {
  shared_secret: Uint8Array;
  session_binding: Uint8Array | null;
}

export const HANDSHAKE_DOWNGRADE_ERROR =
  "Recipient no longer offers the account bound handshake";

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function generate_ephemeral_keypair(): Promise<{
  secret_key: CryptoKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: ECDH_ALGORITHM, namedCurve: ECDH_CURVE },
    false,
    ["deriveBits"],
  );

  return {
    secret_key: keypair.privateKey,
    public_key_raw: new Uint8Array(
      await crypto.subtle.exportKey("raw", keypair.publicKey),
    ),
  };
}

function jwk_to_raw_public(private_jwk: JsonWebKey): Uint8Array | null {
  const jwk = complete_p256_private_jwk(private_jwk);

  if (!jwk.x || !jwk.y) return null;

  const x = base64url_decode(jwk.x);
  const y = base64url_decode(jwk.y);

  if (x.length !== 32 || y.length !== 32) return null;

  const raw = new Uint8Array(65);

  raw[0] = 0x04;
  raw.set(x, 1);
  raw.set(y, 33);

  return raw;
}

interface TranscriptInput {
  ik_a: Uint8Array | null;
  ik_b: Uint8Array | null;
  spk: Uint8Array | null;
  ek: Uint8Array;
  opk: Uint8Array | null;
  opk_id: number | null;
  kem_ct: Uint8Array | null;
  pq_public: Uint8Array | null;
  pq_key_id: number | null;
  binding: HandshakeBinding | null;
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

  return encode_u32(key_id);
}

export async function compute_signed_prekey_id(
  signed_prekey_raw: Uint8Array,
): Promise<string> {
  return Array.from(sha256(signed_prekey_raw).slice(0, SIGNED_PREKEY_ID_BYTES))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signed_prekey_id_from_private_jwk(
  signed_prekey_jwk: JsonWebKey,
): Promise<string | null> {
  const raw = jwk_to_raw_public(signed_prekey_jwk);

  return raw ? compute_signed_prekey_id(raw) : null;
}

function hash_or_null(value: Uint8Array | null | undefined): Uint8Array | null {
  return value ? sha256(value) : null;
}

function transcript_fields(version: number, input: TranscriptInput) {
  const pq_one_time =
    input.pq_public !== null &&
    input.pq_key_id !== null &&
    input.pq_key_id !== PQ_IDENTITY_KEY_ID;

  return {
    label: text(TRANSCRIPT_LABEL),
    version: Uint8Array.of(version),
    ifp_a: input.binding?.initiator_fingerprint ?? null,
    ifp_b: input.binding?.responder_fingerprint ?? null,
    ik_a: input.ik_a,
    ik_b: input.ik_b,
    spk: input.spk,
    ek: input.ek,
    opk_id:
      input.opk_id !== null ? encode_one_time_prekey_id(input.opk_id) : null,
    opk: input.opk,
    pq_ik_hash: hash_or_null(input.binding?.responder_pq_identity),
    pq_opk_id: pq_one_time ? encode_u32(input.pq_key_id ?? 0) : null,
    pq_opk_hash: pq_one_time ? hash_or_null(input.pq_public) : null,
    kem_ct: input.kem_ct,
    kem_ct_hash: hash_or_null(input.kem_ct),
  };
}

async function derive_handshake_secret(
  version: number,
  mode: PqBootstrapMode,
  dh_outputs: (Uint8Array | null)[],
  pq_ss: Uint8Array | null,
  input: TranscriptInput,
): Promise<HandshakeSecret> {
  const spec = HANDSHAKE_VERSIONS[version - 1];
  const values = transcript_fields(version, input);

  if (spec.required.some((field) => !values[field]?.length)) {
    throw new Error("Incomplete handshake transcript");
  }

  const fields = spec.fields.map((field) => values[field]);
  const transcript = encode_fields(fields);
  const ikm = spec.framed
    ? encode_fields([...dh_outputs, pq_ss, transcript])
    : Uint8Array.from(
        [...dh_outputs, pq_ss, ...fields].flatMap((part) =>
          part ? Array.from(part) : [],
        ),
      );

  try {
    return {
      shared_secret: hkdf(sha256, ikm, X3DH_SALT, info(version, mode), 32),
      session_binding: spec.framed ? sha256(transcript) : null,
    };
  } finally {
    ikm.fill(0);
  }
}

export function one_time_prekey_digest(
  kind: OneTimePrekeyKind,
  key_id: number,
  public_key: Uint8Array,
): Uint8Array {
  return sha256(
    encode_fields([
      text(ONE_TIME_PREKEY_SIGNATURE_LABEL),
      Uint8Array.of(kind === "ec" ? 1 : 2),
      encode_u32(key_id),
      public_key,
    ]),
  );
}

export function is_one_time_prekey_signed(
  bundle: PrekeyBundle,
  kind: OneTimePrekeyKind,
): boolean {
  const prekey = kind === "ec" ? bundle.ec_one_time_prekey : bundle.pq_prekey;

  if (!bundle.signing_public_key || !prekey?.signature) return false;

  try {
    return p256.verify(
      base64_to_array(prekey.signature),
      one_time_prekey_digest(
        kind,
        prekey.key_id,
        base64_to_array(prekey.public_key),
      ),
      base64_to_array(bundle.signing_public_key),
      { lowS: true, prehash: false },
    );
  } catch {
    return false;
  }
}

export function bundle_advertises_account_binding(
  bundle: PrekeyBundle,
): boolean {
  return (
    typeof bundle.x3dh_max_version === "number" &&
    bundle.x3dh_max_version >= X3DH_VERSION_ACCOUNT_BOUND &&
    Boolean(bundle.signing_public_key)
  );
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
    bounded_x3dh_version(remembered, X3DH_VERSION_MAX),
    minimum_x3dh_version(),
  );
}

export function minimum_x3dh_version(): number {
  return is_signed_ratchet_keys_required()
    ? X3DH_VERSION_MAX
    : X3DH_VERSION_LEGACY;
}

function receiver_x3dh_version(
  requested: number | undefined,
  receiver_identity_raw: Uint8Array | null,
  receiver_signed_prekey_raw: Uint8Array | null,
): number {
  if (
    requested !== undefined &&
    requested >= X3DH_VERSION_KEY_BOUND &&
    requested <= X3DH_READ_VERSION_MAX &&
    Number.isInteger(requested)
  ) {
    if (!receiver_identity_raw || !receiver_signed_prekey_raw) {
      throw new Error("Missing public keys for the key bound handshake");
    }

    return requested;
  }

  return requested === X3DH_VERSION_TRANSCRIPT_BOUND &&
    receiver_identity_raw !== null
    ? X3DH_VERSION_TRANSCRIPT_BOUND
    : X3DH_VERSION_LEGACY;
}

function select_pq_encapsulation_target(
  recipient_bundle: PrekeyBundle,
  require_signed: boolean,
): {
  public_key: Uint8Array;
  key_id: number;
  mode: Exclude<PqBootstrapMode, "none">;
} | null {
  const prekey = recipient_bundle.pq_prekey;

  if (
    prekey &&
    (!require_signed || is_one_time_prekey_signed(recipient_bundle, "pq"))
  ) {
    const onetime = base64_to_array(prekey.public_key);

    if (onetime.length === ML_KEM_768_EK_LEN) {
      return { public_key: onetime, key_id: prekey.key_id, mode: "onetime" };
    }
  }

  return select_pq_identity_key(recipient_bundle);
}

function select_pq_identity_key(recipient_bundle: PrekeyBundle): {
  public_key: Uint8Array;
  key_id: number;
  mode: "identity";
} | null {
  if (!recipient_bundle.pq_kem_public_key) return null;

  const identity = base64_to_array(recipient_bundle.pq_kem_public_key);

  if (identity.length !== ML_KEM_768_EK_LEN) return null;

  return {
    public_key: identity,
    key_id: PQ_IDENTITY_KEY_ID,
    mode: "identity",
  };
}

function select_one_time_prekey(
  recipient_bundle: PrekeyBundle,
  require_signed: boolean,
): {
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

  if (
    !offered ||
    typeof offered.public_key !== "string" ||
    !is_valid_one_time_prekey_id(offered.key_id) ||
    (require_signed && !is_one_time_prekey_signed(recipient_bundle, "ec"))
  ) {
    return null;
  }

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
  return (
    select_one_time_prekey(
      recipient_bundle,
      bundle_advertises_account_binding(recipient_bundle),
    ) !== null
  );
}

export function restrict_bundle_to_signed_pq_key(
  recipient_bundle: PrekeyBundle,
  signature_covers_pq_identity: boolean,
): PrekeyBundle {
  if (
    (!signature_covers_pq_identity && !is_signed_ratchet_keys_required()) ||
    is_one_time_prekey_signed(recipient_bundle, "pq")
  ) {
    return recipient_bundle;
  }

  const { pq_prekey: _unsigned_prekey, ...without_one_time } = recipient_bundle;

  return without_one_time;
}

export function bundle_has_signed_pq_identity(
  recipient_bundle: PrekeyBundle,
  signature_covers_pq_identity: boolean,
): boolean {
  return (
    signature_covers_pq_identity &&
    select_pq_identity_key(recipient_bundle) !== null
  );
}

export function bundle_supports_pq(recipient_bundle: PrekeyBundle): boolean {
  return select_pq_identity_key(recipient_bundle) !== null;
}

function carries_post_quantum_material(
  recipient_bundle: PrekeyBundle,
): boolean {
  return (
    Boolean(recipient_bundle.pq_kem_public_key) ||
    Boolean(recipient_bundle.pq_prekey?.public_key)
  );
}

function carries_usable_one_time_pq_key(
  recipient_bundle: PrekeyBundle,
): boolean {
  if (!recipient_bundle.pq_prekey?.public_key) return false;

  try {
    return (
      base64_to_array(recipient_bundle.pq_prekey.public_key).length ===
      ML_KEM_768_EK_LEN
    );
  } catch {
    return false;
  }
}

export function bundle_is_downgraded(recipient_bundle: PrekeyBundle): boolean {
  if (
    bundle_supports_pq(recipient_bundle) ||
    carries_usable_one_time_pq_key(recipient_bundle)
  ) {
    return false;
  }

  return (
    recipient_bundle.pq_capable === true ||
    carries_post_quantum_material(recipient_bundle)
  );
}

export function signed_bundle_x3dh_floor(
  bundle: PrekeyBundle,
  covers_pq: boolean,
  remembered_version: number | null,
): number | null {
  if (!bundle_has_signed_pq_identity(bundle, covers_pq)) {
    return remembered_version;
  }

  return Math.max(
    remembered_version ?? X3DH_VERSION_LEGACY,
    X3DH_VERSION_TRANSCRIPT_BOUND,
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
  binding?: HandshakeBinding | null,
): Promise<X3dhSenderResult> {
  const recipient_identity_raw = base64_to_array(
    recipient_bundle.kem_identity_key,
  );
  const recipient_signed_prekey_raw = base64_to_array(
    recipient_bundle.signed_prekey,
  );
  const [own_ik_private, ik_public, spk_public] = await Promise.all([
    import_ke_private_key(sender_identity_jwk),
    import_ke_public_key(recipient_identity_raw),
    import_ke_public_key(recipient_signed_prekey_raw),
  ]);

  const sender_identity_raw = jwk_to_raw_public(sender_identity_jwk);

  const binding_enabled =
    is_pqxdh_transcript_binding_enabled() && sender_identity_raw !== null;
  const account_bound =
    binding_enabled && bundle_advertises_account_binding(recipient_bundle);

  if (
    !account_bound &&
    (remembered_x3dh_version ?? 0) >= X3DH_VERSION_ACCOUNT_BOUND
  ) {
    throw new Error(HANDSHAKE_DOWNGRADE_ERROR);
  }

  if (account_bound && !binding) {
    throw new Error("Missing account binding for the handshake");
  }

  let one_time_target = binding_enabled
    ? select_one_time_prekey(recipient_bundle, account_bound)
    : null;
  let one_time_public: CryptoKey | null = null;

  if (one_time_target) {
    try {
      one_time_public = await import_ke_public_key(one_time_target.public_key);
    } catch {
      one_time_target = null;
    }
  }

  const one_time_verdict = binding_enabled
    ? await judge_one_time_prekey_offer(
        recipient_identity_raw,
        one_time_public !== null,
      )
    : "never_offered";

  const ephemeral = await generate_ephemeral_keypair();

  const [dh1, dh2, dh3] = await Promise.all([
    compute_agreement_bits(own_ik_private, spk_public),
    compute_agreement_bits(ephemeral.secret_key, ik_public),
    compute_agreement_bits(ephemeral.secret_key, spk_public),
  ]);

  const pq_target = select_pq_encapsulation_target(
    recipient_bundle,
    account_bound,
  );

  let dh4: Uint8Array | null = null;

  if (one_time_target && one_time_public) {
    try {
      dh4 = await compute_agreement_bits(ephemeral.secret_key, one_time_public);
    } catch {
      one_time_target = null;
      dh4 = null;
    }
  }

  const version = account_bound
    ? X3DH_VERSION_ACCOUNT_BOUND
    : one_time_target && dh4
      ? X3DH_VERSION_ONE_TIME_BOUND
      : binding_enabled
        ? negotiate_x3dh_version(
            recipient_bundle.x3dh_max_version,
            remembered_x3dh_version,
          )
        : X3DH_VERSION_LEGACY;

  const encap = pq_target ? ml_kem768.encapsulate(pq_target.public_key) : null;
  let derived: HandshakeSecret;

  try {
    derived = await derive_handshake_secret(
      version,
      pq_target ? pq_target.mode : "none",
      [dh1, dh2, dh3, dh4],
      encap?.sharedSecret ?? null,
      {
        ik_a: sender_identity_raw,
        ik_b: recipient_identity_raw,
        spk: recipient_signed_prekey_raw,
        ek: ephemeral.public_key_raw,
        opk: one_time_target?.public_key ?? null,
        opk_id: one_time_target?.key_id ?? null,
        kem_ct: encap?.cipherText ?? null,
        pq_public: pq_target?.public_key ?? null,
        pq_key_id: pq_target?.key_id ?? null,
        binding: binding
          ? {
              ...binding,
              responder_pq_identity:
                select_pq_identity_key(recipient_bundle)?.public_key ?? null,
            }
          : null,
      },
    );
  } finally {
    for (const dh of [dh1, dh2, dh3, dh4, encap?.sharedSecret]) dh?.fill(0);
  }

  const result: X3dhSenderResult = {
    shared_secret: derived.shared_secret,
    ephemeral_public_key: ephemeral.public_key_raw,
    pq_mode: pq_target ? pq_target.mode : "none",
    x3dh_version: version,
  };

  if (derived.session_binding) result.session_binding = derived.session_binding;

  if (encap && pq_target) {
    result.pq_ciphertext = encap.cipherText;
    result.pq_key_id = pq_target.key_id;
  }

  if (version >= X3DH_VERSION_ONE_TIME_BOUND && one_time_target) {
    result.one_time_prekey_id = one_time_target.key_id;
    result.signed_prekey_id = await compute_signed_prekey_id(
      recipient_signed_prekey_raw,
    );
  }

  if (one_time_verdict === "grace" || one_time_verdict === "withheld") {
    result.one_time_prekey_missing = true;
  }

  if (one_time_verdict === "withheld") result.one_time_prekey_withheld = true;

  return result;
}

const ML_KEM_768_CIPHERTEXT_LEN = 1088;

function is_well_formed_pq_receiver_input(input: PqReceiverInput): boolean {
  const key_id: unknown = input.pq_key_id;
  const id_ok =
    key_id === PQ_IDENTITY_KEY_ID ||
    (typeof key_id === "number" &&
      Number.isSafeInteger(key_id) &&
      key_id >= 0 &&
      key_id <= ONE_TIME_PREKEY_ID_MAX);

  return (
    id_ok &&
    input.pq_ciphertext instanceof Uint8Array &&
    input.pq_ciphertext.length === ML_KEM_768_CIPHERTEXT_LEN
  );
}

export async function perform_x3dh_receiver(
  ...args: Parameters<typeof receive_handshake>
): Promise<Uint8Array> {
  return (await receive_handshake(...args)).shared_secret;
}

export async function receive_handshake(
  receiver_identity_jwk: JsonWebKey,
  receiver_signed_prekey_jwk: JsonWebKey,
  sender_identity_raw: Uint8Array,
  sender_ephemeral_raw: Uint8Array,
  pq_input?: PqReceiverInput | null,
  pq_identity_secret_base64?: string | null,
  x3dh_version?: number,
  one_time_prekey_id?: number,
  binding?: HandshakeBinding | null,
): Promise<HandshakeSecret> {
  if (pq_input && !is_well_formed_pq_receiver_input(pq_input)) {
    throw new Error("Invalid post-quantum handshake input");
  }

  const receiver_identity_raw = jwk_to_raw_public(receiver_identity_jwk);
  const receiver_signed_prekey_raw = jwk_to_raw_public(
    receiver_signed_prekey_jwk,
  );
  const version = receiver_x3dh_version(
    x3dh_version,
    receiver_identity_raw,
    receiver_signed_prekey_raw,
  );
  const account_bound = version === X3DH_VERSION_ACCOUNT_BOUND;

  if (account_bound && !binding) {
    throw new Error("Missing account binding for the handshake");
  }

  let one_time_private: CryptoKey | null = null;
  let one_time_public_raw: Uint8Array | null = null;

  if (
    version === X3DH_VERSION_ONE_TIME_BOUND ||
    (account_bound && one_time_prekey_id !== undefined)
  ) {
    if (!is_valid_one_time_prekey_id(one_time_prekey_id)) {
      throw new Error("Missing one-time prekey id for the one-time handshake");
    }

    const { load_ec_one_time_secret } = await import("./ec_prekey_store");
    const one_time_jwk = await load_ec_one_time_secret(one_time_prekey_id);

    one_time_public_raw = one_time_jwk ? jwk_to_raw_public(one_time_jwk) : null;

    if (!one_time_jwk || !one_time_public_raw) {
      throw new Error("Missing one-time prekey secret for the supplied key id");
    }

    one_time_private = await import_ke_private_key(one_time_jwk);
  }

  const [identity_private, signed_prekey_private, sender_ik, sender_ek] =
    await Promise.all([
      import_ke_private_key(receiver_identity_jwk),
      import_ke_private_key(receiver_signed_prekey_jwk),
      import_ke_public_key(sender_identity_raw),
      import_ke_public_key(sender_ephemeral_raw),
    ]);
  const [dh1, dh2, dh3] = await Promise.all([
    compute_agreement_bits(signed_prekey_private, sender_ik),
    compute_agreement_bits(identity_private, sender_ek),
    compute_agreement_bits(signed_prekey_private, sender_ek),
  ]);

  const dh4 = one_time_private
    ? await compute_agreement_bits(one_time_private, sender_ek)
    : null;
  const from_identity = pq_input?.pq_key_id === PQ_IDENTITY_KEY_ID;
  let pq_ss: Uint8Array | null = null;
  let pq_public: Uint8Array | null = null;

  try {
    if (pq_input) {
      if (
        !from_identity &&
        (await refuse_used_pq_prekey(
          pq_input.pq_key_id,
          array_to_base64(sender_ephemeral_raw),
        ))
      ) {
        throw new Error("One-time PQ prekey was already used");
      }

      const pq_sk = from_identity
        ? pq_identity_secret_base64
          ? base64_to_array(pq_identity_secret_base64)
          : null
        : await load_pq_secret(pq_input.pq_key_id);

      if (!pq_sk) {
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

      try {
        pq_ss = ml_kem768.decapsulate(pq_input.pq_ciphertext, pq_sk);
        pq_public = pq_sk.slice(
          ML_KEM_768_DK_PKE_LEN,
          ML_KEM_768_DK_PKE_LEN + ML_KEM_768_EK_LEN,
        );
      } finally {
        pq_sk.fill(0);
      }
    }

    return await derive_handshake_secret(
      version,
      pq_input ? (from_identity ? "identity" : "onetime") : "none",
      [dh1, dh2, dh3, dh4],
      pq_ss,
      {
        ik_a: sender_identity_raw,
        ik_b: receiver_identity_raw,
        spk: receiver_signed_prekey_raw,
        ek: sender_ephemeral_raw,
        opk: one_time_public_raw,
        opk_id: dh4 ? (one_time_prekey_id ?? null) : null,
        kem_ct: pq_input?.pq_ciphertext ?? null,
        pq_public,
        pq_key_id: pq_input?.pq_key_id ?? null,
        binding: account_bound ? (binding ?? null) : null,
      },
    );
  } finally {
    for (const secret of [dh1, dh2, dh3, dh4, pq_ss]) secret?.fill(0);
  }
}

export { encode_fields, encode_u32 };

export type {
  PrekeyBundle,
  X3dhSenderResult,
  PqPrekey,
  PqReceiverInput,
  EcOneTimePrekey,
};
