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
import { beforeEach, describe, expect, it, vi } from "vitest";

const CURRENT_BYTE = vi.hoisted(() => 3);
const LEGACY_BYTE = vi.hoisted(() => 4);
const get_mock = vi.hoisted(() => vi.fn());
const post_mock = vi.hoisted(() => vi.fn());

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

import { load_pq_secret } from "./pq_prekey_store";

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

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("pq secret fetch under a legacy key", () => {
  beforeEach(() => {
    get_mock.mockReset();
    post_mock.mockReset();
    post_mock.mockResolvedValue({ data: { success: true } });
  });

  it("re-uploads a secret that only a legacy key opened, under the current key", async () => {
    const secret = new Uint8Array(48).fill(9);

    get_mock.mockResolvedValue(await sealed_row(LEGACY_BYTE, 4101, secret));

    expect(await load_pq_secret(4101)).toEqual(secret);
    await flush();

    const uploads = post_mock.mock.calls.filter(([path]) => path === "/crypto/v1/ratchet/pq-secret");

    expect(uploads).toHaveLength(1);

    const body = uploads[0][1] as { key_id: number; encrypted_secret: string; secret_nonce: string };
    const reopened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(body.secret_nonce) },
      await aes(CURRENT_BYTE),
      unb64(body.encrypted_secret),
    );

    expect(body.key_id).toBe(4101);
    expect(new Uint8Array(reopened)).toEqual(secret);
  });

  it("does not re-upload a secret already under the current key", async () => {
    const secret = new Uint8Array(48).fill(7);

    get_mock.mockResolvedValue(await sealed_row(CURRENT_BYTE, 4102, secret));

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
});
