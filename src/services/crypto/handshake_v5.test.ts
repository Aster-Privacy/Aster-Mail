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
import { writeFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import vectors from "../../../docs/protocol/handshake_v5_vectors.json";

const OPK_D = "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw";

vi.mock("./crypto_enforcement_policy", async (import_original) => ({
  ...(await import_original<typeof import("./crypto_enforcement_policy")>()),
  is_pqxdh_transcript_binding_enabled: () => true,
}));

vi.mock("./one_time_prekey_watch", () => ({
  judge_one_time_prekey_offer: vi.fn(async () => "never_offered"),
}));

vi.mock("./pq_secret_reconciler", () => ({
  handle_missing_pq_secret: vi.fn(async () => {}),
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(),
  encrypted_set: vi.fn(),
  encrypted_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./pq_prekey_store", async () => {
  const { ml_kem768: kem } = await import("@noble/post-quantum/ml-kem.js");
  const keypair = kem.keygen(
    new Uint8Array(64).map((_, i) => (i * 13 + 5) & 0xff),
  );

  return {
    load_pq_secret: vi.fn(async () => new Uint8Array(keypair.secretKey)),
    refuse_used_pq_prekey: vi.fn(async () => false),
  };
});

vi.mock("./ec_prekey_store", () => ({
  load_ec_one_time_secret: vi.fn(async () => ({
    kty: "EC",
    crv: "P-256",
    d: "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw",
  })),
}));

import { encode_fields, encode_ratchet_header_ad } from "./handshake_encoding";
import {
  HANDSHAKE_DOWNGRADE_ERROR,
  is_one_time_prekey_signed,
  one_time_prekey_digest,
  perform_x3dh_sender,
  receive_handshake,
  PQ_IDENTITY_KEY_ID,
  X3DH_VERSION_ACCOUNT_BOUND,
  X3DH_VERSION_ONE_TIME_BOUND,
  type HandshakeBinding,
  type PrekeyBundle,
} from "./x3dh";
import {
  derive_bundle_signing_key,
  sign_one_time_prekey,
} from "./handshake_keys/bundle_signing";
import { DoubleRatchet, generate_keypair } from "./double_ratchet";

const KEM_SEED = new Uint8Array(64).map((_, i) => (i * 13 + 5) & 0xff);
const KEM_RANDOMNESS = new Uint8Array(32).map((_, i) => (i * 17 + 9) & 0xff);
const RECEIVER_IDENTITY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  d: "S-TtOFuUV4kV3U_6iwvv7w_2FsCMvB2JJAP2qEHWENc",
  x: "pV5xYiD-maXwHlWFdNcTXU29RbWx7B2M-emR-q5SWkg",
  y: "49TZk81Zt_rBFqwpi_u3egcVqAoeqoAMliPxQTxFxC4",
};
const RECEIVER_SIGNED_PREKEY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  d: "_964242B7JrwBFGRDZSqeWB-34nP1X8JeFrM_kcb2h8",
  x: "PbTXUe1njdNErFScycKZY__RMrTM8lnPkIK8XPmMjRg",
  y: "IgTYHpcXHehrOpf9cUy8sk9Pl6Xi4-JuPtkA-ZiK1Cc",
};
const SENDER_IDENTITY_RAW_B64 =
  "BN8n2kbWCqaAzmq3WZqLmpl2H7G6DM2o8LP4z0ZA6DWEkVAiEcrDMyM/SF0M6g4KvkIGKE52GkieLoXBCXfcGbs=";
const SENDER_EPHEMERAL_RAW_B64 =
  "BDfQMwe0A3dW5WScHDZPToNk67qpP/VdQspfEd1zHZwW/IoCDYVRxpWBUF92xIgp85tfr76G3fgbq6w1F8NtXjw=";
const ONE_TIME_PREKEY_ID = 0x01020304;
const PQ_PREKEY_ID = 7;
const INITIATOR_FINGERPRINT = new Uint8Array(20).fill(0xa1);
const RESPONDER_FINGERPRINT = new Uint8Array(20).fill(0xb2);

type Mode = "none" | "identity" | "onetime";

function from_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function from_base64url(value: string): Uint8Array {
  return from_base64(
    value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (value.length % 4)) % 4),
  );
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);

  new DataView(out.buffer).setUint32(0, value, false);

  return out;
}

function raw_public(jwk: JsonWebKey): Uint8Array {
  return p256.getPublicKey(from_base64url(jwk.d ?? ""), false);
}

