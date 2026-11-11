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
  type VersionChangeIndexedDb,
} from "@/tests/fixtures/version_change_indexed_db";

const hooks = vi.hoisted(() => ({
  on_decrypt: null as ((value: string) => Promise<void>) | null,
}));

const list_mail_items = vi.fn();

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (value: string) => value,
  secure_decrypt: async (value: string) => {
    await hooks.on_decrypt?.(value);

    return value;
  },
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
const PREVIEWS = JSON.stringify([["m1", "Sender", "Subject"]]);
const CHUNK = JSON.stringify([
  {
    id: "m1",
    message_ts: "2026-01-01T00:00:00.000Z",
    is_read: false,
    category: "primary",
  },
]);
const META = JSON.stringify({
  chunked: true,
  chunk_count: 1,
  built_at_ms: 5,
  fully_built: true,
  classifier_version: 2,
  entry_schema: 3,
  seen_ts: {},
});

async function seed(): Promise<void> {
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
    store.put(META, "acct1");
    store.put(CHUNK, "acct1:c0");
    store.put(PREVIEWS, "acct1:previews");
  });
  db.close();
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("loading the category index while its database is deleted", () => {
  let fake: VersionChangeIndexedDb;
  let restore_indexed_db: () => void = () => undefined;

  beforeEach(async () => {
    vi.resetModules();
    hooks.on_decrypt = null;
    list_mail_items.mockReset();
    list_mail_items.mockResolvedValue({
      data: { items: [], has_more: false, next_cursor: null },
    });
    fake = create_version_change_indexed_db();
    restore_indexed_db = replace_indexed_db(fake.factory);
    await seed();
  });

  afterEach(() => {
    hooks.on_decrypt = null;
    restore_indexed_db();
  });

  it("loads the stored entries and previews when nothing interrupts", async () => {
    const index = await import("@/services/category_index");

    await index.init_category_index();

    expect(index.get_index_entry_count()).toBe(1);
    expect(index.get_entry_preview("m1")).toEqual({
      sender: "Sender",
      subject: "Subject",
    });
    expect(index.is_fully_built()).toBe(true);
  });

  it.each([
    ["the index record", META],
    ["a chunk", CHUNK],
    ["the previews", PREVIEWS],
  ])(
    "keeps nothing in memory when the deletion arrives while reading %s",
    async (_label, record) => {
      const index = await import("@/services/category_index");

      hooks.on_decrypt = async (value) => {
        if (value !== record) return;
        hooks.on_decrypt = null;
        indexedDB.deleteDatabase(DB_NAME);
        await settle();
      };

      await index.init_category_index();
      await settle();

      expect(index.get_index_entry_count()).toBe(0);
      expect(index.get_entry_preview("m1")).toBeUndefined();
      expect(index.is_fully_built()).toBe(false);
      expect(index.is_index_loaded()).toBe(false);
      expect(list_mail_items).not.toHaveBeenCalled();
      expect(fake.open_connections(DB_NAME)).toBe(0);
      expect(fake.database_names()).not.toContain(DB_NAME);
    },
  );
});
