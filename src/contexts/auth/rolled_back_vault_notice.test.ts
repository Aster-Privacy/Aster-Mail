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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { afterEach, describe, expect, it, vi } from "vitest";

import { refuse_rolled_back_vault_with_notice } from "./rolled_back_vault_notice";

import {
  pin_vault_generation,
  VaultRolledBackError,
} from "@/services/crypto/vault_generation";

const USER_ID = "user-notice";

function at(generation: number): EncryptedVault {
  return {
    identity_key: "identity-a",
    previous_keys: [],
    vault_generation: generation,
  } as unknown as EncryptedVault;
}

afterEach(() => {
  localStorage.clear();
});

describe("refused older vault at sign-in", () => {
  it("tells the person why and still refuses the older vault", () => {
    pin_vault_generation(USER_ID, at(7));
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(3), notify),
    ).toThrow(VaultRolledBackError);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for a vault at or above the pinned generation", () => {
    pin_vault_generation(USER_ID, at(7));
    const notify = vi.fn();

    refuse_rolled_back_vault_with_notice(USER_ID, at(7), notify);
    refuse_rolled_back_vault_with_notice(USER_ID, at(9), notify);

    expect(notify).not.toHaveBeenCalled();
  });
});
