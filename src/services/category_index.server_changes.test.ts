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
  build_index,
  start_event_listeners,
  clear_category_index,
  get_index_entries,
} from "@/services/category_index";

const TOKEN_KEY = "aster_change_sync_token_acct1";
const LEGACY_TOKEN_KEY = "aster_delete_sync_token_acct1";
const STORED_TOKEN = "2026-10-20T12:00:00.000Z";
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

function since_values(): string[] {
  return sync_mail_items.mock.calls
    .map((call) => (call[0] as { since?: string } | undefined)?.since)
    .filter((since): since is string => !!since);
}

function stored_token_ms(): number {
  return Date.parse(localStorage.getItem(TOKEN_KEY) ?? "");
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

describe("category_index server change feed", () => {
  const older = make_item(0);
  const newest = [1, 2, 3, 4].map((i) => make_item(i));

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
    serve_list([...newest, older]);
    await sync_recent();
    await settle();
    localStorage.setItem(TOKEN_KEY, STORED_TOKEN);
    serve_list(newest);
    sync_mail_items.mockClear();
  });

  it("moves an older message when another device changes its category", async () => {
    expect(get_index_entries([older.id])[0]?.category).toBe("primary");

    serve_changes([
      {
        items: [
          make_item(0, {
            encrypted_metadata: "pinned:newsletters",
            metadata_nonce: "meta-nonce-0b",
          }),
        ],
      },
    ]);
    await sync_recent();
    await settle();

    expect(get_index_entries([older.id])[0]).toMatchObject({
      category: "newsletters",
      category_pinned: true,
    });
  });

  it("asks for changes from shortly before the stored token and advances it", async () => {
    await sync_recent();
    await settle();

    const [since] = since_values();

    expect(Date.parse(since!)).toBeLessThan(Date.parse(STORED_TOKEN));
    expect(Date.parse(since!)).toBeGreaterThan(
      Date.parse(STORED_TOKEN) - 60_000,
    );
    expect(stored_token_ms()).toBeLessThanOrEqual(Date.parse(NEXT_TOKEN));
    expect(stored_token_ms()).toBeGreaterThan(Date.parse(NEXT_TOKEN) - 60_000);
  });

  it("follows every page before advancing the token", async () => {
    serve_changes([
      { has_more: true, next_cursor: "1", sync_token: STORED_TOKEN },
      {
        items: [
          make_item(0, {
            encrypted_metadata: "pinned:social",
            metadata_nonce: "meta-nonce-0c",
          }),
        ],
      },
    ]);
    await sync_recent();
    await settle();

    expect(since_values()).toHaveLength(2);
    expect(get_index_entries([older.id])[0]?.category).toBe("social");
    expect(stored_token_ms()).toBeGreaterThan(Date.parse(STORED_TOKEN));
  });

  it("drops messages that another device archived or deleted", async () => {
    serve_changes([
      { items: [make_item(0, { is_archived: true })], deleted_ids: ["m1"] },
    ]);
    await sync_recent();
    await settle();

    expect(get_index_entries([older.id])).toHaveLength(0);
    expect(get_index_entries(["m1"])).toHaveLength(0);
    expect(get_index_entries(["m2"])).toHaveLength(1);
  });

  it("adds a message that another device returned to the inbox", async () => {
    const restored = make_item(9, {
      encrypted_metadata: "pinned:promotions",
      metadata_nonce: "meta-nonce-9",
    });

    serve_changes([{ items: [restored] }]);
    await sync_recent();
    await settle();

    expect(get_index_entries([restored.id])[0]?.category).toBe("promotions");
  });

  it("ignores items that are not received mail", async () => {
    serve_changes([{ items: [make_item(7, { item_type: "sent" })] }]);
    await sync_recent();
    await settle();

    expect(get_index_entries(["m7"])).toHaveLength(0);
  });

  it("keeps the token when the change request fails", async () => {
    sync_mail_items.mockImplementation(async () => {
      throw new Error("network down");
    });
    await sync_recent();
    await settle();

    expect(localStorage.getItem(TOKEN_KEY)).toBe(STORED_TOKEN);
    expect(get_index_entries([older.id])).toHaveLength(1);
  });

  it("seeds a missing token from the server clock without asking for changes", async () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(LEGACY_TOKEN_KEY, "2026-01-01T00:00:00.000Z");
    await sync_recent();
    await settle();

    expect(since_values()).toEqual([]);
    expect(stored_token_ms()).toBeLessThan(Date.parse(SEED_TOKEN));
    expect(stored_token_ms()).toBeGreaterThan(Date.parse(SEED_TOKEN) - 60_000);
    expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it("stores a token taken at the start of a full build", async () => {
    localStorage.removeItem(TOKEN_KEY);
    serve_list([...newest, older]);
    await build_index({ force: true });
    await settle();

    expect(stored_token_ms()).toBeLessThan(Date.parse(SEED_TOKEN));
    expect(stored_token_ms()).toBeGreaterThan(Date.parse(SEED_TOKEN) - 60_000);
  });

  it("runs a full rebuild when the backlog is longer than the page budget", async () => {
    sync_mail_items.mockImplementation(
      async (params: { since?: string; cursor?: string } = {}) => ({
        data: {
          items: [],
          has_more: true,
          next_cursor: String(Number(params.cursor ?? 0) + 1),
          sync_token: params.since ? STORED_TOKEN : SEED_TOKEN,
        },
      }),
    );
    list_mail_items.mockClear();
    await sync_recent();
    await settle();

    expect(since_values()).toHaveLength(10);
    expect(list_mail_items.mock.calls.length).toBeGreaterThan(1);
  });
});
