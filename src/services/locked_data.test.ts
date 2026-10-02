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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  inactive: [] as { id: string }[] | null,
  current: "current password" as string | null,
  restored: 0,
  wrong_password: false,
  restore_error: null as Error | null,
  restore_calls: [] as string[],
  conversion: null as Record<string, number> | null,
  conversion_calls: [] as string[],
  reseal: { checked: 0, rewritten: 0, unreadable: 0, failed: 0 },
  reseal_calls: [] as [string, string][],
  code_restored: { restored: 0, incomplete: 0 },
  code_error: null as Error | null,
  code_calls: [] as string[],
}));

vi.mock("./api/recovery", () => ({
  list_inactive_key_sets: async () =>
    h.inactive === null
      ? { error: "offline" }
      : { data: { inactive_key_sets: h.inactive } },
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => h.current,
}));

vi.mock("./crypto/restore_inactive_keys", () => ({
  RECOVERY_CODE_RATE_LIMITED: "recovery_code_rate_limited",
  restore_inactive_key_sets_with_code: async (code: string) => {
    h.code_calls.push(code);
    if (h.code_error) throw h.code_error;

    return h.code_restored;
  },
  restore_inactive_key_sets: async (password: string) => {
    h.restore_calls.push(password);
    if (h.restore_error) throw h.restore_error;

    return {
      restored: h.restored,
      incomplete: 0,
      wrong_password: h.wrong_password,
    };
  },
}));

vi.mock("./account_data_conversion", () => ({
  recover_sent_mail_with_password: async (_id: string, password: string) => {
    h.conversion_calls.push(password);

    return h.conversion;
  },
}));

vi.mock("./sent_mail_reseal", () => ({
  reencrypt_all_sent_mail: async (old_password: string, next: string) => {
    h.reseal_calls.push([old_password, next]);

    return h.reseal;
  },
}));

import {
  get_locked_data_status,
  has_locked_data,
  recover_locked_data,
  recover_locked_data_with_code,
} from "./locked_data";
import {
  LOCKED_DATA_CHANGED_EVENT,
  read_locked_sent_mail,
  write_locked_sent_mail,
} from "./locked_sent_mail_store";

function summary(overrides: Record<string, number> = {}) {
  return { converted: 0, skipped: 0, unreadable: 0, failed: 0, ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  h.inactive = [];
  h.current = "current password";
  h.restored = 0;
  h.wrong_password = false;
  h.restore_error = null;
  h.restore_calls = [];
  h.conversion = null;
  h.conversion_calls = [];
  h.reseal = { checked: 0, rewritten: 0, unreadable: 0, failed: 0 };
  h.reseal_calls = [];
  h.code_restored = { restored: 0, incomplete: 0 };
  h.code_error = null;
  h.code_calls = [];
});

describe("locked data status", () => {
  it("reports nothing locked for a clean account", async () => {
    const status = await get_locked_data_status("account-1");

    expect(status).toEqual({
      inactive_key_sets: 0,
      locked_sent_mail: 0,
      signature: "|",
    });
    expect(has_locked_data(status)).toBe(false);
  });

  it("builds a stable signature from sorted key set ids and locked mail", async () => {
    h.inactive = [{ id: "b" }, { id: "a" }, { id: "" }];
    write_locked_sent_mail("account-1", 2);

    const status = await get_locked_data_status("account-1");

    expect(status?.inactive_key_sets).toBe(2);
    expect(status?.locked_sent_mail).toBe(2);
    expect(status?.signature).toBe("a,b|sent");
    expect(has_locked_data(status)).toBe(true);
  });

  it("changes the signature when another key set is archived", async () => {
    h.inactive = [{ id: "a" }];
    const first = await get_locked_data_status("account-1");

    h.inactive = [{ id: "a" }, { id: "c" }];
    const second = await get_locked_data_status("account-1");

    expect(first?.signature).not.toBe(second?.signature);
  });

  it("returns null when the list cannot be loaded or there is no account", async () => {
    expect(await get_locked_data_status("")).toBeNull();

    h.inactive = null;
    expect(await get_locked_data_status("account-1")).toBeNull();
    expect(has_locked_data(null)).toBe(false);
  });
});