function ecdh(private_d: string, public_raw: Uint8Array): Uint8Array {
  return p256
    .getSharedSecret(from_base64url(private_d), public_raw, true)
    .slice(1);
}

const kem_keypair = ml_kem768.keygen(KEM_SEED);
const kem = ml_kem768.encapsulate(kem_keypair.publicKey, KEM_RANDOMNESS);
const opk_public = p256.getPublicKey(from_base64url(OPK_D), false);

function receiver_binding(
  initiator: Uint8Array = INITIATOR_FINGERPRINT,
): HandshakeBinding {
  return {
    initiator_fingerprint: initiator,
    responder_fingerprint: RESPONDER_FINGERPRINT,
    responder_pq_identity: kem_keypair.publicKey,
  };
}

function pq_input(mode: Mode) {
  if (mode === "none") return null;

  return {
    pq_ciphertext: kem.cipherText,
    pq_key_id: mode === "identity" ? PQ_IDENTITY_KEY_ID : PQ_PREKEY_ID,
  };
}

async function receive_v5(
  mode: Mode,
  with_opk: boolean,
  initiator?: Uint8Array,
) {
  return receive_handshake(
    RECEIVER_IDENTITY_JWK,
    RECEIVER_SIGNED_PREKEY_JWK,
    from_base64(SENDER_IDENTITY_RAW_B64),
    from_base64(SENDER_EPHEMERAL_RAW_B64),
    pq_input(mode),
    mode === "identity" ? to_base64(kem_keypair.secretKey) : null,
    X3DH_VERSION_ACCOUNT_BOUND,
    with_opk ? ONE_TIME_PREKEY_ID : undefined,
    receiver_binding(initiator),
  );
}

function spec_transcript(mode: Mode, with_opk: boolean): Uint8Array {
  const onetime = mode === "onetime";

  return encode_fields([
    new TextEncoder().encode("aster/handshake/transcript/v5"),
    Uint8Array.of(5),
    INITIATOR_FINGERPRINT,
    RESPONDER_FINGERPRINT,
    from_base64(SENDER_IDENTITY_RAW_B64),
    raw_public(RECEIVER_IDENTITY_JWK),
    raw_public(RECEIVER_SIGNED_PREKEY_JWK),
    from_base64(SENDER_EPHEMERAL_RAW_B64),
    with_opk ? u32(ONE_TIME_PREKEY_ID) : null,
    with_opk ? opk_public : null,
    sha256(kem_keypair.publicKey),
    onetime ? u32(PQ_PREKEY_ID) : null,
    onetime ? sha256(kem_keypair.publicKey) : null,
    mode === "none" ? null : sha256(kem.cipherText),
  ]);
}

function spec_secret(mode: Mode, with_opk: boolean, transcript: Uint8Array) {
  const ik_a = from_base64(SENDER_IDENTITY_RAW_B64);
  const ek = from_base64(SENDER_EPHEMERAL_RAW_B64);
  const ikm = encode_fields([
    ecdh(RECEIVER_SIGNED_PREKEY_JWK.d ?? "", ik_a),
    ecdh(RECEIVER_IDENTITY_JWK.d ?? "", ek),
    ecdh(RECEIVER_SIGNED_PREKEY_JWK.d ?? "", ek),
    with_opk ? ecdh(OPK_D, ek) : null,
    mode === "none" ? null : kem.sharedSecret,
    transcript,
  ]);
  const lane = { none: "X3DH", onetime: "PQXDH", identity: "PQXDH_identity" };

  return hkdf(
    sha256,
    ikm,
    new Uint8Array(32),
    new TextEncoder().encode(`Aster Mail_${lane[mode]}_v5`),
    32,
  );
}

const CASES: { mode: Mode; with_opk: boolean }[] = [
  { mode: "none", with_opk: false },
  { mode: "none", with_opk: true },
  { mode: "identity", with_opk: true },
  { mode: "onetime", with_opk: true },
];

const SIGNING_KEY = derive_bundle_signing_key(
  JSON.stringify(RECEIVER_IDENTITY_JWK),
);

function signed_opk_vector() {
  if (!SIGNING_KEY) throw new Error("signing key");

  const signature = sign_one_time_prekey(
    SIGNING_KEY,
    "ec",
    ONE_TIME_PREKEY_ID,
    to_base64(opk_public),
  );
  const forged = from_base64(signature);

  forged[forged.length - 1] ^= 0x01;

  return {
    signing_public_key: SIGNING_KEY.public_key,
    kind: "ec",
    key_id: ONE_TIME_PREKEY_ID,
    public_key: to_base64(opk_public),
    digest: to_hex(
      one_time_prekey_digest("ec", ONE_TIME_PREKEY_ID, opk_public),
    ),
    signature,
    forged_signature: to_base64(forged),
  };
}

