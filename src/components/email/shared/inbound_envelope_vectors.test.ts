import { describe, it, expect } from "vitest";

import {
  decrypt_inbound_ecies,
  decrypt_inbound_pq_hybrid,
} from "./decrypt_envelope";

import vectors from "@/tests/fixtures/inbound_envelope_vectors.json";

function b64_to_bytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }

  return out;
}

function bytes_to_b64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function recipient_identity_jwk(): string {
  const scalar = b64_to_bytes(vectors.recipient_p256_private_scalar_b64);
  const point = b64_to_bytes(vectors.recipient_p256_public_sec1_b64);

  return JSON.stringify({
    kty: "EC",
    crv: "P-256",
    d: bytes_to_b64url(scalar),
    x: bytes_to_b64url(point.slice(1, 33)),
    y: bytes_to_b64url(point.slice(33, 65)),
    ext: true,
  });
}

describe("inbound envelope cross-language vectors", () => {
  it("matches the backend wire layout", () => {
    const ecdh = b64_to_bytes(vectors.ecdh_compressed.envelope_b64);
    const pq = b64_to_bytes(vectors.pq_hybrid.envelope_b64);

    expect(ecdh[0]).toBe(0x03);
    expect(ecdh[1]).toBe(0x04);
    expect(pq[0]).toBe(0x04);
    expect(pq[1]).toBe(0x04);
    expect(b64_to_bytes(vectors.ecdh_compressed.nonce_b64).length).toBe(12);
    expect(b64_to_bytes(vectors.pq_hybrid.nonce_b64).length).toBe(12);
    expect(pq.length).toBeGreaterThan(1 + 65 + 1088 + 16);
  });

  it("decrypts a marker 0x03 envelope produced by the backend", async () => {
    const plain = await decrypt_inbound_ecies(
      b64_to_bytes(vectors.ecdh_compressed.envelope_b64),
      b64_to_bytes(vectors.ecdh_compressed.nonce_b64),
      recipient_identity_jwk(),
      true,
    );

    expect(plain).not.toBeNull();
    expect(new TextDecoder().decode(plain as Uint8Array)).toBe(
      vectors.plaintext_utf8,
    );
  });

  it("decrypts a marker 0x04 envelope produced by the backend", async () => {
    const plain = await decrypt_inbound_pq_hybrid(
      b64_to_bytes(vectors.pq_hybrid.envelope_b64),
      b64_to_bytes(vectors.pq_hybrid.nonce_b64),
      recipient_identity_jwk(),
      vectors.recipient_ml_kem768_decapsulation_key_b64,
    );

    expect(plain).not.toBeNull();
    expect(new TextDecoder().decode(plain as Uint8Array)).toBe(
      vectors.plaintext_utf8,
    );
  });

  it("rejects an envelope whose ciphertext was tampered with", async () => {
    const tampered = b64_to_bytes(vectors.ecdh_compressed.envelope_b64);

    tampered[tampered.length - 1] ^= 0xff;

    const plain = await decrypt_inbound_ecies(
      tampered,
      b64_to_bytes(vectors.ecdh_compressed.nonce_b64),
      recipient_identity_jwk(),
      true,
    );

    expect(plain).toBeNull();
  });

  it("rejects an envelope decrypted with the wrong nonce", async () => {
    const plain = await decrypt_inbound_ecies(
      b64_to_bytes(vectors.ecdh_compressed.envelope_b64),
      b64_to_bytes(vectors.pq_hybrid.nonce_b64),
      recipient_identity_jwk(),
      true,
    );

    expect(plain).toBeNull();
  });
});
