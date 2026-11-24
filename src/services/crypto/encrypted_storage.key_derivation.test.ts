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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
}));

import { encrypted_get, encrypted_set } from "./encrypted_storage";

interface RawEntry {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

function read_raw(key: string): Promise<RawEntry> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("astermail_secure_db", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db
        .transaction("encrypted_data", "readonly")
        .objectStore("encrypted_data")
        .get(key);

      get.onsuccess = () => {
        db.close();
        resolve(get.result as RawEntry);
      };
      get.onerror = () => reject(get.error);
    };
  });
}

async function vault_storage_key(purpose: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).fill(7),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`astermail_encrypted_storage_${purpose}`),
      info: encoder.encode("aes-gcm-key"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function unrelated_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

describe("encrypted storage key derivation", () => {
  it("seals every entry under the vault derived key for its name", async () => {
    await encrypted_set("derivation-pin", { n: 1 }, await unrelated_key());

    const raw = await read_raw("derivation-pin");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.iv },
      await vault_storage_key("derivation-pin"),
      raw.ciphertext,
    );

    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ n: 1 });
  });

  it("reads an entry back whatever key the caller hands in", async () => {
    await encrypted_set("derivation-any", { n: 2 }, await unrelated_key());

    expect(
      await encrypted_get("derivation-any", await unrelated_key()),
    ).toEqual({ n: 2 });
  });
});
