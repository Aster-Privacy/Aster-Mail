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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  vault_in_memory: true,
  key_material_available: true,
  account_id: "user-1" as string | null,
  api_get: vi.fn(),
  api_delete: vi.fn(),
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => h.vault_in_memory,
}));

vi.mock("./storage_write_key", () => ({
  load_storage_write_key_bytes: async () =>
    h.key_material_available
      ? new Uint8Array(32).map((_, i) => (i * 5 + 1) & 0xff)
      : null,
}));

vi.mock("./encrypted_storage", () => ({
  encrypted_get: async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  encrypted_set: async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  },
  encrypted_delete: async (key: string) => {
    h.store.delete(key);
  },
}));

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async (master: Uint8Array) =>
    crypto.subtle.importKey(
      "raw",
      new Uint8Array(master),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: h.api_get,
    delete: h.api_delete,
  },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => h.account_id,
}));

import {
  ec_one_time_storage_available,
  encrypt_ec_one_time_secret,
  save_ec_one_time_secret,
  load_ec_one_time_secret,
  has_local_ec_one_time_secret,
  delete_local_ec_one_time_secret,
  delete_ec_one_time_secret,
  reset_ec_one_time_missing_cache,
} from "./ec_prekey_store";

const KEY_ID = 918273;

async function fresh_scalar(): Promise<string> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);

  return jwk.d!;
}

beforeEach(() => {
  h.store.clear();
  h.vault_in_memory = true;
  h.key_material_available = true;
  h.account_id = "user-1";
  h.api_get.mockReset();
  h.api_delete.mockReset();
  h.api_get.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });
  h.api_delete.mockResolvedValue({ data: { success: true } });
  reset_ec_one_time_missing_cache();
});

describe("one-time prekey secret store", () => {
  it("reports storage as available with a vault and key material", async () => {
    expect(await ec_one_time_storage_available()).toBe(true);
  });

  it("reports storage as unavailable without a vault in memory", async () => {
    h.vault_in_memory = false;

    expect(await ec_one_time_storage_available()).toBe(false);
  });

  it("reports storage as unavailable without key material", async () => {
    h.key_material_available = false;

    expect(await ec_one_time_storage_available()).toBe(false);
  });

  it("returns a saved secret as a private key without a network call", async () => {
    const d = await fresh_scalar();

    await save_ec_one_time_secret(KEY_ID, d);

    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(true);
    expect(await load_ec_one_time_secret(KEY_ID)).toEqual({
      kty: "EC",
      crv: "P-256",
      d,
      ext: true,
      key_ops: ["deriveBits"],
    });
    expect(h.api_get).not.toHaveBeenCalled();
  });

  it("rejects a malformed key id or secret on save", async () => {
    const d = await fresh_scalar();

    for (const key_id of [0, -1, 0x80000000, 1.5, NaN]) {
      await expect(save_ec_one_time_secret(key_id, d)).rejects.toThrow(
        "Invalid one-time prekey secret",
      );
    }

    for (const secret of ["", "AAAA", `${d}AAAA`]) {
      await expect(save_ec_one_time_secret(KEY_ID, secret)).rejects.toThrow(
        "Invalid one-time prekey secret",
      );
    }

    expect(h.store.size).toBe(0);
  });

  it("returns null for an id outside the valid range without a lookup", async () => {
    for (const key_id of [0, -1, 0x80000000, 1.5]) {
      expect(await load_ec_one_time_secret(key_id)).toBeNull();
      expect(await has_local_ec_one_time_secret(key_id)).toBe(false);
    }

    expect(h.api_get).not.toHaveBeenCalled();
  });

  it("keeps secrets of different accounts apart", async () => {
    const d = await fresh_scalar();

    await save_ec_one_time_secret(KEY_ID, d);

    h.account_id = "user-2";

    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(false);
    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
  });

  it("recovers a secret from the server copy and keeps it locally", async () => {
    const d = await fresh_scalar();
    const encrypted = await encrypt_ec_one_time_secret(d);

    expect(encrypted).not.toBeNull();

    h.api_get.mockResolvedValue({
      data: { key_id: KEY_ID, ...encrypted! },
    });

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
    expect(h.api_get).toHaveBeenCalledTimes(1);
    expect(h.api_get).toHaveBeenCalledWith(
      `/crypto/v1/keys/ec-prekeys/secret/${KEY_ID}`,
    );

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
    expect(h.api_get).toHaveBeenCalledTimes(1);
  });

  it("refuses to encrypt a malformed secret", async () => {
    expect(await encrypt_ec_one_time_secret("AAAA")).toBeNull();
  });

  it("returns null without throwing when the server does not know the route", async () => {
    h.api_get.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
    expect(h.api_get).toHaveBeenCalledTimes(1);
  });

  it("returns null without throwing when the request itself fails", async () => {
    h.api_get.mockRejectedValue(new Error("offline"));

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
  });

  it("returns null when the server copy does not decrypt", async () => {
    const encrypted = await encrypt_ec_one_time_secret(await fresh_scalar());

    h.api_get.mockResolvedValue({
      data: {
        key_id: KEY_ID,
        encrypted_secret: encrypted!.encrypted_secret,
        secret_nonce: btoa(String.fromCharCode(...new Uint8Array(12))),
      },
    });

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
    expect(h.store.size).toBe(0);
  });

  it("returns null when the server answers with the secret of another key", async () => {
    const encrypted = await encrypt_ec_one_time_secret(await fresh_scalar());

    h.api_get.mockResolvedValue({
      data: {
        key_id: KEY_ID + 1,
        encrypted_secret: encrypted!.encrypted_secret,
        secret_nonce: encrypted!.secret_nonce,
      },
    });

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
    expect(h.store.size).toBe(0);
  });

  it("deletes a used secret locally and on the server", async () => {
    const d = await fresh_scalar();

    await save_ec_one_time_secret(KEY_ID, d);
    await delete_ec_one_time_secret(KEY_ID);

    expect(h.store.size).toBe(0);
    expect(h.api_delete).toHaveBeenCalledWith(
      `/crypto/v1/keys/ec-prekeys/${KEY_ID}`,
    );
    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(false);
  });

  it("does not refetch a deleted secret from the server", async () => {
    const d = await fresh_scalar();
    const encrypted = await encrypt_ec_one_time_secret(d);

    h.api_get.mockResolvedValue({ data: { key_id: KEY_ID, ...encrypted! } });

    await save_ec_one_time_secret(KEY_ID, d);
    await delete_ec_one_time_secret(KEY_ID);

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
    expect(h.api_get).not.toHaveBeenCalled();
  });

  it("still deletes locally when the server delete fails", async () => {
    h.api_delete.mockRejectedValue(new Error("offline"));

    await save_ec_one_time_secret(KEY_ID, await fresh_scalar());
    await expect(delete_ec_one_time_secret(KEY_ID)).resolves.toBeUndefined();

    expect(h.store.size).toBe(0);
  });

  it("deletes only the local copy on request", async () => {
    await save_ec_one_time_secret(KEY_ID, await fresh_scalar());
    await delete_local_ec_one_time_secret(KEY_ID);

    expect(h.store.size).toBe(0);
    expect(h.api_delete).not.toHaveBeenCalled();
  });

  it("can store the same id again after a deletion", async () => {
    const d = await fresh_scalar();

    await save_ec_one_time_secret(KEY_ID, d);
    await delete_local_ec_one_time_secret(KEY_ID);
    await save_ec_one_time_secret(KEY_ID, d);

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
  });
});
