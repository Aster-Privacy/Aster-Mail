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

const handlers = new Map<string, (detail: Record<string, unknown>) => void>();

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: {
    EMAIL_RECEIVED: "EMAIL_RECEIVED",
    MAIL_ITEMS_REMOVED: "MAIL_ITEMS_REMOVED",
    MAIL_ITEM_UPDATED: "MAIL_ITEM_UPDATED",
    EMAIL_SENT: "EMAIL_SENT",
    INBOX_UNREAD_INDEXED: "INBOX_UNREAD_INDEXED",
  },
  on_mail_event: (
    name: string,
    handler: (detail: Record<string, unknown>) => void,
  ) => {
    handlers.set(name, handler);
  },
}));

import {
  upsert_entries,
  get_counts,
  clear_category_index_memory,
  start_event_listeners,
} from "@/services/category_index";
import { list_mail_items } from "@/services/api/mail";

const mocked_list = vi.mocked(list_mail_items);

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

async function announce_arrival(): Promise<void> {
  handlers.get("EMAIL_RECEIVED")?.({ email_id: "m1" });
  await vi.waitFor(() => {
    expect(mocked_list).toHaveBeenCalled();
  });
  await Promise.resolve();
  await Promise.resolve();
}

describe("a single empty by-ids response never deletes an indexed message", () => {
  beforeEach(() => {
    clear_category_index_memory();
    mocked_list.mockReset();
    start_event_listeners();
  });

  it("keeps the message after one absent response", async () => {
    seed();
    mocked_list.mockResolvedValue({
      data: { items: [], total: 0, has_more: false },
    });
    await announce_arrival();

    expect(total_indexed()).toBe(1);
  });

  it("removes it only after the absence repeats", async () => {
    seed();
    mocked_list.mockResolvedValue({
      data: { items: [], total: 0, has_more: false },
    });
    await announce_arrival();
    mocked_list.mockClear();
    await announce_arrival();

    expect(total_indexed()).toBe(0);
  });
});
