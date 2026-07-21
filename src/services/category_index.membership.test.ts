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
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect, vi } from "vitest";

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
}));

vi.mock("@/services/mail_categorizer", () => ({
  classify: () => "primary",
  category_for_tab: (c: string) => c,
  CATEGORY_TABS: ["primary"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({ subject: "x" }),
}));

import {
  is_item_outside_inbox,
  remove_thread_entries,
  upsert_entries,
  get_counts,
  clear_category_index_memory,
} from "@/services/category_index";

function base_item(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: "m1",
    item_type: "received",
    encrypted_envelope: "e",
    envelope_nonce: "n",
    folder_token: "",
    is_external: false,
    created_at: "2026-07-01T00:00:00.000Z",
    message_ts: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as MailItem;
}

describe("is_item_outside_inbox", () => {
  it("treats a plain received inbox item as inside", () => {
    expect(is_item_outside_inbox(base_item())).toBe(false);
  });

  it("treats a labeled/foldered item as outside the inbox", () => {
    expect(
      is_item_outside_inbox(
        base_item({ labels: [{ token: "work", name: "Work", color: "#000" }] }),
      ),
    ).toBe(true);
    expect(
      is_item_outside_inbox(
        base_item({ folders: [{ token: "work", name: "Work", color: "#000" }] }),
      ),
    ).toBe(true);
  });

  it("treats an item snoozed into the future as outside, but a past snooze as inside", () => {
    expect(
      is_item_outside_inbox(base_item({ snoozed_until: "2999-01-01T00:00:00.000Z" })),
    ).toBe(true);
    expect(
      is_item_outside_inbox(base_item({ snoozed_until: "2000-01-01T00:00:00.000Z" })),
    ).toBe(false);
  });
});

describe("remove_thread_entries returns the removed ids", () => {
  it("returns exactly the ids it removed and leaves other threads intact", () => {
    clear_category_index_memory();
    upsert_entries([
      { id: "a1", thread_token: "t1", message_ts: "2026-07-01T00:00:00.000Z", is_read: true, category: "primary" },
      { id: "a2", thread_token: "t1", message_ts: "2026-07-02T00:00:00.000Z", is_read: true, category: "primary" },
      { id: "b1", thread_token: "t2", message_ts: "2026-07-03T00:00:00.000Z", is_read: true, category: "primary" },
    ]);

    const removed = remove_thread_entries("t1").sort();

    expect(removed).toEqual(["a1", "a2"]);
    expect(get_counts().primary!.total).toBe(1);
    expect(remove_thread_entries("missing")).toEqual([]);
  });
});
