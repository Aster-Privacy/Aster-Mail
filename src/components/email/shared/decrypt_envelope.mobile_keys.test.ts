// @vitest-environment happy-dom
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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const h = vi.hoisted(() => ({
  vault: null as unknown,
}));

vi.mock("@/services/crypto/memory_key_store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "correct horse battery staple",
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  wait_for_keys_ready: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ code: "NOT_FOUND" })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { clear_vault_from_memory } from "@/services/crypto/memory_key_store";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import {
  import_ke_public_key,
  compute_agreement_bits,
  derive_aes_key_from_bytes,
} from "@/services/crypto/key_manager";
import { array_to_base64 } from "@/services/crypto/base64";

const INBOUND_ECIES_INFO = new TextEncoder().encode("aster-inbound-v1");
const INBOUND_PQ_HYBRID_INFO = new TextEncoder().encode("aster-inbound-pq-v1");

interface TestIdentity {
  private_jwk_str: string;
  compact_jwk_str: string;
  public_raw: Uint8Array;
  pq_seed_b64: string;
  pq_secret_b64: string;
  pq_public: Uint8Array;
}

async function generate_identity(): Promise<TestIdentity> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const private_jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);
  const public_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );
  const pq_seed = crypto.getRandomValues(new Uint8Array(64));
  const pq_keys = ml_kem768.keygen(pq_seed);

  return {
    private_jwk_str: JSON.stringify(private_jwk),
    compact_jwk_str: JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: private_jwk.d,
    }),
    public_raw,
    pq_seed_b64: array_to_base64(pq_seed),
    pq_secret_b64: array_to_base64(pq_keys.secretKey),
    pq_public: pq_keys.publicKey,
  };
}

async function ephemeral_agreement(recipient_public_raw: Uint8Array) {
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const eph_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", eph.publicKey),
  );
  const recipient_public = await import_ke_public_key(recipient_public_raw);
  const shared = await compute_agreement_bits(eph.privateKey, recipient_public);

  return { eph_raw, shared };
}

function pack(
  marker: number,
  parts: Uint8Array[],
  nonce: Uint8Array,
): { encrypted_envelope: string; envelope_nonce: string } {
  const total = parts.reduce((sum, part) => sum + part.length, 1);
  const enc = new Uint8Array(total);
  let offset = 1;

  enc[0] = marker;
  for (const part of parts) {
    enc.set(part, offset);
    offset += part.length;
  }

  return {
    encrypted_envelope: array_to_base64(enc),
    envelope_nonce: array_to_base64(nonce),
  };
}

async function seal_ecies(subject: string, recipient: TestIdentity) {
  const { eph_raw, shared } = await ephemeral_agreement(recipient.public_raw);
  const aes_key = await derive_aes_key_from_bytes(
    shared,
    new Uint8Array(0),
    INBOUND_ECIES_INFO,
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes_key,
      new TextEncoder().encode(JSON.stringify({ subject })),
    ),
  );

  return pack(0x02, [eph_raw, ciphertext], nonce);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function seal_pq_hybrid(subject: string, recipient: TestIdentity) {
  const { eph_raw, shared } = await ephemeral_agreement(recipient.public_raw);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(
    recipient.pq_public,
  );
  const ikm = new Uint8Array(64);

  ikm.set(new Uint8Array(shared), 0);
  ikm.set(sharedSecret.slice(0, 32), 32);

  const hkdf_key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);
  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: INBOUND_PQ_HYBRID_INFO,
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes_key,
      await deflate(new TextEncoder().encode(JSON.stringify({ subject }))),
    ),
  );

  return pack(0x04, [eph_raw, cipherText, ciphertext], nonce);
}

async function open(sealed: {
  encrypted_envelope: string;
  envelope_nonce: string;
}): Promise<string | undefined> {
  const result = await decrypt_mail_envelope<{ subject?: string }>(
    sealed.encrypted_envelope,
    sealed.envelope_nonce,
  );

  return result?.subject;
}

function vault_of(fields: Record<string, unknown>): EncryptedVault {
  return { identity_key: "", ...fields } as unknown as EncryptedVault;
}

