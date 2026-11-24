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

import { describe, it, expect, beforeEach, vi } from "vitest";

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

const list_mail_items = vi.fn();
const sync_mail_items = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
  sync_mail_items: (...args: unknown[]) => sync_mail_items(...args),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: async (blob: string) =>
    blob.startsWith("pinned:")
      ? { category: blob.slice("pinned:".length), category_pinned: true }
      : null,
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: (
    _envelope: unknown,
    metadata: { category?: string; category_pinned?: boolean } | null,
  ) =>
    metadata?.category_pinned && metadata.category
      ? metadata.category
      : "primary",
  is_locked_to_primary: () => false,
  CATEGORY_TABS: ["primary", "social", "promotions", "newsletters"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({
    subject: "Subject",
    from: { name: "Sender", email: "sender@example.com" },
  }),
}));

import {
  sync_recent,
  start_event_listeners,
  clear_category_index,
  get_index_entries,
  get_counts,
} from "@/services/category_index";

const TOKEN_KEY = "aster_change_sync_token_acct1";
const SEED_TOKEN = "2026-10-25T09:00:00.000Z";
const NEXT_TOKEN = "2026-10-29T08:00:00.000Z";

function make_item(index: number, overrides: Partial<MailItem> = {}): MailItem {
  const ts = `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`;

  return {
    id: `m${index}`,
    item_type: "received",
    encrypted_envelope: `env-${index}`,
    envelope_nonce: `nonce-${index}`,
    encrypted_metadata: "plain",
    metadata_nonce: `meta-nonce-${index}`,
    folder_token: "",
    is_external: false,
    is_archived: false,
    is_trashed: false,
    is_spam: false,
    is_read: false,
    is_pinned: false,
    created_at: ts,
    message_ts: ts,
    ...overrides,
  } as MailItem;
}

function serve_list(items: MailItem[]): void {
  list_mail_items.mockImplementation(
    async (params: { ids?: string[] } | undefined) => ({
      data: {
        items: params?.ids
          ? items.filter((item) => params.ids!.includes(item.id))
          : items,
        has_more: false,
      },
    }),
  );
}

interface SyncPage {
  items?: MailItem[];
  deleted_ids?: string[];
  has_more?: boolean;
  next_cursor?: string;
  sync_token?: string;
}

function serve_changes(pages: SyncPage[]): void {
  sync_mail_items.mockImplementation(
    async (params: { since?: string; cursor?: string } = {}) => {
      if (!params.since) {
        return {
          data: { items: [], has_more: false, sync_token: SEED_TOKEN },
        };
      }
      const page = pages[params.cursor ? Number(params.cursor) : 0] ?? {};

      return {
        data: {
          items: page.items ?? [],
          deleted_ids: page.deleted_ids,
          has_more: page.has_more ?? false,
          next_cursor: page.next_cursor,
          sync_token: page.sync_token ?? NEXT_TOKEN,
        },
      };
    },
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const idb_data = new Map<string, Map<string, unknown>>();

function idb_store(name: string): Map<string, unknown> {
  if (!idb_data.has(name)) idb_data.set(name, new Map());

  return idb_data.get(name)!;
}

function install_fake_idb(): void {
  const known = new Set<string>();

  const make_db = () => ({
    objectStoreNames: { contains: (n: string) => known.has(n) },
    createObjectStore: (n: string) => {
      known.add(n);

      return {};
    },
    transaction: (store_name: string) => {
      const tx: Record<string, unknown> = {
        oncomplete: null,
        onerror: null,
        error: null,
      };

      tx.objectStore = (n: string) => ({
        put: (value: unknown, key: string) => {
          idb_store(n).set(key, value);
          setTimeout(() => (tx.oncomplete as (() => void) | null)?.(), 0);

          return {};
        },
        get: (key: string) => {
          const req: Record<string, unknown> = {
            onsuccess: null,
            onerror: null,
            result: idb_store(n).get(key),
          };

          setTimeout(
            () =>
              (req.onsuccess as ((e: unknown) => void) | null)?.({
                target: req,
              }),
            0,
          );

          return req;
        },
        clear: () => {
          idb_store(store_name).clear();
          setTimeout(() => (tx.oncomplete as (() => void) | null)?.(), 0);

          return {};
        },
      });

      return tx;
    },
    close: () => {},
  });

  const open = () => {
    const db = make_db();
    const req: Record<string, unknown> = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: db,
    };

    setTimeout(() => {
      (req.onupgradeneeded as ((e: unknown) => void) | null)?.({
        target: { result: db },
      });
      (req.onsuccess as ((e: unknown) => void) | null)?.({ target: req });
    }, 0);

    return req;
  };

  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open,
    deleteDatabase: () => ({}),
    cmp: () => 0,
    databases: async () => [],
  };
}

function list_with(items: MailItem[], has_more: boolean): void {
  list_mail_items.mockImplementation(
    async (params: { ids?: string[] } | undefined) => ({
      data: {
        items: params?.ids
          ? items.filter((item) => params.ids!.includes(item.id))
          : items,
        has_more,
      },
    }),
  );
}

function primary_unread(): number {
  return get_counts().primary?.unread ?? 0;
}

describe("category_index drops mail that left the inbox elsewhere", () => {
  const read_inbox = [0, 1, 2, 3].map((i) => make_item(i, { is_read: true }));
  const newer_unread = [make_item(8), make_item(9)];

  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    localStorage.clear();
    list_mail_items.mockReset();
    sync_mail_items.mockReset();
    serve_list([]);
    serve_changes([]);
    await clear_category_index();
    start_event_listeners();
    serve_list([...newer_unread, ...read_inbox]);
    await sync_recent();
    await settle();
    localStorage.removeItem(TOKEN_KEY);
    sync_mail_items.mockClear();
  });

  it("clears unread mail newer than the whole inbox once it is gone", async () => {
    expect(primary_unread()).toBe(2);

    list_with(read_inbox, false);
    await sync_recent();
    await settle();

    expect(get_index_entries(["m8", "m9"])).toHaveLength(0);
    expect(get_index_entries(read_inbox.map((i) => i.id))).toHaveLength(4);
    expect(primary_unread()).toBe(0);
  });

  it("clears older unread mail when the whole inbox fits one page", async () => {
    const inbox = [10, 11].map((i) => make_item(i, { is_read: true }));

    list_with([...inbox, ...newer_unread, ...read_inbox], false);
    await sync_recent();
    await settle();
    expect(primary_unread()).toBe(2);

    list_with(inbox, false);
    await sync_recent();
    await settle();

    expect(get_index_entries(["m8", "m9"])).toHaveLength(0);
    expect(get_index_entries(inbox.map((i) => i.id))).toHaveLength(2);
    expect(primary_unread()).toBe(0);
  });

  it("keeps older mail when more inbox pages exist", async () => {
    const page = [10, 11, 12].map((i) => make_item(i, { is_read: true }));

    list_with(page, true);
    await sync_recent();
    await settle();

    expect(get_index_entries(["m8", "m9"])).toHaveLength(2);
    expect(get_index_entries(read_inbox.map((i) => i.id))).toHaveLength(4);
    expect(primary_unread()).toBe(2);
  });
});
