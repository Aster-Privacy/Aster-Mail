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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  vault_in_memory: true,
  key_material_available: true,
  account_id: "user-1" as string | null,
  api_get: vi.fn(),
  api_delete: vi.fn(),
  api_put: vi.fn(),
  vault: {} as Record<string, unknown>,
  writes_ready: true,
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({
    bound_prekey_writes: h.writes_ready,
  }),
}));

vi.mock("./memory_key_store", () => ({
  has_vault_in_memory: () => h.vault_in_memory,
  get_vault_from_memory: () => (h.vault_in_memory ? h.vault : null),
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
    put: h.api_put,
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
  drop_server_ec_secret,
  reset_ec_one_time_missing_cache,
  reseal_server_ec_secrets,
} from "./ec_prekey_store";

const KEY_ID = 918273;

function b64_to_bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function b64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");

  return b64_to_bytes(
    normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="),
  );
}

function sync_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).map((_, i) => (i * 5 + 1) & 0xff),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function vault_seal_key(): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    b64_to_bytes(h.vault.prekey_seal_key as string),
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

async function legacy_row(d: string, key_id: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await sync_key(),
    b64url_to_bytes(d),
  );

  return {
    key_id,
    encrypted_secret: btoa(String.fromCharCode(...new Uint8Array(ct))),
    secret_nonce: btoa(String.fromCharCode(...iv)),
  };
}

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
  h.writes_ready = true;
  h.api_get.mockReset();
  h.api_delete.mockReset();
  h.api_put.mockReset();
  h.vault = {
    prekey_seal_key: btoa(String.fromCharCode(...new Uint8Array(32).fill(0x5a))),
  };
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
    const encrypted = await encrypt_ec_one_time_secret(d, KEY_ID);

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
    expect(await encrypt_ec_one_time_secret("AAAA", KEY_ID)).toBeNull();
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
    const encrypted = await encrypt_ec_one_time_secret(await fresh_scalar(), KEY_ID);

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
    const encrypted = await encrypt_ec_one_time_secret(await fresh_scalar(), KEY_ID);

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
    const encrypted = await encrypt_ec_one_time_secret(d, KEY_ID);

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

  it("seals the server copy under the vault key, bound to its id", async () => {
    const d = await fresh_scalar();
    const encrypted = await encrypt_ec_one_time_secret(d, KEY_ID);
    const iv = b64_to_bytes(encrypted!.secret_nonce);
    const ct = b64_to_bytes(encrypted!.encrypted_secret);

    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, await sync_key(), ct),
    ).rejects.toBeDefined();

    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(
          `aster-opk-seal-v1:ec:${KEY_ID}`,
        ),
      },
      await vault_seal_key(),
      ct,
    );

    expect(new Uint8Array(opened)).toEqual(b64url_to_bytes(d));
  });

  it("does not open a server copy sealed for another key id", async () => {
    const encrypted = await encrypt_ec_one_time_secret(
      await fresh_scalar(),
      KEY_ID + 1,
    );

    h.api_get.mockResolvedValue({ data: { key_id: KEY_ID, ...encrypted! } });

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
  });

  it("still opens a copy written by an older client before migration", async () => {
    const d = await fresh_scalar();

    h.api_get.mockResolvedValue({ data: await legacy_row(d, KEY_ID) });

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
  });

  it("opens an older client copy after migration and re-seals it at once", async () => {
    const d = await fresh_scalar();

    h.vault = { ...h.vault, prekey_seal_migrated: true };
    h.api_get.mockResolvedValue({ data: await legacy_row(d, KEY_ID) });
    h.api_put.mockResolvedValue({ data: { success: true } });

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
    expect(h.api_put).toHaveBeenCalledTimes(1);

    const [path, body] = h.api_put.mock.calls[0] as [
      string,
      { encrypted_secret: string; secret_nonce: string },
    ];
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: b64_to_bytes(body.secret_nonce),
        additionalData: new TextEncoder().encode(
          `aster-opk-seal-v1:ec:${KEY_ID}`,
        ),
      },
      await vault_seal_key(),
      b64_to_bytes(body.encrypted_secret),
    );

    expect(path).toBe(`/crypto/v1/keys/ec-prekeys/secret/${KEY_ID}`);
    expect(new Uint8Array(opened)).toEqual(b64url_to_bytes(d));
  });

  it("seals in the format older apps read until the server is ready", async () => {
    const d = await fresh_scalar();

    h.writes_ready = false;

    const encrypted = await encrypt_ec_one_time_secret(d, KEY_ID);
    const opened = await crypto.subtle
      .decrypt(
        { name: "AES-GCM", iv: b64_to_bytes(encrypted!.secret_nonce) },
        await sync_key(),
        b64_to_bytes(encrypted!.encrypted_secret),
      )
      .then(
        (plain) => new Uint8Array(plain),
        () => null,
      );

    expect(opened).toEqual(b64url_to_bytes(d));
  });

  it("does not rewrite an older copy before the server is ready", async () => {
    const d = await fresh_scalar();

    h.writes_ready = false;
    h.api_get.mockResolvedValue({ data: await legacy_row(d, KEY_ID) });
    h.api_put.mockResolvedValue({ data: { success: true } });

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
    expect(h.api_put).not.toHaveBeenCalled();
  });

  it("does not rewrite a copy that is already sealed under the vault key", async () => {
    const d = await fresh_scalar();
    const sealed = await encrypt_ec_one_time_secret(d, KEY_ID);

    h.api_get.mockResolvedValue({ data: { key_id: KEY_ID, ...sealed! } });

    expect((await load_ec_one_time_secret(KEY_ID))?.d).toBe(d);
    expect(h.api_put).not.toHaveBeenCalled();
  });

  it("re-seals older client copies under the vault key", async () => {
    const legacy_d = await fresh_scalar();
    const current = await encrypt_ec_one_time_secret(await fresh_scalar(), 7);

    h.api_get.mockImplementation(async (path: string) => {
      if (path === "/crypto/v1/keys/ec-prekeys/ids") {
        return { data: { key_ids: [KEY_ID, 7] } };
      }

      if (path.endsWith(`/${KEY_ID}`)) {
        return { data: await legacy_row(legacy_d, KEY_ID) };
      }

      return { data: { key_id: 7, ...current! } };
    });
    h.api_put.mockResolvedValue({ data: { success: true } });

    expect(await reseal_server_ec_secrets(await vault_seal_key())).toBe(true);
    expect(h.api_put).toHaveBeenCalledTimes(1);

    const [path, body] = h.api_put.mock.calls[0] as [
      string,
      { encrypted_secret: string; secret_nonce: string },
    ];
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: b64_to_bytes(body.secret_nonce),
        additionalData: new TextEncoder().encode(
          `aster-opk-seal-v1:ec:${KEY_ID}`,
        ),
      },
      await vault_seal_key(),
      b64_to_bytes(body.encrypted_secret),
    );

    expect(path).toBe(`/crypto/v1/keys/ec-prekeys/secret/${KEY_ID}`);
    expect(new Uint8Array(opened)).toEqual(b64url_to_bytes(legacy_d));
  });

  it("pages through every id the server lists before re-sealing", async () => {
    const legacy_d = await fresh_scalar();
    const first_page = Array.from({ length: 1200 }, (_, index) => index + 1000);

    h.api_get.mockImplementation(async (path: string) => {
      if (path === "/crypto/v1/keys/ec-prekeys/ids") {
        return { data: { key_ids: first_page, next_after: 2199 } };
      }

      if (path === "/crypto/v1/keys/ec-prekeys/ids?after=2199") {
        return { data: { key_ids: [KEY_ID] } };
      }

      if (path.endsWith(`/${KEY_ID}`)) {
        return { data: await legacy_row(legacy_d, KEY_ID) };
      }

      return { error: "not found", code: "NOT_FOUND" };
    });
    h.api_put.mockResolvedValue({ data: { success: true } });

    expect(await reseal_server_ec_secrets(await vault_seal_key())).toBe(true);
    expect(h.api_put).toHaveBeenCalledTimes(1);
    expect(h.api_put.mock.calls[0][0]).toBe(
      `/crypto/v1/keys/ec-prekeys/secret/${KEY_ID}`,
    );
  });

  it("reports an unfinished re-seal when a page cursor does not advance", async () => {
    h.api_get.mockImplementation(async (path: string) => {
      if (path.startsWith("/crypto/v1/keys/ec-prekeys/ids")) {
        return { data: { key_ids: [3], next_after: 3 } };
      }

      return { error: "not found", code: "NOT_FOUND" };
    });

    expect(await reseal_server_ec_secrets(await vault_seal_key())).toBe(false);
  });

  it("counts a dropped server copy as removed only when the server deleted it", async () => {
    await save_ec_one_time_secret(KEY_ID, await fresh_scalar());

    h.api_delete.mockResolvedValueOnce({ data: { success: true } });
    expect(await drop_server_ec_secret(KEY_ID)).toBe(false);
    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(true);

    h.api_delete.mockResolvedValueOnce({ data: { success: true, deleted: false } });
    expect(await drop_server_ec_secret(KEY_ID)).toBe(false);
    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(true);

    h.api_delete.mockResolvedValueOnce({ error: "Not found", code: "NOT_FOUND" });
    expect(await drop_server_ec_secret(KEY_ID)).toBe(false);
    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(true);

    h.api_delete.mockRejectedValueOnce(new Error("offline"));
    expect(await drop_server_ec_secret(KEY_ID)).toBe(false);
    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(true);

    h.api_delete.mockResolvedValueOnce({ data: { success: true, deleted: true } });
    expect(await drop_server_ec_secret(KEY_ID)).toBe(true);
    expect(await has_local_ec_one_time_secret(KEY_ID)).toBe(false);
    expect(h.api_delete).toHaveBeenLastCalledWith(
      `/crypto/v1/keys/ec-prekeys/${KEY_ID}`,
    );
  });

  it("reports an unfinished re-seal when the id list is unavailable", async () => {
    h.api_get.mockResolvedValue({ error: "Not found", code: "NOT_FOUND" });

    expect(await reseal_server_ec_secrets(await vault_seal_key())).toBe(false);
    expect(h.api_put).not.toHaveBeenCalled();
  });
});

