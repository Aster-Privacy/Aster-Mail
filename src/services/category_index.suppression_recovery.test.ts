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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (s: string) => s,
  secure_decrypt: async (s: string) => s,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
  accounts_storage_unreadable: () => false,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: () => "primary",
  category_for_tab: (c: string) => c,
  CATEGORY_TABS: ["primary"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({ subject: "x" }),
}));

import {
  upsert_entries,
  get_counts,
  suppress_ids,
  clear_suppressed_ids,
  prune_expired_suppressions,
  clear_category_index_memory,
} from "@/services/category_index";

const SUPPRESSION_TTL_MS = 60_000;

function total_indexed(): number {
  return Object.values(get_counts()).reduce(
    (sum, count) => sum + (count?.total ?? 0),
    0,
  );
}

function seed(): void {
  upsert_entries([
    {
      id: "m1",
      message_ts: "2026-07-01T00:00:00.000Z",
      is_read: true,
      category: "primary",
    },
  ]);
}

describe("a message that failed to render once comes back", () => {
  beforeEach(() => {
    clear_category_index_memory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides a message that could not be rendered", () => {
    seed();
    suppress_ids(["m1"]);

    expect(total_indexed()).toBe(0);
  });

  it("restores it once the suppression window passes", () => {
    seed();
    suppress_ids(["m1"]);
    vi.setSystemTime(new Date(Date.now() + SUPPRESSION_TTL_MS + 1));
    prune_expired_suppressions();

    expect(total_indexed()).toBe(1);
  });

  it("keeps it hidden while the suppression window is still open", () => {
    seed();
    suppress_ids(["m1"]);
    vi.setSystemTime(new Date(Date.now() + SUPPRESSION_TTL_MS - 1000));
    prune_expired_suppressions();

    expect(total_indexed()).toBe(0);
  });

  it("restores it immediately when the keys arrive", () => {
    seed();
    suppress_ids(["m1"]);
    clear_suppressed_ids();

    expect(total_indexed()).toBe(1);
  });
});
