//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

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
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(),
  update_item_metadata: async () => ({ success: true }),
  update_item_metadata_safe: async () => ({ success: true }),
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
  get_page_ids,
  get_category_action_ids,
  set_thread_grouping,
  clear_category_index_memory,
} from "@/services/category_index";

const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

describe("dormant snoozed entries", () => {
  beforeEach(() => {
    clear_category_index_memory();
    set_thread_grouping(true);
  });

  it("excludes future-snoozed entries from counts and pages but keeps them stored", () => {
    upsert_entries([
      {
        id: "a1",
        message_ts: "2026-07-01T00:00:00.000Z",
        is_read: false,
        category: "primary",
        snoozed_until: FUTURE,
      },
      {
        id: "b1",
        message_ts: "2026-07-02T00:00:00.000Z",
        is_read: false,
        category: "primary",
      },
    ]);

    expect(get_counts().primary!.total).toBe(1);
    expect(get_page_ids("primary", 0, 10)).toEqual(["b1"]);
  });

  it("includes entries whose snooze has already woken", () => {
    upsert_entries([
      {
        id: "a1",
        message_ts: "2026-07-01T00:00:00.000Z",
        is_read: false,
        category: "primary",
        snoozed_until: PAST,
      },
    ]);

    expect(get_counts().primary!.total).toBe(1);
    expect(get_page_ids("primary", 0, 10)).toEqual(["a1"]);
  });
});

describe("get_category_action_ids", () => {
  beforeEach(() => {
    clear_category_index_memory();
    set_thread_grouping(true);
  });

  it("expands thread siblings beyond the representative when grouping is on", () => {
    upsert_entries([
      {
        id: "a1",
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
        is_read: false,
        category: "primary",
      },
      {
        id: "a2",
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
        is_read: false,
        category: "primary",
      },
      {
        id: "b1",
        message_ts: "2026-07-03T00:00:00.000Z",
        is_read: false,
        category: "primary",
      },
    ]);

    const { rep_ids, all_ids } = get_category_action_ids("primary");

    expect(rep_ids.sort()).toEqual(["a2", "b1"]);
    expect(all_ids.sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("returns per-message ids without sibling expansion when grouping is off", () => {
    set_thread_grouping(false);
    upsert_entries([
      {
        id: "a1",
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
        is_read: false,
        category: "primary",
      },
      {
        id: "a2",
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
        is_read: false,
        category: "primary",
      },
    ]);

    const { rep_ids, all_ids } = get_category_action_ids("primary");

    expect(rep_ids.sort()).toEqual(["a1", "a2"]);
    expect(all_ids.sort()).toEqual(["a1", "a2"]);
    expect(get_counts().primary!.total).toBe(2);
  });
});
