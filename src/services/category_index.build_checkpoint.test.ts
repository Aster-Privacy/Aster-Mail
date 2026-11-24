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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  create_version_change_indexed_db,
  replace_indexed_db,
} from "@/tests/fixtures/version_change_indexed_db";

const list_mail_items = vi.fn();

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (value: string) => value,
  secure_decrypt: async (value: string) => value,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async () => null,
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: () => "primary",
  CATEGORY_TABS: ["primary"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({ subject: "x" }),
}));

vi.mock("@/hooks/mail_events", () => ({
  on_mail_event: () => {},
  MAIL_EVENTS: {
    EMAIL_RECEIVED: "EMAIL_RECEIVED",
    MAIL_ITEMS_REMOVED: "MAIL_ITEMS_REMOVED",
    MAIL_ACTION: "MAIL_ACTION",
    MAIL_CHANGED: "MAIL_CHANGED",
    MAIL_ITEM_UPDATED: "MAIL_ITEM_UPDATED",
    INBOX_UNREAD_INDEXED: "INBOX_UNREAD_INDEXED",
  },
}));

const DB_NAME = "astermail_category_index";
const STORE_NAME = "indexes";
const CHUNK = JSON.stringify([
  {
    id: "m1",
    message_ts: "2026-01-01T00:00:00.000Z",
    is_read: false,
    category: "primary",
  },
]);

function meta(fully_built: boolean): string {
  return JSON.stringify({
    chunked: true,
    chunk_count: 1,
    built_at_ms: 0,
    fully_built,
    classifier_version: 2,
    entry_schema: 3,
    seen_ts: {},
    build_checkpoint: { cursor: "saved_cursor", processed: 150 },
  });
}

async function seed(meta_record: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    store.put(meta_record, "acct1");
    store.put(CHUNK, "acct1:c0");
  });
  db.close();
}

function first_cursor(): unknown {
  const args = list_mail_items.mock.calls[0]?.[0] as
    | { cursor?: string }
    | undefined;

  return args?.cursor;
}

function cursors(): unknown[] {
  return list_mail_items.mock.calls.map(
    (call) => (call[0] as { cursor?: string } | undefined)?.cursor,
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("an interrupted first index build after a reload", () => {
  let restore_indexed_db: () => void = () => undefined;

  beforeEach(() => {
    vi.resetModules();
    list_mail_items.mockReset();
    list_mail_items.mockResolvedValue({
      data: { items: [], has_more: false, next_cursor: null },
    });
    restore_indexed_db = replace_indexed_db(
      create_version_change_indexed_db().factory,
    );
  });

  afterEach(() => {
    restore_indexed_db();
  });

  it("continues from the saved page instead of starting over", async () => {
    await seed(meta(false));
    const index = await import("@/services/category_index");

    await index.init_category_index();
    await vi.waitFor(() => expect(index.is_fully_built()).toBe(true));

    expect(first_cursor()).toBe("saved_cursor");
    expect(index.get_index_entry_count()).toBe(1);
    expect(index.is_fully_built()).toBe(true);
  });

  it("starts from the newest page when the saved page is rejected", async () => {
    await seed(meta(false));
    list_mail_items.mockResolvedValueOnce({ data: null });
    const index = await import("@/services/category_index");

    await index.init_category_index();
    await vi.waitFor(() => expect(list_mail_items).toHaveBeenCalledTimes(1));
    await settle();
    expect(first_cursor()).toBe("saved_cursor");
    list_mail_items.mockClear();
    await index.build_index();

    expect(first_cursor()).toBeUndefined();
  });

  it("ignores a saved page once the index is complete", async () => {
    await seed(meta(true));
    const index = await import("@/services/category_index");

    await index.init_category_index();
    await index.build_index({ force: true });
    await settle();

    expect(cursors()).not.toContain("saved_cursor");
  });
});
