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

import { derive_password_hash } from "./key_manager_pgp_keygen";
import { derive_reset_vault_proof } from "./reset_vault_proof";

const salt_bytes = new Uint8Array(32).map((_, index) => index + 1);
const password_salt = btoa(String.fromCharCode(...salt_bytes));

describe("derive_reset_vault_proof", () => {
  it("sends the proof the account signs in with", async () => {
    const expected = await derive_password_hash("old password", salt_bytes);

    expect(
      await derive_reset_vault_proof("old password", {
        password_salt,
        kdf_version: 2,
      }),
    ).toBe(expected.hash_v2);
    expect(
      await derive_reset_vault_proof("old password", {
        password_salt,
        kdf_version: 1,
      }),
    ).toBe(expected.hash);
  });

  it("differs for another password", async () => {
    const source = { password_salt, kdf_version: 2 };

    expect(await derive_reset_vault_proof("old password", source)).not.toBe(
      await derive_reset_vault_proof("other password", source),
    );
  });

  it("sends nothing when an older server gives no salt", async () => {
    expect(await derive_reset_vault_proof("old password", {})).toBeUndefined();
    expect(await derive_reset_vault_proof("old password", null)).toBeUndefined();
  });

  it("sends nothing without a current password or with an unusable salt", async () => {
    expect(
      await derive_reset_vault_proof("", { password_salt, kdf_version: 2 }),
    ).toBeUndefined();
    expect(
      await derive_reset_vault_proof("old password", {
        password_salt: "AAAA",
        kdf_version: 2,
      }),
    ).toBeUndefined();
  });
});
