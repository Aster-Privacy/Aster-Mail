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

let wrap_key: CryptoKey | null = null;

vi.mock("./device_key_store", () => ({
  get_device_wrap_key: vi.fn(async () => wrap_key),
  clear_device_wrap_key_cache: vi.fn(),
  delete_device_wrap_key: vi.fn(async () => undefined),
}));

const KEY = "astermail_device_fallback_probe";
const SECRET = "refresh-token-value";

async function load() {
  vi.resetModules();

  return import("./secure_storage");
}

async function rebuild_candidate_keys(): Promise<CryptoKey[]> {
  const stored_values = Object.keys(localStorage)
    .map((name) => localStorage.getItem(name) ?? "")
    .filter((value) => value.length > 0);
  const candidates: CryptoKey[] = [];

  for (const id of stored_values) {
    for (const salt of stored_values) {
      let salt_bytes: Uint8Array;

      try {
        salt_bytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
      } catch {
        continue;
      }
      const material = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(id),
        "PBKDF2",
        false,
        ["deriveKey"],
      );

      candidates.push(
        await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: salt_bytes,
            iterations: 100000,
            hash: "SHA-256",
          },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        ),
      );
    }
  }

  return candidates;
}

async function readable_from_storage_alone(stored: string): Promise<boolean> {
  const payload = JSON.parse(stored) as { n: string; c: string };
  const nonce = Uint8Array.from(atob(payload.n), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(payload.c), (c) => c.charCodeAt(0));
  const keys = await rebuild_candidate_keys();

  for (const key of keys) {
    try {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);

      return true;
    } catch {
      continue;
    }
  }

  return false;
}

describe("device storage without a device-bound key", () => {
  beforeEach(() => {
    localStorage.clear();
    wrap_key = null;
  });

  it("does not write a secret that local storage alone can decrypt", async () => {
    const { device_store, device_encrypt } = await load();

    await device_store(KEY, { secret: SECRET });
    expect(await readable_from_storage_alone(localStorage.getItem(KEY)!)).toBe(
      false,
    );
    expect(await readable_from_storage_alone(await device_encrypt(SECRET))).toBe(
      false,
    );
  });

  it("reads the value back while the page stays open", async () => {
    const { device_store, device_retrieve_strict, device_encrypt, device_decrypt } =
      await load();

    await device_store(KEY, { secret: SECRET });
    expect(await device_retrieve_strict(KEY)).toEqual({ secret: SECRET });
    expect(await device_decrypt(await device_encrypt(SECRET))).toBe(SECRET);
  });

  it("cannot read the value after a reload", async () => {
    const first = await load();

    await first.device_store(KEY, { secret: SECRET });

    const second = await load();

    await expect(second.device_retrieve_strict(KEY)).rejects.toMatchObject({
      code: "missing_key",
    });
    expect(await second.device_retrieve(KEY)).toBeNull();
  });

  it("cannot read the value after the cache is cleared", async () => {
    const storage = await load();

    await storage.device_store(KEY, { secret: SECRET });
    storage.clear_device_encryption_cache();

    expect(await storage.device_retrieve(KEY)).toBeNull();
  });

  it("keeps a redacted value across a reload", async () => {
    const first = await load();

    await first.device_store(KEY, { secret: SECRET, name: "n" }, (value) => ({
      name: value.name,
    }));
    expect(localStorage.getItem(KEY)).not.toContain(SECRET);

    const second = await load();

    expect(await second.device_retrieve_strict(KEY)).toEqual({ name: "n" });
    expect(await readable_from_storage_alone(localStorage.getItem(KEY)!)).toBe(
      true,
    );
  });

  it("still reads an entry written by an earlier version", async () => {
    const first = await load();

    await first.device_store(KEY, { name: "old" }, (value) => value);

    const second = await load();

    expect(await second.device_retrieve_strict(KEY)).toEqual({ name: "old" });
  });

  it("uses the device-bound key as soon as one exists", async () => {
    const storage = await load();

    wrap_key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await storage.device_store(KEY, { secret: SECRET });

    const reloaded = await load();

    expect(await reloaded.device_retrieve_strict(KEY)).toEqual({
      secret: SECRET,
    });
    expect(JSON.parse(localStorage.getItem(KEY)!).v).toBe(2);
  });
});
