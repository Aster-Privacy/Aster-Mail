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
import { describe, expect, it } from "vitest";

import {
  derive_secure_view_key,
  is_supported_secure_view_kdf,
  type SecureViewPasswordKdf,
} from "./secure_view_key";

const TYPED_SECRET = "correct horse battery";
const SALT = "AQIDBAUGBwgJCgsMDQ4PEA==";

function kdf(
  overrides: Partial<SecureViewPasswordKdf>,
): SecureViewPasswordKdf {
  return {
    algorithm: "argon2id",
    version: 19,
    memory_kib: 64,
    iterations: 2,
    parallelism: 1,
    key_length: 32,
    salt: SALT,
    ...overrides,
  };
}

describe("secure view key derivation", () => {
  it("matches the reference value for small parameters", async () => {
    expect(await derive_secure_view_key(TYPED_SECRET, kdf({}))).toBe(
      "RHMEBJm89W5fy5dc04qOLv8f2OjzvX6xYoN36VxakqE=",
    );
  });

  it("matches the reference value for the parameters the service uses", async () => {
    expect(
      await derive_secure_view_key(
        TYPED_SECRET,
        kdf({ memory_kib: 65536, iterations: 3, parallelism: 4 }),
      ),
    ).toBe("Ic1/PQ2o0+dpelgtqPJnxTDg0pKz8INUMAtcUH3qRb8=");
  }, 60000);

  it("accepts a salt without padding", async () => {
    expect(
      await derive_secure_view_key(
        TYPED_SECRET,
        kdf({ salt: "AQIDBAUGBwgJCgsMDQ4PEA" }),
      ),
    ).toBe("RHMEBJm89W5fy5dc04qOLv8f2OjzvX6xYoN36VxakqE=");
  });

  it("gives a different key for a different entry", async () => {
    const first = await derive_secure_view_key(TYPED_SECRET, kdf({}));
    const second = await derive_secure_view_key(`${TYPED_SECRET} `, kdf({}));

    expect(second).not.toBe(first);
    expect(second).toHaveLength(44);
  });

  it("never returns what was typed", async () => {
    const key = await derive_secure_view_key(TYPED_SECRET, kdf({}));

    expect(key).not.toContain(TYPED_SECRET);
    expect(atob(key)).not.toContain(TYPED_SECRET);
  });

  it.each([
    ["an unknown algorithm", { algorithm: "argon2i" }],
    ["an unknown version", { version: 16 }],
    ["a different key length", { key_length: 16 }],
    ["too little memory", { memory_kib: 4 }],
    ["memory below the lane minimum", { memory_kib: 16, parallelism: 4 }],
    ["too much memory", { memory_kib: 4194304 }],
    ["zero iterations", { iterations: 0 }],
    ["too many iterations", { iterations: 1000 }],
    ["zero lanes", { parallelism: 0 }],
    ["a fractional cost", { iterations: 2.5 }],
    ["an empty salt", { salt: "" }],
  ])("refuses %s", async (_label, overrides) => {
    const params = kdf(overrides as Partial<SecureViewPasswordKdf>);

    expect(is_supported_secure_view_kdf(params)).toBe(false);
    await expect(derive_secure_view_key(TYPED_SECRET, params)).rejects.toThrow(
      "secure_view_kdf_unsupported",
    );
  });

  it("refuses a salt that is too short", async () => {
    await expect(
      derive_secure_view_key(TYPED_SECRET, kdf({ salt: "AQID" })),
    ).rejects.toThrow("secure_view_kdf_unsupported");
  });

  it("treats missing parameters as unsupported", () => {
    expect(is_supported_secure_view_kdf(undefined)).toBe(false);
    expect(is_supported_secure_view_kdf(null)).toBe(false);
    expect(is_supported_secure_view_kdf(kdf({}))).toBe(true);
  });
});
