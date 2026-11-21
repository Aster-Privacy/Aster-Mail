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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CURRENT_BYTE = vi.hoisted(() => 3);
const LEGACY_BYTE = vi.hoisted(() => 4);
const get_mock = vi.hoisted(() => vi.fn());
const post_mock = vi.hoisted(() => vi.fn());
const vault = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

const seal_switch = vi.hoisted(() => ({ ready: true }));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({
    bound_prekey_writes: seal_switch.ready,
  }),
}));

vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
});

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
    post: (...args: unknown[]) => post_mock(...args),
    delete: vi.fn(),
  },
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => true,
  get_vault_from_memory: () => vault.current,
}));

vi.mock("./storage_write_key", () => ({
  load_storage_write_key_bytes: async () => new Uint8Array(32).fill(CURRENT_BYTE),
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async () => null,
  encrypted_set: async () => {},
  encrypted_delete: async () => {},
}));

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async (master: Uint8Array) =>
    crypto.subtle.importKey("raw", master, "AES-GCM", false, ["encrypt", "decrypt"]),
  derive_ratchet_encryption_key_from_base: async () => ({}) as CryptoKey,
}));

vi.mock("./legacy_keks", () => ({
  decrypt_with_legacy_derived_keys: async (
    _derive: unknown,
    ciphertext: BufferSource,
    iv: BufferSource,
  ) => {
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(LEGACY_BYTE),
      "AES-GCM",
      false,
      ["decrypt"],
    );

    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    } catch {
      return null;
    }
  },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "u1",
}));

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { load_pq_secret, save_pq_secret } from "./pq_prekey_store";

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function aes(byte: number): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(32).fill(byte), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function sealed_row(byte: number, key_id: number, secret: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(byte), secret);

  return { data: { key_id, encrypted_secret: b64(new Uint8Array(ct)), secret_nonce: b64(iv) } };
}

async function vault_seal_key(): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    unb64(vault.current.prekey_seal_key as string),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("aster-opk-seal-v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function seal_aad(key_id: number): Uint8Array {
  return new TextEncoder().encode(`aster-opk-seal-v1:pq:${key_id}`);
}

async function vault_sealed_row(key_id: number, secret: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: seal_aad(key_id) },
    await vault_seal_key(),
    secret,
  );

  return { data: { key_id, encrypted_secret: b64(new Uint8Array(ct)), secret_nonce: b64(iv) } };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function single_upload() {
  const uploads = post_mock.mock.calls.filter(([path]) => path === "/crypto/v1/ratchet/pq-secret");

  expect(uploads).toHaveLength(1);

  return uploads[0][1] as { key_id: number; encrypted_secret: string; secret_nonce: string };
}

async function open_under_vault_key(body: {
  key_id: number;
  encrypted_secret: string;
  secret_nonce: string;
}): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(body.secret_nonce), additionalData: seal_aad(body.key_id) },
      await vault_seal_key(),
      unb64(body.encrypted_secret),
    ),
  );
}

