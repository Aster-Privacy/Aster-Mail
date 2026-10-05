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

import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  calls: [] as string[],
  snapshot_scopes: [] as unknown[],
}));

vi.mock("./auth_helpers", () => ({
  clear_account_scoped_caches: async (snapshots: unknown) => {
    hoisted.calls.push("clear_account_scoped_caches");
    hoisted.snapshot_scopes.push(snapshots);
  },
}));

vi.mock("@/hooks/use_protected_folder", () => ({
  lock_all_folders: () => {
    hoisted.calls.push("lock_all_folders");
    throw new Error("storage unavailable");
  },
}));

vi.mock("@/services/crypto/message_escrow", () => ({
  clear_escrow_miss_cache: () => {
    hoisted.calls.push("clear_escrow_miss_cache");
  },
}));

vi.mock("@/services/translation/translation_cache", () => ({
  clear_translation_cache: () => {
    hoisted.calls.push("clear_translation_cache");
  },
}));

vi.mock("@/services/translation/language_detect", () => ({
  clear_detection_cache: () => {
    hoisted.calls.push("clear_detection_cache");
  },
}));

vi.mock("@/services/translation/engine_registry", () => ({
  release_engines: () => {
    hoisted.calls.push("release_engines");
  },
}));

vi.mock("@/components/settings/billing/billing_cache", () => ({
  clear_billing_cache: () => {
    hoisted.calls.push("clear_billing_cache");
  },
}));

vi.mock("@/components/settings/billing/family_section/family_cache", () => ({
  clear_family_cache: () => {
    hoisted.calls.push("clear_family_cache");
  },
}));

import { clear_signed_out_account_caches } from "./signed_out_account_caches";

describe("signing out one account clears its decrypted caches", () => {
  beforeEach(() => {
    hoisted.calls.length = 0;
    hoisted.snapshot_scopes.length = 0;
  });

  it("clears every cache a full sign-out clears", async () => {
    await clear_signed_out_account_caches();

    expect([...hoisted.calls].sort()).toEqual([
      "clear_account_scoped_caches",
      "clear_billing_cache",
      "clear_detection_cache",
      "clear_escrow_miss_cache",
      "clear_family_cache",
      "clear_translation_cache",
      "lock_all_folders",
      "release_engines",
    ]);
  });

  it("keeps clearing when one cache throws", async () => {
    await expect(clear_signed_out_account_caches()).resolves.toBeUndefined();

    expect(hoisted.calls[0]).toBe("lock_all_folders");
    expect(hoisted.calls).toContain("clear_account_scoped_caches");
  });

  it("removes the saved lists of the account that signed out", async () => {
    await clear_signed_out_account_caches("acct-2");
    await clear_signed_out_account_caches();
    await clear_signed_out_account_caches(null);

    expect(hoisted.snapshot_scopes).toEqual([
      { account_id: "acct-2" },
      "current_account",
      "current_account",
    ]);
  });
});