describe("inbound envelopes sealed to keys written by a mobile app", () => {
  beforeEach(() => {
    clear_vault_from_memory();
    reset_vault_refresh_state();
    h.vault = null;
  });

  it("opens an ECIES envelope with a compact private key", async () => {
    const identity = await generate_identity();
    const sealed = await seal_ecies("compact current", identity);

    h.vault = vault_of({
      ratchet_identity_key: identity.compact_jwk_str,
      ratchet_identity_public: array_to_base64(identity.public_raw),
    });

    expect(await open(sealed)).toBe("compact current");
  });

  it("opens a hybrid envelope with a compact private key and a seed", async () => {
    const identity = await generate_identity();
    const sealed = await seal_pq_hybrid("compact hybrid", identity);

    h.vault = vault_of({
      ratchet_identity_key: identity.compact_jwk_str,
      ratchet_identity_public: array_to_base64(identity.public_raw),
      ratchet_pq_identity_seed: identity.pq_seed_b64,
    });

    expect(await open(sealed)).toBe("compact hybrid");
  });

  it("opens mail sealed to a compact key that another client archived", async () => {
    const mobile = await generate_identity();
    const web = await generate_identity();
    const sealed = await seal_ecies("archived compact", mobile);

    h.vault = vault_of({
      ratchet_identity_key: web.private_jwk_str,
      ratchet_identity_public: array_to_base64(web.public_raw),
      ratchet_pq_identity_seed: web.pq_seed_b64,
      ratchet_previous_keys: [
        {
          ratchet_identity_key: mobile.compact_jwk_str,
          ratchet_identity_public: array_to_base64(mobile.public_raw),
        },
      ],
    });

    expect(await open(sealed)).toBe("archived compact");
  });

  it("opens a hybrid envelope after the encryption key is archived without its post-quantum key", async () => {
    const web = await generate_identity();
    const mobile = await generate_identity();
    const sealed = await seal_pq_hybrid("split pair", web);

    h.vault = vault_of({
      ratchet_identity_key: mobile.compact_jwk_str,
      ratchet_identity_public: array_to_base64(mobile.public_raw),
      ratchet_pq_identity_key: web.pq_secret_b64,
      ratchet_previous_keys: [
        {
          ratchet_identity_key: web.private_jwk_str,
          ratchet_identity_public: array_to_base64(web.public_raw),
        },
      ],
    });

    expect(await open(sealed)).toBe("split pair");
  });

  it("opens a hybrid envelope sealed to a mobile identity and a post-quantum key added later", async () => {
    const mobile = await generate_identity();
    const web = await generate_identity();
    const mixed: TestIdentity = { ...mobile, pq_public: web.pq_public };
    const sealed = await seal_pq_hybrid("mixed pair", mixed);

    h.vault = vault_of({
      ratchet_identity_key: web.private_jwk_str,
      ratchet_identity_public: array_to_base64(web.public_raw),
      ratchet_pq_identity_seed: web.pq_seed_b64,
      ratchet_previous_keys: [
        {
          ratchet_identity_key: mobile.compact_jwk_str,
          ratchet_identity_public: array_to_base64(mobile.public_raw),
        },
      ],
    });

    expect(await open(sealed)).toBe("mixed pair");
  });

  it("still refuses a hybrid envelope sealed to keys the vault does not hold", async () => {
    const mine = await generate_identity();
    const archived = await generate_identity();
    const stranger = await generate_identity();
    const half_stranger: TestIdentity = {
      ...mine,
      pq_public: stranger.pq_public,
    };

    h.vault = vault_of({
      ratchet_identity_key: mine.compact_jwk_str,
      ratchet_identity_public: array_to_base64(mine.public_raw),
      ratchet_pq_identity_seed: mine.pq_seed_b64,
      ratchet_previous_keys: [
        {
          ratchet_identity_key: archived.private_jwk_str,
          ratchet_identity_public: array_to_base64(archived.public_raw),
          ratchet_pq_identity_seed: archived.pq_seed_b64,
        },
      ],
    });

    expect(
      await open(await seal_pq_hybrid("stranger", stranger)),
    ).toBeUndefined();
    expect(
      await open(await seal_pq_hybrid("half stranger", half_stranger)),
    ).toBeUndefined();
  });
});