function ec_binding(key_id: number): Uint8Array {
  return new TextEncoder().encode(`aster-prekey-secret:ec:v1:${key_id}`);
}

async function test_sync_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).map((_, i) => (i * 5 + 1) & 0xff),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function scalar_bytes(d: string): Uint8Array {
  const b64 = d.replace(/-/g, "+").replace(/_/g, "/");

  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  );
}

async function bound_copy(bound_to: number, served_as: number, d: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ec_binding(bound_to) },
    await test_sync_key(),
    scalar_bytes(d),
  );

  return {
    data: {
      key_id: served_as,
      encrypted_secret: btoa(String.fromCharCode(...new Uint8Array(ct))),
      secret_nonce: btoa(String.fromCharCode(...iv)),
    },
  };
}

describe("one-time prekey secrets bound to their key id", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens a server copy sealed to the requested key id", async () => {
    const d = await fresh_scalar();

    h.api_get.mockResolvedValue(await bound_copy(KEY_ID, KEY_ID, d));

    const jwk = await load_ec_one_time_secret(KEY_ID);

    expect(jwk?.d).toBe(d);
  });

  it("refuses a server copy sealed to another key id even when relabeled", async () => {
    h.api_get.mockResolvedValue(await bound_copy(KEY_ID + 1, KEY_ID, await fresh_scalar()));

    expect(await load_ec_one_time_secret(KEY_ID)).toBeNull();
    expect(h.store.size).toBe(0);
  });

  it("seals a new secret to its key id when binding is switched on", async () => {
    vi.stubEnv("VITE_SEAL_PREKEY_SECRETS_WITH_KEY_ID", "1");
    h.writes_ready = false;
    const d = await fresh_scalar();
    const sealed = await encrypt_ec_one_time_secret(d, KEY_ID);

    expect(sealed).not.toBeNull();

    const iv = Uint8Array.from(atob(sealed!.secret_nonce), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(sealed!.encrypted_secret), (c) => c.charCodeAt(0));
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: ec_binding(KEY_ID) },
      await test_sync_key(),
      ct,
    );

    expect(new Uint8Array(opened)).toEqual(scalar_bytes(d));
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, await test_sync_key(), ct),
    ).rejects.toBeDefined();
  });
});
