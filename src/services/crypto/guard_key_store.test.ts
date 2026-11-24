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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { gcm } from "@noble/ciphers/aes";

import { replace_indexed_db } from "@/tests/fixtures/version_change_indexed_db";

const wrap_key_mock = vi.fn<() => Promise<CryptoKey | null>>();

vi.mock("@/services/crypto/device_key_store", () => ({
  get_device_wrap_key: () => wrap_key_mock(),
}));

import {
  create_guard_device,
  forget_guard_device,
  get_guard_device,
} from "@/services/guard/guard_device";
import {
  delete_guard_database,
  delete_guard_hints_for,
  GUARD_DB_NAME,
  read_guard_hint,
  write_guard_hint,
} from "@/services/crypto/guard_key_store";
import {
  code_secret_aad,
  guard_seal_key,
  GUARD_SEAL_VERSION,
} from "@/lib/crypto/guard_seal";

type Handler = (() => void) | null;

const databases = new Map<string, Map<string, unknown>>();

function later(fn: () => void): void {
  setTimeout(fn, 0);
}

function fake_db(name: string) {
  const data = databases.get(name)!;

  return {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    close: () => undefined,
    onversionchange: null as Handler,
    transaction() {
      const tx = {
        error: null as Error | null,
        oncomplete: null as Handler,
        onabort: null as Handler,
        onerror: null as Handler,
        objectStore() {
          const op = (run: () => unknown) => {
            const request = { result: undefined as unknown, onsuccess: null as Handler };

            later(() => {
              request.result = run();
              request.onsuccess?.();
              later(() => tx.oncomplete?.());
            });

            return request;
          };

          return {
            get: (key: string) => op(() => data.get(key)),
            put: (value: unknown, key: string) => op(() => data.set(key, value)),
            delete: (key: string) => op(() => data.delete(key)),
            getAllKeys: () => op(() => Array.from(data.keys())),
          };
        },
      };

      return tx;
    },
  };
}

const fake_indexed_db = {
  open(name: string) {
    const request = {
      result: null as unknown,
      error: null,
      onsuccess: null as Handler,
      onerror: null as Handler,
      onblocked: null as Handler,
      onupgradeneeded: null as Handler,
    };

    later(() => {
      if (!databases.has(name)) databases.set(name, new Map());
      request.result = fake_db(name);
      request.onsuccess?.();
    });

    return request;
  },
  deleteDatabase(name: string) {
    const request = { onsuccess: null as Handler, onerror: null as Handler, onblocked: null as Handler };

    later(() => {
      databases.delete(name);
      request.onsuccess?.();
    });

    return request;
  },
};

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "33333333-3333-4333-8333-333333333333";

async function make_wrap_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]) as Promise<CryptoKey>;
}

