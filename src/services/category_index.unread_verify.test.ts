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
const get_mail_stats = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
  get_mail_stats: (...args: unknown[]) => get_mail_stats(...args),
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

import {
  init_category_index,
  get_inbox_unread_total,
  clear_category_index,
  verify_unread_against_server,
} from "@/services/category_index";
import { MAIL_EVENTS } from "@/hooks/mail_events";

const BASE_NOW = 1_700_000_000_000;

interface FakeItem {
  id: string;
  item_type: string;
  thread_token: undefined;
  message_ts: string;
  created_at: string;
  is_read: boolean;
  is_trashed?: boolean;
  encrypted_envelope: string;
  envelope_nonce: string;
}

const server_items = new Map<string, FakeItem>();

function seed_server(count: number, is_read: boolean): void {
  server_items.clear();
  for (let i = 0; i < count; i++) {
    const ts = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();

    server_items.set(`m${i}`, {
      id: `m${i}`,
      item_type: "received",
      thread_token: undefined,
      message_ts: ts,
      created_at: ts,
      is_read,
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
    });
  }
}

function server_unread(): number {
  return [...server_items.values()].filter(
    (item) => !item.is_read && !item.is_trashed,
  ).length;
}

function fake_list(params: {
  ids?: string[];
  is_read?: boolean;
  is_trashed?: boolean;
}) {
  let items = [...server_items.values()].sort((a, b) =>
    b.message_ts.localeCompare(a.message_ts),
  );

  if (params.ids) {
    const wanted = new Set(params.ids);

    items = items.filter((item) => wanted.has(item.id));
  }
  if (params.is_trashed === false) {
    items = items.filter((item) => !item.is_trashed);
  }
  if (params.is_read === false) {
    items = items.filter((item) => !item.is_read);
  }

  return {
    data: {
      items: items.map((item) => ({ ...item })),
      has_more: false,
      next_cursor: null,
    },
  };
}

function flush(ms = 15) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function build_index_from_server(): Promise<void> {
  await init_category_index();
  for (let i = 0; i < 40 && get_inbox_unread_total() === null; i++) {
    await flush();
  }
}

describe("category_index unread verification against the server", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    list_mail_items.mockReset();
    list_mail_items.mockImplementation(async (params) => fake_list(params));
    get_mail_stats.mockReset();
    get_mail_stats.mockImplementation(async () => ({
      data: { unread: server_unread() },
    }));
    await clear_category_index();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears unread entries another session marked read beyond the newest page", async () => {
    seed_server(120, false);
    await build_index_from_server();

    expect(get_inbox_unread_total()).toBe(120);

    for (const item of server_items.values()) item.is_read = true;
    server_items.get("m119")!.is_read = false;
    vi.setSystemTime(BASE_NOW + 60_000);

    await verify_unread_against_server();

    expect(get_inbox_unread_total()).toBe(1);
  });

  it("adds unread mail the index believed was read", async () => {
    seed_server(30, true);
    await build_index_from_server();

    expect(get_inbox_unread_total()).toBe(0);

    server_items.get("m3")!.is_read = false;
    server_items.get("m4")!.is_read = false;
    vi.setSystemTime(BASE_NOW + 60_000);

    await verify_unread_against_server();

    expect(get_inbox_unread_total()).toBe(2);
  });

  it("does no list work when the index already matches the server", async () => {
    seed_server(10, false);
    await build_index_from_server();
    list_mail_items.mockClear();

    await verify_unread_against_server();

    expect(get_inbox_unread_total()).toBe(10);
    expect(list_mail_items).not.toHaveBeenCalled();
  });

  it("drops entries the server moved out of the inbox", async () => {
    seed_server(5, false);
    await build_index_from_server();

    server_items.get("m2")!.is_trashed = true;
    vi.setSystemTime(BASE_NOW + 60_000);

    await verify_unread_against_server();

    expect(get_inbox_unread_total()).toBe(4);
  });

  it("verifies after a drift report and skips a repeat of the same unresolved drift", async () => {
    seed_server(20, false);
    await build_index_from_server();

    for (const item of server_items.values()) item.is_read = true;
    get_mail_stats.mockImplementation(async () => ({ data: { unread: 3 } }));
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(BASE_NOW + 60_000);

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.INBOX_UNREAD_DRIFT, {
        detail: { server_unread: 3 },
      }),
    );
    await vi.advanceTimersByTimeAsync(16_000);
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(20);

    expect(get_inbox_unread_total()).toBe(0);

    const calls = get_mail_stats.mock.calls.length;

    expect(calls).toBeGreaterThan(0);

    window.dispatchEvent(
      new CustomEvent(MAIL_EVENTS.INBOX_UNREAD_DRIFT, {
        detail: { server_unread: 3 },
      }),
    );
    await vi.advanceTimersByTimeAsync(60_000);

    expect(get_mail_stats.mock.calls.length).toBe(calls);
  });
  it("publishes the server count when a verified drift cannot be reconciled", async () => {
    seed_server(4, false);
    await build_index_from_server();

    const published: (number | null)[] = [];
    const on_indexed = (event: Event) => {
      published.push(
        (event as CustomEvent<{ total: number | null }>).detail.total,
      );
    };

    window.addEventListener(MAIL_EVENTS.INBOX_UNREAD_INDEXED, on_indexed);

    try {
      get_mail_stats.mockImplementation(async () => ({ data: { unread: 6 } }));
      vi.setSystemTime(BASE_NOW + 60_000);

      await verify_unread_against_server();

      expect(get_inbox_unread_total()).toBe(4);
      expect(published.at(-1)).toBe(6);

      get_mail_stats.mockImplementation(async () => ({ data: { unread: 4 } }));
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(BASE_NOW + 120_000);
      window.dispatchEvent(
        new CustomEvent(MAIL_EVENTS.INBOX_UNREAD_DRIFT, {
          detail: { server_unread: 4 },
        }),
      );
      await vi.advanceTimersByTimeAsync(20);

      expect(published.at(-1)).toBe(4);
    } finally {
      window.removeEventListener(MAIL_EVENTS.INBOX_UNREAD_INDEXED, on_indexed);
    }
  });

  it("keeps the index count when the server count changes between reads", async () => {
    seed_server(4, false);
    await build_index_from_server();

    const published: (number | null)[] = [];
    const on_indexed = (event: Event) => {
      published.push(
        (event as CustomEvent<{ total: number | null }>).detail.total,
      );
    };

    window.addEventListener(MAIL_EVENTS.INBOX_UNREAD_INDEXED, on_indexed);

    try {
      let reads = 0;

      get_mail_stats.mockImplementation(async () => {
        reads += 1;

        return { data: { unread: reads === 1 ? 6 : 7 } };
      });
      vi.setSystemTime(BASE_NOW + 60_000);

      await verify_unread_against_server();

      expect(published.includes(6)).toBe(false);
      expect(published.includes(7)).toBe(false);
    } finally {
      window.removeEventListener(MAIL_EVENTS.INBOX_UNREAD_INDEXED, on_indexed);
    }
  });
});