const HEADER = {
  dh_public: to_base64(raw_public(RECEIVER_SIGNED_PREKEY_JWK)),
  previous_chain_length: 3,
  message_number: 9,
};
const SESSION_BINDING = to_base64(sha256(new Uint8Array([1, 2, 3])));

async function compute_v5() {
  const out = [];

  for (const { mode, with_opk } of CASES) {
    const transcript = spec_transcript(mode, with_opk);
    const derived = await receive_v5(mode, with_opk);

    out.push({
      mode,
      one_time_prekey: with_opk,
      transcript: to_hex(transcript),
      session_binding: to_hex(derived.session_binding ?? new Uint8Array()),
      expected_output: to_hex(derived.shared_secret),
    });
  }

  return out;
}

async function compute_negative() {
  const wrong = new Uint8Array(INITIATOR_FINGERPRINT);

  wrong[0] ^= 0xff;

  const header_v3 = { ...HEADER, v: 3, sb: SESSION_BINDING };

  return {
    one_time_prekey_signature: signed_opk_vector(),
    wrong_account_fingerprint: {
      initiator_fingerprint: to_hex(wrong),
      expected_output: to_hex((await receive_v5("none", false, wrong)).shared_secret),
    },
    header_ad: {
      header: header_v3,
      ad_v3: to_hex(encode_ratchet_header_ad(header_v3) ?? new Uint8Array()),
      ad_v2: to_hex(
        encode_ratchet_header_ad({ ...HEADER, v: 2 }) ?? new Uint8Array(),
      ),
      tampered_header: { ...header_v3, message_number: 10 },
    },
    downgrade: {
      remembered_x3dh_version: 5,
      bundle_x3dh_max_version: 4,
      error: HANDSHAKE_DOWNGRADE_ERROR,
    },
  };
}

async function exportable_identity(): Promise<JsonWebKey> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  return crypto.subtle.exportKey("jwk", pair.privateKey);
}

function account_bundle(signature?: string | null): PrekeyBundle {
  return {
    kem_identity_key: to_base64(raw_public(RECEIVER_IDENTITY_JWK)),
    signed_prekey: to_base64(raw_public(RECEIVER_SIGNED_PREKEY_JWK)),
    signed_prekey_signature: "",
    pq_kem_public_key: to_base64(kem_keypair.publicKey),
    x3dh_max_version: X3DH_VERSION_ACCOUNT_BOUND,
    signing_public_key: SIGNING_KEY?.public_key ?? null,
    ec_one_time_prekey: {
      key_id: ONE_TIME_PREKEY_ID,
      public_key: to_base64(opk_public),
      signature,
    },
  };
}

const SENDER_BINDING: HandshakeBinding = {
  initiator_fingerprint: INITIATOR_FINGERPRINT,
  responder_fingerprint: RESPONDER_FINGERPRINT,
};

async function sender_and_receiver(bundle: PrekeyBundle, remembered?: number) {
  const sender_jwk = await exportable_identity();
  const sent = await perform_x3dh_sender(
    sender_jwk,
    bundle,
    remembered ?? null,
    SENDER_BINDING,
  );
  const received = await receive_handshake(
    RECEIVER_IDENTITY_JWK,
    RECEIVER_SIGNED_PREKEY_JWK,
    raw_public(sender_jwk),
    sent.ephemeral_public_key,
    sent.pq_ciphertext
      ? { pq_ciphertext: sent.pq_ciphertext, pq_key_id: sent.pq_key_id ?? 0 }
      : null,
    to_base64(kem_keypair.secretKey),
    sent.x3dh_version,
    sent.one_time_prekey_id,
    sent.x3dh_version >= X3DH_VERSION_ACCOUNT_BOUND ? receiver_binding() : null,
  );

  return { sent, received };
}

