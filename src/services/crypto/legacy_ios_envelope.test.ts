import { describe, it, expect, vi, beforeEach } from "vitest";

const account = {
  user: { id: "user-1", email: "djozman@astermail.org", username: "djozman" },
};

let current_passphrase: string | null = "correct horse battery staple";

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => account,
}));

const salt_bytes = new Uint8Array(16).fill(7);

vi.mock("@/services/api/auth", () => ({
  get_user_salt: async () => ({
    data: { salt: btoa(String.fromCharCode(...salt_bytes)) },
  }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => current_passphrase,
}));

import {
  decrypt_legacy_ios_envelope,
  clear_legacy_ios_envelope_key,
} from "./legacy_ios_envelope";

async function derive_ios_key_material(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    256,
  );

  return new Uint8Array(bits);
}

async function seal_like_ios(
  plaintext: string,
  key_material: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );

  return new Uint8Array(sealed);
}

describe("decrypt_legacy_ios_envelope", () => {
  beforeEach(() => {
    current_passphrase = "correct horse battery staple";
    clear_legacy_ios_envelope_key();
  });

  it("opens an envelope sealed the way older iOS builds sealed sent mail", async () => {
    const envelope = JSON.stringify({
      subject: "Hello from my phone",
      body_text: "This used to be invisible everywhere else.",
    });
    const key_material = await derive_ios_key_material(
      "correct horse battery staple",
      salt_bytes,
    );
    const nonce = new Uint8Array(12).fill(3);
    const ciphertext = await seal_like_ios(envelope, key_material, nonce);

    const plaintext = await decrypt_legacy_ios_envelope(ciphertext, nonce);

    expect(plaintext).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(plaintext!))).toEqual({
      subject: "Hello from my phone",
      body_text: "This used to be invisible everywhere else.",
    });
  }, 30000);

  it("returns null for a nonce that is not a 12-byte AES-GCM nonce", async () => {
    const nonce = new Uint8Array([1]);
    const ciphertext = new Uint8Array(64).fill(9);

    expect(await decrypt_legacy_ios_envelope(ciphertext, nonce)).toBeNull();
  });

  it("returns null when the passphrase is not in memory", async () => {
    current_passphrase = null;

    const nonce = new Uint8Array(12).fill(3);
    const ciphertext = new Uint8Array(64).fill(9);

    expect(await decrypt_legacy_ios_envelope(ciphertext, nonce)).toBeNull();
  }, 30000);

  it("returns null for ciphertext sealed under a different password", async () => {
    const key_material = await derive_ios_key_material("wrong password", salt_bytes);
    const nonce = new Uint8Array(12).fill(4);
    const ciphertext = await seal_like_ios("{}", key_material, nonce);

    expect(await decrypt_legacy_ios_envelope(ciphertext, nonce)).toBeNull();
  }, 30000);
});