describe("recovering locked data", () => {
  it("does nothing without an account or a password", async () => {
    expect(await recover_locked_data("", "old")).toEqual({
      restored_key_sets: 0,
      recovered_sent_mail: 0,
      failed: false,
      incomplete: false,
      rate_limited: false,
      wrong_password: false,
    });
    await recover_locked_data("account-1", "");

    expect(h.restore_calls).toEqual([]);
    expect(h.conversion_calls).toEqual([]);
  });

  it("reports a password that opens no archive", async () => {
    h.wrong_password = true;

    const result = await recover_locked_data("account-1", "not the old one");

    expect(result.wrong_password).toBe(true);
    expect(result.restored_key_sets).toBe(0);
    expect(result.failed).toBe(false);
  });

  it("restores key sets and converts sent mail with the old password", async () => {
    h.restored = 1;
    h.conversion = summary({ converted: 4 });

    const result = await recover_locked_data("account-1", "old password");

    expect(result).toEqual({
      restored_key_sets: 1,
      recovered_sent_mail: 4,
      failed: false,
      incomplete: false,
      rate_limited: false,
      wrong_password: false,
    });
    expect(h.restore_calls).toEqual(["old password"]);
    expect(h.conversion_calls).toEqual(["old password"]);
    expect(h.reseal_calls).toEqual([]);
  });

  it("never rewrites sent mail when the typed password is the current one", async () => {
    const result = await recover_locked_data("account-1", "current password");

    expect(result.failed).toBe(false);
    expect(h.conversion_calls).toEqual([]);
    expect(h.reseal_calls).toEqual([]);
  });

  it("falls back to the legacy reseal while conversion is off", async () => {
    write_locked_sent_mail("account-1", 3);
    h.reseal = { checked: 3, rewritten: 2, unreadable: 1, failed: 0 };

    const result = await recover_locked_data("account-1", "old password");

    expect(h.reseal_calls).toEqual([["old password", "current password"]]);
    expect(result.recovered_sent_mail).toBe(2);
    expect(result.failed).toBe(false);
    expect(read_locked_sent_mail("account-1")).toBe(1);
  });

  it("reports failure when the account is locked", async () => {
    h.current = null;

    const result = await recover_locked_data("account-1", "old password");

    expect(result.failed).toBe(true);
    expect(h.reseal_calls).toEqual([]);
  });

  it("still recovers sent mail when restoring key sets throws", async () => {
    h.restore_error = new Error("network");
    h.conversion = summary({ converted: 1 });

    const result = await recover_locked_data("account-1", "old password");

    expect(result.failed).toBe(true);
    expect(result.recovered_sent_mail).toBe(1);
  });

  it("reports failure when a conversion write fails", async () => {
    h.conversion = summary({ converted: 1, failed: 1 });

    expect((await recover_locked_data("account-1", "old")).failed).toBe(true);
  });

  it("announces the change so the banner refreshes", async () => {
    const listener = vi.fn();

    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, listener);
    await recover_locked_data("account-1", "current password");
    window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, listener);

    expect(listener).toHaveBeenCalled();
  });
});

describe("recovering locked data with a recovery code", () => {
  const CODE = "ASTER-AAAA-BBBB-CCCC-DDDD";

  it("does nothing without an account or a code", async () => {
    await recover_locked_data_with_code("", CODE);
    await recover_locked_data_with_code("account-1", "");

    expect(h.code_calls).toEqual([]);
  });

  it("reports a full restore", async () => {
    h.code_restored = { restored: 2, incomplete: 0 };

    expect(await recover_locked_data_with_code("account-1", CODE)).toEqual({
      restored_key_sets: 2,
      recovered_sent_mail: 0,
      failed: false,
      incomplete: false,
      rate_limited: false,
      wrong_password: false,
    });
    expect(h.code_calls).toEqual([CODE]);
  });

  it("reports a partial restore without failing", async () => {
    h.code_restored = { restored: 1, incomplete: 1 };

    const result = await recover_locked_data_with_code("account-1", CODE);

    expect(result.restored_key_sets).toBe(1);
    expect(result.incomplete).toBe(true);
    expect(result.failed).toBe(false);
  });

  it("reports no match as neither restored nor failed", async () => {
    const result = await recover_locked_data_with_code("account-1", CODE);

    expect(result.restored_key_sets).toBe(0);
    expect(result.failed).toBe(false);
    expect(result.rate_limited).toBe(false);
  });

  it("reports failure when the recovered keys could not be stored", async () => {
    h.code_restored = { restored: 0, incomplete: 1 };

    expect(
      (await recover_locked_data_with_code("account-1", CODE)).failed,
    ).toBe(true);
  });

  it("reports a rate limit", async () => {
    h.code_error = new Error("recovery_code_rate_limited");

    const result = await recover_locked_data_with_code("account-1", CODE);

    expect(result.failed).toBe(true);
    expect(result.rate_limited).toBe(true);
  });

  it("reports failure without a rate limit on another error", async () => {
    h.code_error = new Error("network");

    const result = await recover_locked_data_with_code("account-1", CODE);

    expect(result.failed).toBe(true);
    expect(result.rate_limited).toBe(false);
  });

  it("never uses the old-password path", async () => {
    h.code_restored = { restored: 1, incomplete: 0 };

    await recover_locked_data_with_code("account-1", CODE);

    expect(h.restore_calls).toEqual([]);
    expect(h.conversion_calls).toEqual([]);
    expect(h.reseal_calls).toEqual([]);
  });

  it("announces the change so the banner refreshes", async () => {
    const listener = vi.fn();

    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, listener);
    await recover_locked_data_with_code("account-1", CODE);
    window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, listener);

    expect(listener).toHaveBeenCalled();
  });
});
