import { describe, it, expect, vi } from "vitest";

import { generate_keypair } from "./double_ratchet";

vi.mock("./encrypted_storage", () => ({
  encrypted_get: vi.fn(),
  encrypted_set: vi.fn(),
  encrypted_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(1)),
  has_vault_in_memory: vi.fn(() => true),
}));

describe("generate_keypair", () => {
  it("should generate valid ECDH keypair", async () => {
    const keypair = await generate_keypair();

    expect(keypair.public_key).toBeInstanceOf(Uint8Array);
    expect(keypair.private_key).toBeInstanceOf(Uint8Array);
    expect(keypair.public_key.length).toBe(65);
    expect(keypair.private_key.length).toBeGreaterThan(0);
  });

  it("should generate unique keypairs each time", async () => {
    const keypair1 = await generate_keypair();
    const keypair2 = await generate_keypair();

    expect(keypair1.public_key).not.toEqual(keypair2.public_key);
    expect(keypair1.private_key).not.toEqual(keypair2.private_key);
  });

  it("should generate public key in uncompressed format", async () => {
    const keypair = await generate_keypair();

    expect(keypair.public_key[0]).toBe(0x04);
  });

  it("should generate 32-byte private key", async () => {
    const keypair = await generate_keypair();

    expect(keypair.private_key.length).toBe(32);
  });

  it("should generate cryptographically random keys", async () => {
    const keys: Uint8Array[] = [];
    for (let i = 0; i < 10; i++) {
      const keypair = await generate_keypair();
      keys.push(keypair.public_key);
    }

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect(keys[i]).not.toEqual(keys[j]);
      }
    }
  });

  it("should produce valid P-256 public key structure", async () => {
    const keypair = await generate_keypair();

    expect(keypair.public_key[0]).toBe(0x04);
    expect(keypair.public_key.length).toBe(65);
  });

  it("should handle rapid sequential generation", async () => {
    const keypairs = await Promise.all(
      Array(20).fill(null).map(() => generate_keypair())
    );

    const public_keys = new Set(
      keypairs.map(kp => Array.from(kp.public_key).join(","))
    );

    expect(public_keys.size).toBe(20);
  });
});
