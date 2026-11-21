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

const h = vi.hoisted(() => ({
  envelope_ok: true,
  metadata: null as Record<string, unknown> | null,
}));

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
  decrypt_mail_metadata: vi.fn(async () => h.metadata),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: () => "primary",
  CATEGORY_TABS: ["primary", "newsletters"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => (h.envelope_ok ? { subject: "x" } : null),
}));

import { list_mail_items } from "@/services/api/mail";
import {
  upsert_entries,
  get_counts,
  reindex_ids,
  clear_category_index_memory,
} from "@/services/category_index";

const mocked_list = vi.mocked(list_mail_items);

function server_item(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: "m1",
    item_type: "received",
    encrypted_envelope: "e",
    envelope_nonce: "n",
    encrypted_metadata: "em",
    metadata_nonce: "mn",
    folder_token: "",
    is_external: false,
    is_archived: false,
    is_trashed: false,
    is_spam: false,
    created_at: "2026-07-01T00:00:00.000Z",
    message_ts: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as MailItem;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function seed_newsletter(pinned: boolean): void {
  upsert_entries([
    {
      id: "m1",
      message_ts: "2026-07-01T00:00:00.000Z",
      is_read: true,
      category: "newsletters",
      ...(pinned ? { category_pinned: true } : {}),
    },
  ]);
}

function listed(item: MailItem): void {
  mocked_list.mockResolvedValue({ data: { items: [item] } } as never);
}

describe("category index with an envelope that did not load", () => {
  beforeEach(() => {
    clear_category_index_memory();
    mocked_list.mockReset();
    h.envelope_ok = true;
    h.metadata = null;
  });

  it("keeps a known message in its category", async () => {
    seed_newsletter(false);
    h.envelope_ok = false;
    listed(server_item());

    reindex_ids(["m1"]);
    await flush();

    const counts = get_counts();

    expect(counts.newsletters?.total).toBe(1);
    expect(counts.primary?.total ?? 0).toBe(0);
  });

  it("keeps the category a person chose for a known message", async () => {
    seed_newsletter(true);
    h.envelope_ok = false;
    listed(server_item());

    reindex_ids(["m1"]);
    await flush();

    expect(get_counts().newsletters?.total).toBe(1);
  });

  it("classifies the message again once the envelope loads", async () => {
    seed_newsletter(false);
    listed(server_item());

    reindex_ids(["m1"]);
    await flush();

    const counts = get_counts();

    expect(counts.primary?.total).toBe(1);
    expect(counts.newsletters?.total ?? 0).toBe(0);
  });
});
