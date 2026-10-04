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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, beforeEach } from "vitest";

const SHIM_SOURCE = readFileSync(
  resolve(process.cwd(), "public/tauri-crypto-shim.js"),
  "utf-8",
);

interface ShimmedSubtle {
  importKey: (...args: unknown[]) => Promise<Record<string, unknown>>;
  generateKey: (...args: unknown[]) => Promise<Record<string, unknown>>;
  exportKey: (...args: unknown[]) => Promise<ArrayBuffer>;
  deriveBits: (...args: unknown[]) => Promise<ArrayBuffer>;
  deriveKey: (...args: unknown[]) => Promise<Record<string, unknown>>;
  encrypt: (...args: unknown[]) => Promise<ArrayBuffer>;
  decrypt: (...args: unknown[]) => Promise<ArrayBuffer>;
  sign: (...args: unknown[]) => Promise<ArrayBuffer>;
  verify: (...args: unknown[]) => Promise<boolean>;
  digest: (...args: unknown[]) => Promise<ArrayBuffer>;
}

const fake_mac = (key: number[], data: number[]) =>
  data.map((byte, index) => byte ^ key[index % key.length]);

function load_shim(): { subtle: ShimmedSubtle; calls: string[] } {
  const calls: string[] = [];
  const native = async () => {
    throw new Error("native");
  };
  const subtle = {
    importKey: native,
    generateKey: native,
    exportKey: native,
    deriveBits: native,
    deriveKey: native,
    encrypt: native,
    decrypt: native,
    sign: native,
    verify: native,
    digest: native,
  };
  const fake_window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd: string, args: Record<string, number[]>) => {
        calls.push(cmd);
        if (cmd === "crypto_hmac_sign") return fake_mac(args.key, args.data);
        if (cmd === "crypto_pbkdf2") return [1, 2, 3, 4];

        return args.data;
      },
    },
  };
  const fake_crypto = {
    subtle,
    getRandomValues: (array: Uint8Array) => array.fill(7),
  };
  const run = new Function("window", "navigator", "crypto", SHIM_SOURCE);

  run(fake_window, { userAgent: "Mozilla/5.0 (Macintosh)" }, fake_crypto);

  return { subtle: subtle as unknown as ShimmedSubtle, calls };
}

const RAW = new Uint8Array(32).fill(9);
const IV = { name: "AES-GCM", iv: new Uint8Array(12) };

describe("desktop crypto shim key rules", () => {
  let shim: ReturnType<typeof load_shim>;

  beforeEach(() => {
    shim = load_shim();
  });

  it("keeps a non-extractable key non-extractable", async () => {
    const key = await shim.subtle.importKey("raw", RAW, "AES-GCM", false, [
      "encrypt",
    ]);

    expect(() => {
      "use strict";
      key.extractable = true;
    }).toThrow();
    expect(key.extractable).toBe(false);
    expect(Object.isFrozen(key.usages)).toBe(true);
    await expect(shim.subtle.exportKey("raw", key)).rejects.toThrow(
      "not extractable",
    );
  });

  it("exports an extractable key", async () => {
    const key = await shim.subtle.importKey("raw", RAW, "AES-GCM", true, [
      "encrypt",
    ]);
    const exported = new Uint8Array(await shim.subtle.exportKey("raw", key));

    expect(Array.from(exported)).toEqual(Array.from(RAW));
  });

  it("refuses an operation the key was not created for", async () => {
    const key = await shim.subtle.importKey("raw", RAW, "AES-GCM", false, [
      "encrypt",
    ]);

    await expect(
      shim.subtle.encrypt(IV, key, new Uint8Array(4)),
    ).resolves.toBeInstanceOf(ArrayBuffer);
    await expect(
      shim.subtle.decrypt(IV, key, new Uint8Array(4)),
    ).rejects.toThrow("decrypt");
    await expect(
      shim.subtle.sign("HMAC", key, new Uint8Array(4)),
    ).rejects.toThrow("sign");
    expect(shim.calls).toEqual(["crypto_aes_gcm_encrypt"]);
  });

  it("refuses a key used with a different algorithm", async () => {
    const key = await shim.subtle.importKey(
      "raw",
      RAW,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "encrypt"],
    );

    await expect(
      shim.subtle.encrypt(IV, key, new Uint8Array(4)),
    ).rejects.toThrow("encrypt");
  });

  it("verifies an HMAC and rejects a wrong one", async () => {
    const key = await shim.subtle.importKey(
      "raw",
      RAW,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const data = new Uint8Array([1, 2, 3]);
    const mac = await shim.subtle.sign("HMAC", key, data);

    await expect(shim.subtle.verify("HMAC", key, mac, data)).resolves.toBe(
      true,
    );
    const tampered = new Uint8Array(mac);

    tampered[0] ^= 1;
    await expect(shim.subtle.verify("HMAC", key, tampered, data)).resolves.toBe(
      false,
    );
    await expect(
      shim.subtle.verify("HMAC", key, new Uint8Array(1), data),
    ).resolves.toBe(false);
  });

  it("needs the matching usage to derive", async () => {
    const pbkdf2 = {
      name: "PBKDF2",
      salt: new Uint8Array(4),
      iterations: 1,
      hash: "SHA-256",
    };
    const bits_only = await shim.subtle.importKey("raw", RAW, "PBKDF2", false, [
      "deriveBits",
    ]);

    await expect(
      shim.subtle.deriveBits(pbkdf2, bits_only, 32),
    ).resolves.toBeInstanceOf(ArrayBuffer);
    await expect(
      shim.subtle.deriveKey(pbkdf2, bits_only, IV, false, ["encrypt"]),
    ).rejects.toThrow("deriveKey");

    const key_only = await shim.subtle.importKey("raw", RAW, "PBKDF2", true, [
      "deriveKey",
    ]);

    expect(key_only.extractable).toBe(false);
    await expect(shim.subtle.deriveBits(pbkdf2, key_only, 32)).rejects.toThrow(
      "deriveBits",
    );
    const derived = await shim.subtle.deriveKey(
      pbkdf2,
      key_only,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );

    expect(derived.usages).toEqual(["encrypt"]);
  });

  it("does not hand a stolen key shape to the native bridge", async () => {
    const forged = {
      type: "secret",
      algorithm: { name: "AES-GCM" },
      extractable: true,
      usages: ["encrypt", "decrypt"],
    };

    await expect(shim.subtle.exportKey("raw", forged)).rejects.toThrow(
      "native",
    );
    expect(shim.calls).toEqual([]);
  });
});