describe("pq secret fetch under a legacy key", () => {
  beforeEach(() => {
    get_mock.mockReset();
    post_mock.mockReset();
    post_mock.mockResolvedValue({ data: { success: true } });
    vault.current = { prekey_seal_key: b64(new Uint8Array(32).fill(0x6b)) };
    seal_switch.ready = true;
  });

  it("uploads in the format older apps read until the server is ready", async () => {
    const secret = new Uint8Array(48).fill(6);

    seal_switch.ready = false;
    await save_pq_secret(4110, secret);

    const body = single_upload();
    const opened = await crypto.subtle
      .decrypt(
        { name: "AES-GCM", iv: unb64(body.secret_nonce) },
        await aes(CURRENT_BYTE),
        unb64(body.encrypted_secret),
      )
      .then(
        (plain) => new Uint8Array(plain),
        () => null,
      );

    expect(opened).toEqual(secret);
  });

  it("does not re-upload an older copy before the server is ready", async () => {
    const secret = new Uint8Array(48).fill(10);

    seal_switch.ready = false;
    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4111, secret));

    expect(await load_pq_secret(4111)).toEqual(secret);
    await flush();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("re-uploads a secret that only a legacy key opened, under the vault key", async () => {
    const secret = new Uint8Array(48).fill(9);

    get_mock.mockResolvedValue(await sealed_row(LEGACY_BYTE, 4101, secret));

    expect(await load_pq_secret(4101)).toEqual(secret);
    await flush();

    const body = single_upload();

    expect(body.key_id).toBe(4101);
    expect(await open_under_vault_key(body)).toEqual(secret);
  });

  it("re-uploads a secret under the storage sync key, under the vault key", async () => {
    const secret = new Uint8Array(48).fill(8);

    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4106, secret));

    expect(await load_pq_secret(4106)).toEqual(secret);
    await flush();

    expect(await open_under_vault_key(single_upload())).toEqual(secret);
  });

  it("does not re-upload a secret already under the vault key", async () => {
    const secret = new Uint8Array(48).fill(7);

    get_mock.mockResolvedValue(await vault_sealed_row(4102, secret));

    expect(await load_pq_secret(4102)).toEqual(secret);
    await flush();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("still returns the secret when the re-upload fails", async () => {
    const secret = new Uint8Array(48).fill(5);

    get_mock.mockResolvedValue(await sealed_row(LEGACY_BYTE, 4103, secret));
    post_mock.mockRejectedValue(new Error("offline"));

    expect(await load_pq_secret(4103)).toEqual(secret);
    await flush();
  });

  it("returns nothing for a secret neither key opens", async () => {
    get_mock.mockResolvedValue(await sealed_row(99, 4104, new Uint8Array(48).fill(1)));

    expect(await load_pq_secret(4104)).toBeNull();
    await flush();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("returns nothing when the server answers with another key id", async () => {
    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4199, new Uint8Array(48).fill(2)));

    expect(await load_pq_secret(4105)).toBeNull();
    await flush();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("refuses a secret the server returns for a different key id", async () => {
    const secret = new Uint8Array(48).fill(6);

    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4200, secret));

    expect(await load_pq_secret(4105)).toBeNull();
    await flush();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("opens an older client copy after migration and re-uploads it at once", async () => {
    const secret = new Uint8Array(48).fill(3);

    vault.current = { ...vault.current, prekey_seal_migrated: true };
    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4107, secret));

    expect(await load_pq_secret(4107)).toEqual(secret);
    await flush();

    expect(await open_under_vault_key(single_upload())).toEqual(secret);
  });

  it("cannot open mail for a key whose id the server reuses for another secret", async () => {
    const requested = ml_kem768.keygen(new Uint8Array(64).fill(11));
    const served = ml_kem768.keygen(new Uint8Array(64).fill(12));
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(requested.publicKey);

    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4106, served.secretKey));

    const loaded = await load_pq_secret(4106);

    expect(loaded).not.toBeNull();
    expect(ml_kem768.decapsulate(cipherText, loaded as Uint8Array)).not.toEqual(sharedSecret);
    expect(ml_kem768.decapsulate(cipherText, requested.secretKey)).toEqual(sharedSecret);
    await flush();
  });
});

function pq_binding(key_id: number): Uint8Array {
  return new TextEncoder().encode(`aster-prekey-secret:pq:v1:${key_id}`);
}

async function bound_row(bound_to: number, served_as: number, secret: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: pq_binding(bound_to) },
    await aes(CURRENT_BYTE),
    secret,
  );

  return {
    data: { key_id: served_as, encrypted_secret: b64(new Uint8Array(ct)), secret_nonce: b64(iv) },
  };
}

async function opens_with(
  body: { encrypted_secret: string; secret_nonce: string },
  additional_data: Uint8Array | null,
): Promise<Uint8Array | null> {
  try {
    const params: AesGcmParams = additional_data
      ? { name: "AES-GCM", iv: unb64(body.secret_nonce), additionalData: additional_data }
      : { name: "AES-GCM", iv: unb64(body.secret_nonce) };

    return new Uint8Array(
      await crypto.subtle.decrypt(params, await aes(CURRENT_BYTE), unb64(body.encrypted_secret)),
    );
  } catch {
    return null;
  }
}

describe("pq secrets bound to their key id", () => {
  beforeEach(() => {
    get_mock.mockReset();
    post_mock.mockReset();
    post_mock.mockResolvedValue({ data: { success: true } });
    vault.current = {};
    seal_switch.ready = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens a server copy sealed to the requested key id", async () => {
    const secret = new Uint8Array(48).fill(21);

    get_mock.mockResolvedValue(await bound_row(4301, 4301, secret));

    expect(await load_pq_secret(4301)).toEqual(secret);
    await flush();

    expect(post_mock).not.toHaveBeenCalled();
  });

  it("refuses a server copy sealed to another key id even when relabeled", async () => {
    get_mock.mockResolvedValue(await bound_row(4302, 4303, new Uint8Array(48).fill(22)));

    expect(await load_pq_secret(4303)).toBeNull();
  });

  it("re-seals an unbound copy to its key id when binding is switched on", async () => {
    vi.stubEnv("VITE_SEAL_PREKEY_SECRETS_WITH_KEY_ID", "1");
    const secret = new Uint8Array(48).fill(23);

    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4304, secret));

    expect(await load_pq_secret(4304)).toEqual(secret);
    await flush();

    const body = single_upload();

    expect(body.key_id).toBe(4304);
    expect(await opens_with(body, pq_binding(4304))).toEqual(secret);
    expect(await opens_with(body, pq_binding(4305))).toBeNull();
    expect(await opens_with(body, null)).toBeNull();
  });

  it("keeps uploads readable by older apps while binding is switched off", async () => {
    const secret = new Uint8Array(48).fill(24);

    get_mock.mockResolvedValue(await sealed_row(LEGACY_BYTE, 4306, secret));

    expect(await load_pq_secret(4306)).toEqual(secret);
    await flush();

    expect(await opens_with(single_upload(), null)).toEqual(secret);
  });
});