describe("handshake v5 conformance vectors", () => {
  it("matches the published v5 vectors and the spec encoding", async () => {
    const v5 = await compute_v5();
    const negative = await compute_negative();
    const out_path = process.env.HANDSHAKE_V5_VECTORS_OUT;

    if (out_path) {
      writeFileSync(
        out_path,
        JSON.stringify({ ...vectors, v5, negative }, null, 2),
      );
    }

    for (const entry of v5) {
      expect(entry.session_binding).toBe(
        to_hex(sha256(Uint8Array.from(Buffer.from(entry.transcript, "hex")))),
      );
    }

    CASES.forEach(({ mode, with_opk }, index) => {
      expect(v5[index].expected_output).toBe(
        to_hex(spec_secret(mode, with_opk, spec_transcript(mode, with_opk))),
      );
    });

    expect({ v5, negative }).toEqual({
      v5: (vectors as { v5?: unknown }).v5,
      negative: (vectors as { negative?: unknown }).negative,
    });
  });

  it("rejects a forged one-time prekey signature vector", () => {
    const vector = signed_opk_vector();
    const bundle = (signature: string): PrekeyBundle => ({
      kem_identity_key: "",
      signed_prekey: "",
      signed_prekey_signature: "",
      signing_public_key: vector.signing_public_key,
      ec_one_time_prekey: {
        key_id: vector.key_id,
        public_key: vector.public_key,
        signature,
      },
    });

    expect(is_one_time_prekey_signed(bundle(vector.signature), "ec")).toBe(
      true,
    );
    expect(
      is_one_time_prekey_signed(bundle(vector.forged_signature), "ec"),
    ).toBe(false);
  });

  it("derives a different secret for a wrong account fingerprint", async () => {
    const right = await receive_v5("none", false);
    const wrong = await receive_v5(
      "none",
      false,
      new Uint8Array(20).fill(0x5e),
    );

    expect(to_hex(wrong.shared_secret)).not.toBe(to_hex(right.shared_secret));
    expect(to_hex(wrong.session_binding ?? new Uint8Array())).not.toBe(
      to_hex(right.session_binding ?? new Uint8Array()),
    );
  });

  it("refuses an account bound handshake without a binding", async () => {
    await expect(
      receive_handshake(
        RECEIVER_IDENTITY_JWK,
        RECEIVER_SIGNED_PREKEY_JWK,
        from_base64(SENDER_IDENTITY_RAW_B64),
        from_base64(SENDER_EPHEMERAL_RAW_B64),
        null,
        null,
        X3DH_VERSION_ACCOUNT_BOUND,
      ),
    ).rejects.toThrow(/account binding/);
  });
});

describe("handshake v5 negotiation", () => {
  it("runs v5 between two v5 clients with a signed one-time prekey", async () => {
    if (!SIGNING_KEY) throw new Error("signing key");

    const signature = sign_one_time_prekey(
      SIGNING_KEY,
      "ec",
      ONE_TIME_PREKEY_ID,
      to_base64(opk_public),
    );
    const { sent, received } = await sender_and_receiver(
      account_bundle(signature),
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ACCOUNT_BOUND);
    expect(sent.one_time_prekey_id).toBe(ONE_TIME_PREKEY_ID);
    expect(to_hex(sent.shared_secret)).toBe(to_hex(received.shared_secret));
    expect(to_hex(sent.session_binding ?? new Uint8Array())).toBe(
      to_hex(received.session_binding ?? new Uint8Array()),
    );
  });

  it("skips an unsigned one-time prekey at v5", async () => {
    const { sent, received } = await sender_and_receiver(account_bundle(null));

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ACCOUNT_BOUND);
    expect(sent.one_time_prekey_id).toBeUndefined();
    expect(to_hex(sent.shared_secret)).toBe(to_hex(received.shared_secret));
  });

  it("skips a forged one-time prekey at v5", async () => {
    const { sent } = await sender_and_receiver(
      account_bundle(signed_opk_vector().forged_signature),
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ACCOUNT_BOUND);
    expect(sent.one_time_prekey_id).toBeUndefined();
  });

  it("falls back to v4 for a recipient that does not advertise v5", async () => {
    const bundle: PrekeyBundle = {
      ...account_bundle(null),
      x3dh_max_version: X3DH_VERSION_ONE_TIME_BOUND,
      signing_public_key: null,
    };
    const { sent, received } = await sender_and_receiver(bundle);

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(sent.session_binding).toBeUndefined();
    expect(received.session_binding).toBeNull();
    expect(to_hex(sent.shared_secret)).toBe(to_hex(received.shared_secret));
  });

  it("refuses a downgrade once a contact has used v5", async () => {
    const bundle: PrekeyBundle = {
      ...account_bundle(null),
      x3dh_max_version: X3DH_VERSION_ONE_TIME_BOUND,
      signing_public_key: null,
    };

    await expect(
      perform_x3dh_sender(
        await exportable_identity(),
        bundle,
        X3DH_VERSION_ACCOUNT_BOUND,
        null,
      ),
    ).rejects.toThrow(HANDSHAKE_DOWNGRADE_ERROR);
  });

  it("keeps accepting v4 from a sender that never advertised v5", async () => {
    const received = await receive_handshake(
      RECEIVER_IDENTITY_JWK,
      RECEIVER_SIGNED_PREKEY_JWK,
      from_base64(SENDER_IDENTITY_RAW_B64),
      from_base64(SENDER_EPHEMERAL_RAW_B64),
      null,
      null,
      X3DH_VERSION_ONE_TIME_BOUND,
      ONE_TIME_PREKEY_ID,
    );

    expect(received.session_binding).toBeNull();
    expect(to_hex(received.shared_secret)).toBe(
      (
        vectors as {
          legacy: { version: number; mode: string; expected_output: string }[];
        }
      ).legacy.find((entry) => entry.version === 4 && entry.mode === "none")
        ?.expected_output,
    );
  });
});

