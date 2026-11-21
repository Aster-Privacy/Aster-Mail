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
import type { EncryptedVault } from "./key_manager_core";

import { afterEach, describe, expect, it } from "vitest";

import {
  apply_generation_markers,
  is_rolled_back_vault,
  pin_vault_generation,
  read_vault_generation_pin,
} from "./vault_generation";

const USER_ID = "user-generation";

function at(
  generation?: number,
  identity_key = "identity-a",
  previous_keys: string[] = [],
): EncryptedVault {
  return {
    vault_generation: generation,
    identity_key,
    previous_keys,
  } as EncryptedVault;
}

afterEach(() => {
  localStorage.clear();
});

describe("vault generation pin", () => {
  it("never lowers the pin when an older vault is stored", () => {
    pin_vault_generation(USER_ID, at(7));
    pin_vault_generation(USER_ID, at(3));
    pin_vault_generation(USER_ID, at());

    expect(read_vault_generation_pin(USER_ID)).toBe(7);
    expect(is_rolled_back_vault(USER_ID, at(3))).toBe(true);
  });

  it("accepts the pinned generation and newer ones", () => {
    pin_vault_generation(USER_ID, at(4));

    expect(is_rolled_back_vault(USER_ID, at(4))).toBe(false);
    expect(is_rolled_back_vault(USER_ID, at(5))).toBe(false);
  });

  it("accepts a vault written by a client that does not track generations", () => {
    pin_vault_generation(USER_ID, at(4));

    expect(is_rolled_back_vault(USER_ID, at())).toBe(false);

    pin_vault_generation(USER_ID, at());

    expect(read_vault_generation_pin(USER_ID)).toBe(4);
    expect(is_rolled_back_vault(USER_ID, at(2))).toBe(true);
  });

  it("refuses a vault without a generation once the vault is marked ready", () => {
    pin_vault_generation(USER_ID, {
      ...at(4),
      vault_generation_ready: true,
    } as EncryptedVault);

    expect(is_rolled_back_vault(USER_ID, at())).toBe(true);
    expect(is_rolled_back_vault(USER_ID, at(0))).toBe(true);
  });

  it("carries the ready marker and replaced identities into the next write", () => {
    pin_vault_generation(USER_ID, {
      ...at(4),
      vault_generation_ready: true,
    } as EncryptedVault);
    pin_vault_generation(USER_ID, at(undefined, "identity-b"));

    const written = at(1, "identity-b");

    apply_generation_markers(USER_ID, written, at(undefined, "identity-b"));

    expect(written.vault_generation_ready).toBe(true);
    expect(written.retired_identity_fingerprints?.length).toBe(1);

    localStorage.clear();
    pin_vault_generation(USER_ID, written);

    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      true,
    );
    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-b"))).toBe(
      true,
    );
    expect(is_rolled_back_vault(USER_ID, at(1, "identity-b"))).toBe(false);
  });

  it("accepts a vault created by a reset with new keys", () => {
    pin_vault_generation(USER_ID, at(4));

    const reset = at(undefined, "identity-b");

    expect(is_rolled_back_vault(USER_ID, reset)).toBe(false);

    pin_vault_generation(USER_ID, reset);

    expect(read_vault_generation_pin(USER_ID)).toBe(0);
    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-a"))).toBe(
      true,
    );
  });

  it("refuses an older vault holding an identity the account rotated away from", () => {
    pin_vault_generation(USER_ID, at(6, "identity-c", ["identity-old"]));

    expect(is_rolled_back_vault(USER_ID, at(undefined, "identity-old"))).toBe(
      true,
    );
    expect(is_rolled_back_vault(USER_ID, at(2, "identity-new"))).toBe(true);
  });

  it("accepts a vault without a generation before one is pinned", () => {
    expect(is_rolled_back_vault(USER_ID, at())).toBe(false);

    pin_vault_generation(USER_ID, at());

    expect(read_vault_generation_pin(USER_ID)).toBe(0);
  });
});
