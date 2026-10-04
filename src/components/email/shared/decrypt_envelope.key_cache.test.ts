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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  keygens: 0,
}));

vi.mock("@noble/post-quantum/ml-kem.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@noble/post-quantum/ml-kem.js")>();

  return {
    ...original,
    ml_kem768: {
      ...original.ml_kem768,
      keygen: (seed?: Uint8Array) => {
        h.keygens++;

        return original.ml_kem768.keygen(seed);
      },
    },
  };
});

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
  public_raw: Uint8Array;
  pq_seed_b64: string;
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

  return {
    private_jwk_str: JSON.stringify(private_jwk),
    public_raw,
    pq_seed_b64: array_to_base64(pq_seed),
    pq_public: ml_kem768.keygen(pq_seed).publicKey,
  };
}

function make_vault(identity: TestIdentity): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: identity.private_jwk_str,
    ratchet_identity_public: array_to_base64(identity.public_raw),
    ratchet_pq_identity_seed: identity.pq_seed_b64,
  } as unknown as EncryptedVault;
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

describe("inbound envelope private key reuse", () => {
  let jwk_imports = 0;

  beforeEach(() => {
    clear_vault_from_memory();
    reset_vault_refresh_state();
    h.vault = null;
    jwk_imports = 0;

    const original_import = crypto.subtle.importKey.bind(crypto.subtle);

    vi.spyOn(crypto.subtle, "importKey").mockImplementation(((
      format: string,
      ...rest: unknown[]
    ) => {
      if (format === "jwk") jwk_imports++;

      return (original_import as (...args: unknown[]) => Promise<CryptoKey>)(
        format,
        ...rest,
      );
    }) as SubtleCrypto["importKey"]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports the identity private key once for a run of ECIES envelopes", async () => {
    const identity = await generate_identity();
    const sealed = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => seal_ecies(`ecies ${i}`, identity)),
    );

    h.vault = make_vault(identity);
    h.keygens = 0;

    const subjects: Array<string | undefined> = [];

    for (const envelope of sealed) subjects.push(await open(envelope));

    expect(subjects).toEqual([
      "ecies 0",
      "ecies 1",
      "ecies 2",
      "ecies 3",
      "ecies 4",
    ]);
    expect(jwk_imports).toBe(1);
    expect(h.keygens).toBe(0);
  });

  it("derives a seed-only post-quantum key once for a run of hybrid envelopes", async () => {
    const identity = await generate_identity();
    const sealed = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => seal_pq_hybrid(`pq ${i}`, identity)),
    );

    h.vault = make_vault(identity);
    h.keygens = 0;

    const subjects: Array<string | undefined> = [];

    for (const envelope of sealed) subjects.push(await open(envelope));

    expect(subjects).toEqual(["pq 0", "pq 1", "pq 2", "pq 3", "pq 4"]);
    expect(h.keygens).toBe(1);
    expect(jwk_imports).toBe(1);
  });

  it("imports the key again after the vault is cleared", async () => {
    const identity = await generate_identity();
    const first = await seal_pq_hybrid("before clear", identity);
    const second = await seal_pq_hybrid("after clear", identity);

    h.vault = make_vault(identity);
    h.keygens = 0;

    expect(await open(first)).toBe("before clear");
    expect(jwk_imports).toBe(1);
    expect(h.keygens).toBe(1);

    clear_vault_from_memory();
    h.vault = make_vault(identity);

    expect(await open(second)).toBe("after clear");
    expect(jwk_imports).toBe(2);
    expect(h.keygens).toBe(2);
  });

  it("does not serve one identity's cached key for another identity", async () => {
    const alice = await generate_identity();
    const bob = await generate_identity();
    const to_alice = await seal_pq_hybrid("for alice", alice);
    const to_bob = await seal_pq_hybrid("for bob", bob);
    const ecies_to_alice = await seal_ecies("ecies for alice", alice);

    h.vault = make_vault(alice);
    expect(await open(to_alice)).toBe("for alice");

    h.vault = make_vault(bob);
    h.keygens = 0;
    jwk_imports = 0;

    expect(await open(to_bob)).toBe("for bob");
    expect(jwk_imports).toBe(1);
    expect(h.keygens).toBe(1);

    expect(await open(to_alice)).toBeUndefined();
    expect(await open(ecies_to_alice)).toBeUndefined();
  });
});