function seal_to(
  plaintext: Uint8Array,
  aad: Uint8Array,
  mlkem_pk: Uint8Array,
  x25519_pk: Uint8Array,
): Uint8Array {
  const eph_sk = x25519.utils.randomSecretKey();
  const eph = x25519.getPublicKey(eph_sk);
  const x_shared = x25519.getSharedSecret(eph_sk, x25519_pk);
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(mlkem_pk);
  const key = guard_seal_key(x_shared, sharedSecret, eph, cipherText, aad);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = gcm(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(1 + eph.length + cipherText.length + 12 + ct.length);
  let offset = 0;

  out[offset++] = GUARD_SEAL_VERSION;
  out.set(eph, offset);
  offset += eph.length;
  out.set(cipherText, offset);
  offset += cipherText.length;
  out.set(nonce, offset);
  offset += 12;
  out.set(ct, offset);

  return out;
}

describe("guard device key store", () => {
  let wrap_key: CryptoKey;
  let restore_indexed_db: () => void = () => undefined;

  beforeEach(async () => {
    databases.clear();
    restore_indexed_db = replace_indexed_db(
      fake_indexed_db as unknown as IDBFactory,
    );
    wrap_key = await make_wrap_key();
    wrap_key_mock.mockReset();
    wrap_key_mock.mockResolvedValue(wrap_key);
  });

  afterEach(() => {
    restore_indexed_db();
  });

  it("returns the same device and a verifiable signature after reload", async () => {
    const created = await create_guard_device(USER_A, "Firefox on Windows");
    const created_pk = (await created.public_keys()).action_pk;
    const loaded = await get_guard_device(USER_A);

    expect(loaded).not.toBeNull();
    const pub = await loaded!.public_keys();

    expect(Array.from(pub.action_pk)).toEqual(Array.from(created_pk));
    expect(pub.device_type).toBe("web");
    expect(pub.name).toBe("Firefox on Windows");

    const signature = await loaded!.sign(new TextEncoder().encode("guard action"));

    expect(signature.length).toBe(64);

    const record = databases.get(GUARD_DB_NAME)!.get(USER_A) as {
      action_key: CryptoKey;
    };

    expect(record.action_key.extractable).toBe(false);
  });

  it("signs with P1363 output that verifies against the compressed key", async () => {
    const device = await create_guard_device(USER_A, "Pixel 9");
    const pub = await device.public_keys();
    const message = new TextEncoder().encode("approve");
    const signature = await device.sign(message);
    const { p256 } = await import("@noble/curves/nist.js");
    const { sha256 } = await import("@noble/hashes/sha256");

    expect(
      p256.verify(signature, sha256(message), pub.action_pk, {
        prehash: false,
        lowS: false,
      }),
    ).toBe(true);
  });

  it("keeps the action key non-extractable", async () => {
    await create_guard_device(USER_A, "Pixel 9");
    const record = databases.get(GUARD_DB_NAME)!.get(USER_A) as {
      action_key: CryptoKey;
    };

    await expect(
      crypto.subtle.exportKey("pkcs8", record.action_key),
    ).rejects.toBeDefined();
  });

  it("uses a 33-byte compressed action key", async () => {
    const device = await create_guard_device(USER_A, "Pixel 9");
    const { action_pk } = await device.public_keys();

    expect(action_pk.length).toBe(33);
    expect([0x02, 0x03]).toContain(action_pk[0]);
  });

  it("returns null after forget", async () => {
    const device = await create_guard_device(USER_A, "Pixel 9");

    await device.forget();
    expect(await get_guard_device(USER_A)).toBeNull();
  });

  it("returns null without throwing when the wrap key is missing", async () => {
    await create_guard_device(USER_A, "Pixel 9");
    wrap_key_mock.mockRejectedValue(new Error("no wrap key"));
    await expect(get_guard_device(USER_A)).resolves.toBeNull();
    wrap_key_mock.mockResolvedValue(null);
    await expect(get_guard_device(USER_A)).resolves.toBeNull();
  });

  it("never returns another account's record", async () => {
    await create_guard_device(USER_A, "Pixel 9");
    expect(await get_guard_device(USER_B)).toBeNull();
  });

  it("removes the record on sign-out paths", async () => {
    await create_guard_device(USER_A, "Pixel 9");
    await forget_guard_device(USER_A);
    expect(await get_guard_device(USER_A)).toBeNull();

    await create_guard_device(USER_B, "Pixel 9");
    await delete_guard_database();
    expect(await get_guard_device(USER_B)).toBeNull();
  });

  it("removes only the removed account's username hints", async () => {
    await create_guard_device(USER_A, "Pixel 9");
    await write_guard_hint("hash_a", USER_A);
    await write_guard_hint("hash_a2", USER_A);
    await write_guard_hint("hash_b", USER_B);

    await delete_guard_hints_for(USER_A);

    expect(await read_guard_hint("hash_a")).toBeNull();
    expect(await read_guard_hint("hash_a2")).toBeNull();
    expect(await read_guard_hint("hash_b")).toBe(USER_B);
    expect(await get_guard_device(USER_A)).not.toBeNull();
  });

  it("stores the device id", async () => {
    const device = await create_guard_device(USER_A, "Pixel 9");

    expect(await device.device_id()).toBeNull();
    await device.set_device_id(DEVICE_ID);
    const loaded = await get_guard_device(USER_A);

    expect(await loaded!.device_id()).toBe(DEVICE_ID);
  });

  it("opens a seal addressed to the device keys", async () => {
    const device = await create_guard_device(USER_A, "Pixel 9");
    const pub = await device.public_keys();
    const aad = code_secret_aad(DEVICE_ID);
    const secret = crypto.getRandomValues(new Uint8Array(20));
    const sealed = seal_to(secret, aad, pub.mlkem_pk, pub.x25519_pk);
    const opened = await device.open_seal(sealed, aad);

    expect(Array.from(opened)).toEqual(Array.from(secret));
  });
});
