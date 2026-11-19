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
  accept_recovered_vault,
  is_rolled_back_vault,
  pin_vault_generation,
  read_vault_generation_pin,
  VaultRolledBackError,
} from "@/services/crypto/vault_generation";

const USER_ID = "user-recovered";

function at(generation: number | undefined): EncryptedVault {
  const vault: Record<string, unknown> = {
    identity_key: "identity-a",
    previous_keys: [],
  };

  if (generation !== undefined) vault.vault_generation = generation;

  return vault as unknown as EncryptedVault;
}

function pinned_browser(generation: number): void {
  pin_vault_generation(USER_ID, {
    ...at(generation),
    vault_generation_ready: true,
  } as EncryptedVault);
}

afterEach(() => {
  localStorage.clear();
});

describe("sign-in after a recovery on another app", () => {
  it("accepts a recovered vault below the pin when the server reports a new recovery", () => {
    pinned_browser(40);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, 41),
    ).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
    expect(is_rolled_back_vault(USER_ID, at(25))).toBe(false);
    expect(is_rolled_back_vault(USER_ID, at(24))).toBe(true);
  });

  it("accepts a recovered vault that carries no generation", () => {
    pinned_browser(40);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(undefined), notify, 3),
    ).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
    expect(is_rolled_back_vault(USER_ID, at(undefined))).toBe(false);
  });

  it("still refuses an older vault when the server reports no recovery", () => {
    pinned_browser(40);
    refuse_rolled_back_vault_with_notice(USER_ID, at(40), vi.fn(), 0);

    for (const marker of [undefined, 0, -1, 2 ** 41, Number.NaN, "9"]) {
      const notify = vi.fn();

      expect(() =>
        refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, marker),
      ).toThrow(VaultRolledBackError);
      expect(notify).toHaveBeenCalledTimes(1);
    }
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
  });

  it("refuses a second older vault under a recovery it already accepted", () => {
    pinned_browser(40);
    refuse_rolled_back_vault_with_notice(USER_ID, at(25), vi.fn(), 41);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(10), notify, 41),
    ).toThrow(VaultRolledBackError);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
  });

  it("refuses an older vault under a recovery seen before the pin moved", () => {
    pinned_browser(20);
    refuse_rolled_back_vault_with_notice(USER_ID, at(20), vi.fn(), 5);
    pinned_browser(40);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, 5),
    ).toThrow(VaultRolledBackError);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("takes the server vault when the pin predates the first recovery report", () => {
    pinned_browser(40);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, 0),
    ).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
  });

  it("refuses an older vault after the first recovery report", () => {
    pinned_browser(40);
    refuse_rolled_back_vault_with_notice(USER_ID, at(25), vi.fn(), 0);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(10), notify, 0),
    ).toThrow(VaultRolledBackError);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
  });

  it("refuses an older vault when the first report came before the pin moved", () => {
    pinned_browser(20);
    refuse_rolled_back_vault_with_notice(USER_ID, at(20), vi.fn(), 0);
    pinned_browser(40);
    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, 0),
    ).toThrow(VaultRolledBackError);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
  });

  it("does not treat a malformed count as a first report", () => {
    pinned_browser(40);

    for (const marker of [undefined, null, -1, 2 ** 41, Number.NaN, 1.5, "0"]) {
      const notify = vi.fn();

      expect(() =>
        refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, marker),
      ).toThrow(VaultRolledBackError);
      expect(notify).toHaveBeenCalledTimes(1);
    }
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
  });

  it("keeps refusing when the first report cannot be read", () => {
    pinned_browser(40);
    const real = localStorage;

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => {
        if (key.startsWith("astermail_vault_recovery_reported_")) {
          throw new Error("blocked");
        }

        return real.getItem(key);
      },
      setItem: (key: string, value: string) => real.setItem(key, value),
      removeItem: (key: string) => real.removeItem(key),
    });
    const notify = vi.fn();

    try {
      expect(() =>
        refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, 0),
      ).toThrow(VaultRolledBackError);
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
  });

  it("takes a later recovery after a sign-in lowers an oversized report", () => {
    pinned_browser(40);
    refuse_rolled_back_vault_with_notice(USER_ID, at(40), vi.fn(), 2 ** 39);
    const lowered = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), lowered, 5),
    ).toThrow(VaultRolledBackError);
    expect(lowered).toHaveBeenCalledTimes(1);
    expect(read_vault_generation_pin(USER_ID)).toBe(40);

    const notify = vi.fn();

    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), notify, 6),
    ).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
    expect(read_vault_generation_pin(USER_ID)).toBe(25);
  });

  it("does not lower the report from a vault refresh", () => {
    pinned_browser(40);
    refuse_rolled_back_vault_with_notice(USER_ID, at(40), vi.fn(), 2 ** 39);

    expect(accept_recovered_vault(USER_ID, at(25), 5)).toBe(false);
    expect(accept_recovered_vault(USER_ID, at(25), 6)).toBe(false);
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
  });

  it("does not lower the report from a malformed count", () => {
    pinned_browser(40);
    refuse_rolled_back_vault_with_notice(USER_ID, at(40), vi.fn(), 2 ** 39);

    for (const marker of [undefined, -1, 2 ** 41, Number.NaN, "5"]) {
      expect(() =>
        refuse_rolled_back_vault_with_notice(USER_ID, at(25), vi.fn(), marker),
      ).toThrow(VaultRolledBackError);
    }
    expect(() =>
      refuse_rolled_back_vault_with_notice(USER_ID, at(25), vi.fn(), 6),
    ).toThrow(VaultRolledBackError);
    expect(read_vault_generation_pin(USER_ID)).toBe(40);
  });
});
