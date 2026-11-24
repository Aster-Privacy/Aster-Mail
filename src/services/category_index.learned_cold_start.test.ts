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

const classify = vi.fn(
  (
    envelope: { from?: { email?: string } },
    _metadata: unknown,
    options?: { learned_senders?: ReadonlyMap<string, string> },
  ) => options?.learned_senders?.get(envelope.from?.email ?? "") ?? "primary",
);

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: (...args: Parameters<typeof classify>) => classify(...args),
  CATEGORY_TABS: ["primary", "promotions"],
  set_active_custom_categories: () => {},
  set_active_learned_senders: () => {},
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({
    subject: "Weekly deals",
    from: { name: "Shop", email: "deals@shop.example" },
  }),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: {
    EMAIL_RECEIVED: "EMAIL_RECEIVED",
    MAIL_ITEMS_REMOVED: "MAIL_ITEMS_REMOVED",
    MAIL_ITEM_UPDATED: "MAIL_ITEM_UPDATED",
    EMAIL_SENT: "EMAIL_SENT",
    INBOX_UNREAD_INDEXED: "INBOX_UNREAD_INDEXED",
  },
  on_mail_event: () => {},
  emit_mail_item_updated: () => {},
}));

import {
  clear_category_index_memory,
  get_index_entries,
  is_learned_index_known,
  reindex_ids,
  reset_learned_index_state,
  set_learned_senders,
} from "@/services/category_index";
import { list_mail_items } from "@/services/api/mail";

const mocked_list = vi.mocked(list_mail_items);

const item = {
  id: "m1",
  item_type: "received",
  encrypted_envelope: "envelope",
  envelope_nonce: "nonce",
  message_ts: "2026-07-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  is_read: true,
} as unknown as MailItem;

function category_of_m1(): string | undefined {
  return get_index_entries(["m1"])[0]?.category;
}

async function reclassify_and_settle(): Promise<void> {
  const calls = classify.mock.calls.length;

  reindex_ids(["m1"]);
  await vi.waitFor(() => {
    expect(classify.mock.calls.length).toBeGreaterThan(calls);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("learned categories across a cold start", () => {
  beforeEach(() => {
    clear_category_index_memory();
    reset_learned_index_state();
    classify.mockClear();
    mocked_list.mockReset();
    mocked_list.mockResolvedValue({
      data: { items: [item], total: 1, has_more: false },
    } as Awaited<ReturnType<typeof list_mail_items>>);
  });

  it("keeps a learned category until the learned list is known", async () => {
    set_learned_senders([
      { sender: "deals@shop.example", category: "promotions" },
    ]);
    await reclassify_and_settle();

    expect(category_of_m1()).toBe("promotions");

    reset_learned_index_state();
    expect(is_learned_index_known()).toBe(false);

    await reclassify_and_settle();

    expect(category_of_m1()).toBe("promotions");
    expect(get_index_entries(["m1"])[0]?.learned).toBe("promotions");
  });

  it("drops the learned category once the known list forgets the sender", async () => {
    set_learned_senders([
      { sender: "deals@shop.example", category: "promotions" },
    ]);
    await reclassify_and_settle();
    reset_learned_index_state();

    const calls = classify.mock.calls.length;

    set_learned_senders([]);
    await vi.waitFor(() => {
      expect(classify.mock.calls.length).toBeGreaterThan(calls);
    });
    await vi.waitFor(() => {
      expect(category_of_m1()).toBe("primary");
    });
    expect(is_learned_index_known()).toBe(true);
  });

  it("does not invent a learned category for an unseen message on a cold start", async () => {
    await reclassify_and_settle();

    expect(category_of_m1()).toBe("primary");
  });
});
