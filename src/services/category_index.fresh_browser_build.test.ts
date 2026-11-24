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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

import {
  init_category_index,
  build_index,
  is_build_in_progress,
  is_fully_built,
  get_page_ids,
  get_category_total,
  clear_category_index,
} from "@/services/category_index";

const BASE_NOW = Date.parse("2026-11-18T12:00:00.000Z");
const MAILBOX_SIZE = 1000;
const NATIVE_COUNT = 40;
const LIST_PAGE_SIZE = 50;

interface FakeItem {
  id: string;
  item_type: "received";
  message_ts: string;
  created_at: string;
  is_read: boolean;
  encrypted_envelope: string;
  envelope_nonce: string;
  folder_token: string;
  is_external: boolean;
}

function make_mailbox(): FakeItem[] {
  const items: FakeItem[] = [];
  const import_time = new Date(BASE_NOW - 60 * 60 * 1000).toISOString();

  for (let i = 0; i < NATIVE_COUNT; i += 1) {
    const ts = new Date(BASE_NOW - (i + 1) * 60 * 60 * 1000).toISOString();

    items.push({
      id: `native_${i}`,
      item_type: "received",
      message_ts: ts,
      created_at: ts,
      is_read: false,
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
      folder_token: "",
      is_external: true,
    });
  }

  for (let i = 0; i < MAILBOX_SIZE - NATIVE_COUNT; i += 1) {
    const ts = new Date(
      Date.parse("2019-06-01T00:00:00.000Z") - i * 24 * 60 * 60 * 1000,
    ).toISOString();

    items.push({
      id: `imported_${i}`,
      item_type: "received",
      message_ts: ts,
      created_at: import_time,
      is_read: true,
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
      folder_token: "",
      is_external: true,
    });
  }

  return items;
}

type PageFailure = "error" | "hang";

function serve_mailbox(
  mailbox: FakeItem[],
  failures: Map<number, PageFailure[]>,
): void {
  list_mail_items.mockImplementation(
    (params: { limit?: number; cursor?: string }) => {
      const offset = params.cursor ? Number(params.cursor) : 0;
      const failure = failures.get(offset)?.shift();

      if (failure === "hang") return new Promise(() => {});
      if (failure === "error") {
        return Promise.resolve({ error: "Request timed out" });
      }

      const limit = params.limit ?? 150;
      const items = mailbox.slice(offset, offset + limit);
      const has_more = offset + limit < mailbox.length;

      return Promise.resolve({
        data: {
          items,
          total: -1,
          has_more,
          next_cursor: has_more ? String(offset + limit) : null,
        },
      });
    },
  );
}

function first_page_requests(): number {
  return list_mail_items.mock.calls.filter(
    ([params]) => !(params as { cursor?: string }).cursor,
  ).length;
}

function reachable_ids(): string[] {
  const out: string[] = [];

  for (let page = 0; page < 1000; page += 1) {
    const ids = get_page_ids("primary", page, LIST_PAGE_SIZE);

    if (ids.length === 0) break;
    out.push(...ids);
  }

  return out;
}

async function settle(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
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

async function start_fresh_browser(): Promise<void> {
  const pending = init_category_index();

  await settle(50);
  await pending;
}

describe("a fresh browser builds the whole inbox index", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
    });
    vi.setSystemTime(BASE_NOW);
    list_mail_items.mockReset();
    const cleared = clear_category_index();

    await settle(50);
    await cleared;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("indexes every imported thread when nothing fails", async () => {
    serve_mailbox(make_mailbox(), new Map());
    await start_fresh_browser();
    await settle(5_000);

    expect(is_fully_built()).toBe(true);
    expect(get_category_total("primary")).toBe(MAILBOX_SIZE);
    expect(new Set(reachable_ids()).size).toBe(MAILBOX_SIZE);
  });

  it("keeps building after one page request fails", async () => {
    serve_mailbox(make_mailbox(), new Map([[150, ["error"]]]));
    await start_fresh_browser();
    await settle(5 * 60 * 1000);

    expect(is_build_in_progress()).toBe(false);
    expect(is_fully_built()).toBe(true);
    expect(get_category_total("primary")).toBe(MAILBOX_SIZE);
    expect(new Set(reachable_ids()).size).toBe(MAILBOX_SIZE);
  });

  it("keeps building after a page request runs past the deadline", async () => {
    serve_mailbox(make_mailbox(), new Map([[300, ["hang"]]]));
    await start_fresh_browser();
    await settle(5 * 60 * 1000);

    expect(is_fully_built()).toBe(true);
    expect(get_category_total("primary")).toBe(MAILBOX_SIZE);
    expect(new Set(reachable_ids()).size).toBe(MAILBOX_SIZE);
  });

  it("recovers from repeated failures on the same page", async () => {
    serve_mailbox(
      make_mailbox(),
      new Map([[150, ["error", "error", "error", "error", "error"]]]),
    );
    await start_fresh_browser();
    await settle(15 * 60 * 1000);

    expect(is_fully_built()).toBe(true);
    expect(get_category_total("primary")).toBe(MAILBOX_SIZE);
  });

  it("resumes from the failed page instead of starting over", async () => {
    serve_mailbox(make_mailbox(), new Map([[600, ["error"]]]));
    await start_fresh_browser();
    await settle(5 * 60 * 1000);

    expect(is_fully_built()).toBe(true);
    expect(first_page_requests()).toBe(1);
  });

  it("a resumed rebuild never prunes mail it saw before the failure", async () => {
    const mailbox = make_mailbox();

    serve_mailbox(mailbox, new Map());
    await start_fresh_browser();
    await settle(5_000);
    expect(get_category_total("primary")).toBe(MAILBOX_SIZE);

    serve_mailbox(mailbox, new Map([[450, ["error"]]]));
    const forced = build_index({ force: true });

    await settle(100);
    await forced;
    await settle(5 * 60 * 1000);

    expect(is_fully_built()).toBe(true);
    expect(get_category_total("primary")).toBe(MAILBOX_SIZE);
    expect(new Set(reachable_ids()).size).toBe(MAILBOX_SIZE);
  });
});
