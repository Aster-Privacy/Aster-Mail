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
import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";

import { is_known_bad_key, is_publishable_armored_key } from "./pgp_key_policy";

type GenerateOptions = Omit<
  Parameters<typeof openpgp.generateKey>[0],
  "userIDs" | "format"
>;

async function generate(options: GenerateOptions): Promise<openpgp.PrivateKey> {
  const { privateKey } = await openpgp.generateKey({
    ...options,
    userIDs: [{ name: "test_user", email: "test_user@aster.cx" }],
    format: "object",
  });

  return privateKey;
}

describe("pgp_key_policy", () => {
  it("accepts a v4 key using the legacy algorithm IDs", async () => {
    const key = await generate({ type: "ecc", curve: "ed25519Legacy" });

    expect(is_known_bad_key(key)).toBe(false);
    expect(await is_publishable_armored_key(key.toPublic().armor())).toBe(true);
  });

  it("rejects a v4 key using the modern algorithm IDs", async () => {
    const key = await generate({
      type: "curve25519",
      config: { v6Keys: false },
    });

    expect(is_known_bad_key(key)).toBe(true);
    expect(await is_publishable_armored_key(key.toPublic().armor())).toBe(
      false,
    );
  });

  it("accepts a v6 key using the modern algorithm IDs", async () => {
    const key = await generate({
      type: "curve25519",
      config: { v6Keys: true },
    });

    expect(is_known_bad_key(key)).toBe(false);
    expect(await is_publishable_armored_key(key.toPublic().armor())).toBe(true);
  });

  it("accepts an unparseable key rather than blocking on it", async () => {
    expect(await is_publishable_armored_key("not-a-pgp-key")).toBe(true);
  });
});
