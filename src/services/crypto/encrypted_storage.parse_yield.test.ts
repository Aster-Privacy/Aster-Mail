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

const { order } = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
}));
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

    setTimeout(() => order.push("task"), 0);

    return plain;
  },
  decrypt_with_legacy_derived_keys: async () => null,
}));

import { encrypted_get, encrypted_set } from "./encrypted_storage";

const master = {} as CryptoKey;
const original_parse = JSON.parse.bind(JSON);

describe("encrypted_get parse yield", () => {
  beforeEach(() => {
    order.length = 0;
    vi.spyOn(JSON, "parse").mockImplementation((text: string) => {
      order.push("parse");

      return original_parse(text);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((r) => setTimeout(r, 0));
  });

  it("parses a large record in a later task than it was decoded", async () => {
    const value = { text: "x".repeat(300_000) };

    await encrypted_set("large", value, master);

    const read = await encrypted_get<typeof value>("large", master);

    expect(read).toEqual(value);
    expect(order).toEqual(["task", "parse"]);
  });

  it("keeps small records on the same task", async () => {
    const value = { count: 3 };

    await encrypted_set("small", value, master);

    const read = await encrypted_get<typeof value>("small", master);

    expect(read).toEqual(value);
    expect(order).toEqual(["parse"]);

    await new Promise<void>((r) => setTimeout(r, 0));

    expect(order).toEqual(["parse", "task"]);
  });
});
