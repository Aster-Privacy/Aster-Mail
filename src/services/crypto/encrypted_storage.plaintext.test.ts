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

import {
  encrypted_get,
  encrypted_set,
  encrypted_set_plaintext,
} from "./encrypted_storage";

const master = {} as CryptoKey;

describe("encrypted_set_plaintext", () => {
  it("stores bytes that encrypted_get reads back and zeroes the plaintext", async () => {
    const value = { items: [{ id: "a", label: "caf\u00e9" }], entries: [] };
    const plaintext = new TextEncoder().encode(JSON.stringify(value));

    await encrypted_set_plaintext("plaintext-roundtrip", plaintext, master);

    expect(plaintext.every((byte) => byte === 0)).toBe(true);
    expect(await encrypted_get("plaintext-roundtrip", master)).toEqual(value);
  });

  it("reads back the same value as encrypted_set", async () => {
    const value = { total: 3, flags: [true, false], name: "report" };

    await encrypted_set("via-value", value, master);
    await encrypted_set_plaintext(
      "via-bytes",
      new TextEncoder().encode(JSON.stringify(value)),
      master,
    );

    expect(await encrypted_get("via-bytes", master)).toEqual(
      await encrypted_get("via-value", master),
    );
  });
});
