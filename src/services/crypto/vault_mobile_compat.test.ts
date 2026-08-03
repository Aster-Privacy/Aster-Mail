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

import {
  normalize_vault_fields,
  type EncryptedVault,
} from "@/services/crypto/key_manager";

const ARMORED_KEY =
  "-----BEGIN PGP PRIVATE KEY BLOCK-----\nxVgEZ...\n-----END PGP PRIVATE KEY BLOCK-----";

describe("normalize_vault_fields (mobile vault compat)", () => {
  it("maps pgp_private_key to identity_key when identity_key is absent", () => {
    const vault = {
      pgp_private_key: ARMORED_KEY,
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBe(ARMORED_KEY);
  });

  it("keeps an existing identity_key untouched", () => {
    const vault = {
      identity_key: "existing",
      pgp_private_key: ARMORED_KEY,
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBe("existing");
  });

  it("ignores pgp_private_key values that are not armored PGP keys", () => {
    const vault = {
      pgp_private_key: "not-a-key",
    } as unknown as EncryptedVault;

    const normalized = normalize_vault_fields(vault);

    expect(normalized.identity_key).toBeUndefined();
  });
});
