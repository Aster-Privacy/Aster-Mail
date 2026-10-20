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

import { generate_identity_keypair } from "@/services/crypto/key_manager";

async function user_emails(armored: string): Promise<(string | undefined)[]> {
  const key = await openpgp.readKey({ armoredKey: armored });

  return key.users.map((user) => user.userID?.email);
}

describe("generate_identity_keypair user IDs", () => {
  it("puts the dotted address first and keeps the dot-free form", async () => {
    const keypair = await generate_identity_keypair(
      "murati.balazs",
      "murati.balazs@astermail.org",
      "a long test password",
    );

    expect(await user_emails(keypair.public_key)).toEqual([
      "murati.balazs@astermail.org",
      "muratibalazs@astermail.org",
    ]);

    const key = await openpgp.readKey({ armoredKey: keypair.public_key });
    const primary = await key.getPrimaryUser();

    expect(primary.user.userID?.email).toBe("murati.balazs@astermail.org");
  });

  it("keeps one user ID for an address without dots", async () => {
    const keypair = await generate_identity_keypair(
      "alice",
      "alice@astermail.org",
      "a long test password",
    );

    expect(await user_emails(keypair.public_key)).toEqual([
      "alice@astermail.org",
    ]);
  });

  it("keeps one user ID on a custom domain", async () => {
    const keypair = await generate_identity_keypair(
      "Jo",
      "first.last@example.com",
      "a long test password",
    );

    expect(await user_emails(keypair.public_key)).toEqual([
      "first.last@example.com",
    ]);
  });
});