describe("bound ratchet header", () => {
  async function bound_pair() {
    const shared_secret = new Uint8Array(32).fill(9);
    const binding = sha256(new Uint8Array([4, 5, 6]));
    const bob_keypair = await generate_keypair();
    const bob = await DoubleRatchet.init_receiver(
      shared_secret,
      bob_keypair,
      "conv-v5",
      undefined,
      binding,
    );
    const alice = await DoubleRatchet.init_sender(
      shared_secret,
      bob_keypair.public_key,
      "conv-v5",
      undefined,
      binding,
    );

    return { alice, bob };
  }

  it("matches the published header AD vectors", () => {
    const { header, ad_v3, ad_v2 } = (
      vectors as unknown as {
        negative: {
          header_ad: { header: never; ad_v3: string; ad_v2: string };
        };
      }
    ).negative.header_ad;

    expect(to_hex(encode_ratchet_header_ad(header) ?? new Uint8Array())).toBe(
      ad_v3,
    );
    expect(
      to_hex(encode_ratchet_header_ad({ ...HEADER, v: 2 }) ?? new Uint8Array()),
    ).toBe(ad_v2);
    expect(encode_ratchet_header_ad({ ...HEADER, v: 1 })).toBeNull();
    expect(() => encode_ratchet_header_ad({ ...HEADER, v: 3 })).toThrow(
      /Malformed/,
    );
  });

  it("carries the session binding in every header", async () => {
    const { alice, bob } = await bound_pair();
    const message = await alice.encrypt("hello");

    expect(message.header.v).toBe(3);
    expect(message.header.sb).toBeTruthy();
    expect(await bob.decrypt(message)).toBe("hello");
  });

  it("reports a bound session only when it carries a session binding", async () => {
    const { alice, bob } = await bound_pair();
    const bob_keypair = await generate_keypair();
    const unbound = await DoubleRatchet.init_receiver(
      new Uint8Array(32).fill(9),
      bob_keypair,
      "conv-v4",
    );

    unbound.set_account_unbound(true);
    bob.set_account_unbound(true);

    expect(alice.is_session_bound()).toBe(true);
    expect(bob.is_session_bound()).toBe(true);
    expect(bob.is_account_unbound()).toBe(false);
    expect(unbound.is_session_bound()).toBe(false);
    expect(unbound.is_account_unbound()).toBe(true);
    expect(
      DoubleRatchet.try_deserialize(await bob.serialize())?.is_session_bound(),
    ).toBe(true);
  });

  it("rejects a tampered header counter", async () => {
    const { alice, bob } = await bound_pair();
    const message = await alice.encrypt("hello");

    await expect(
      bob.decrypt({
        ...message,
        header: { ...message.header, previous_chain_length: 1 },
      }),
    ).rejects.toThrow();
  });

  it("rejects a header from another session binding", async () => {
    const { alice, bob } = await bound_pair();
    const message = await alice.encrypt("hello");

    await expect(
      bob.decrypt({
        ...message,
        header: { ...message.header, sb: SESSION_BINDING },
      }),
    ).rejects.toThrow(/bound session/);
  });

  it("rejects an unbound header on a bound session", async () => {
    const { alice, bob } = await bound_pair();
    const message = await alice.encrypt("hello");

    await expect(
      bob.decrypt({
        ...message,
        header: { ...message.header, v: 2, sb: undefined },
      }),
    ).rejects.toThrow(/bound session/);
  });
});
