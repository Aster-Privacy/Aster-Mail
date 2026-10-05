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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { wiped, decrypted } = vi.hoisted(() => ({
  wiped: [] as Uint8Array[],
  decrypted: [] as Uint8Array[],
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
}));
vi.mock("@/services/crypto/secure_memory", async (load) => {
  const actual = await load<typeof import("./secure_memory")>();

  return {
    ...actual,
    zero_uint8_array: (arr: Uint8Array) => {
      wiped.push(arr);
      actual.zero_uint8_array(arr);
    },
  };
});
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: async (
    key: CryptoKey,
    ciphertext: BufferSource,
    iv: BufferSource,
  ) => {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    decrypted.push(new Uint8Array(plain));

    return plain;
  },
  decrypt_with_legacy_derived_keys: async () => null,
}));

import { encrypted_get, encrypted_set } from "./encrypted_storage";

const master = {} as CryptoKey;

describe("encrypted storage wipes its plaintext buffers", () => {
  beforeEach(() => {
    wiped.length = 0;
    decrypted.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("zeroes the decrypted buffer after decoding a large record", async () => {
    const value = { text: "x".repeat(300_000) };
    const random = vi.spyOn(crypto, "getRandomValues");

    await encrypted_set("large", value, master);

    const encoded_length = new TextEncoder().encode(
      JSON.stringify(value),
    ).length;
    const set_wipes = wiped.filter((arr) => arr.length === encoded_length);

    expect(set_wipes.length).toBe(1);
    expect(set_wipes[0].every((b) => b === 0)).toBe(true);

    random.mockClear();

    const read = await encrypted_get<typeof value>("large", master);

    expect(read).toEqual(value);
    expect(decrypted.length).toBe(1);
    expect(decrypted[0].length).toBe(encoded_length);
    expect(decrypted[0].every((b) => b === 0)).toBe(true);
    expect(random).not.toHaveBeenCalled();
  });

  it("round-trips a nested record unchanged", async () => {
    const value = {
      items: Array.from({ length: 500 }, (_, i) => ({
        id: `m${i}`,
        subject: `subject ${i} éàü`,
      })),
    };

    await encrypted_set("nested", value, master);

    expect(await encrypted_get("nested", master)).toEqual(value);
  });
});
