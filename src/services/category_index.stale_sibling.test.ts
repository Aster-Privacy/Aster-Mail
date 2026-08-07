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
  category_for_tab: (c: string) => c,
  CATEGORY_TABS: ["primary"],
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({ subject: "x" }),
}));

import {
  init_category_index,
  get_counts,
  is_representative_unread,
  reconcile_unread_thread_siblings,
  clear_category_index,
} from "@/services/category_index";

const BASE_NOW = 1_700_000_000_000;

function build_item(
  id: string,
  is_read: boolean,
  ts: string,
): Record<string, unknown> {
  return {
    id,
    thread_token: "thread-A",
    item_type: "received",
    message_ts: ts,
    created_at: ts,
    is_read,
    encrypted_envelope: "env",
    envelope_nonce: "nonce",
  };
}

function build_response(sibling_read: boolean) {
  return {
    data: {
      items: [
        build_item("rep_read", true, "2026-01-02T00:00:00.000Z"),
        build_item("older_sibling", sibling_read, "2026-01-01T00:00:00.000Z"),
      ],
      has_more: false,
      next_cursor: null,
    },
  };
}

function flush(ms = 25) {
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

function ids_of(args: unknown): string[] | null {
  const params = args as { ids?: string[] };

  return Array.isArray(params?.ids) ? params.ids : null;
}

describe("category_index stale unread thread siblings", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    list_mail_items.mockReset();
    await clear_category_index();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the ghost when the server says the sibling is read", async () => {
    list_mail_items.mockImplementation(async (args: unknown) => {
      const ids = ids_of(args);

      if (ids) {
        return {
          data: {
            items: [build_item("older_sibling", true, "2026-01-01T00:00:00.000Z")],
            has_more: false,
            next_cursor: null,
          },
        };
      }

      return build_response(false);
    });

    await init_category_index();
    await flush();

    expect(is_representative_unread("rep_read")).toBe(true);
    expect(get_counts().primary!.unread).toBe(1);

    reconcile_unread_thread_siblings([{ id: "rep_read", is_read: true }]);
    await flush(500);

    expect(is_representative_unread("rep_read")).toBe(false);
    expect(get_counts().primary!.unread).toBe(0);
  });

  it("clears the ghost when the sibling no longer exists on the server", async () => {
    list_mail_items.mockImplementation(async (args: unknown) => {
      const ids = ids_of(args);

      if (ids) {
        return { data: { items: [], has_more: false, next_cursor: null } };
      }

      return build_response(false);
    });

    await init_category_index();
    await flush();

    expect(is_representative_unread("rep_read")).toBe(true);

    reconcile_unread_thread_siblings([{ id: "rep_read", is_read: true }]);
    await flush();

    expect(is_representative_unread("rep_read")).toBe(false);
    expect(get_counts().primary!.unread).toBe(0);
  });

  it("keeps a genuinely unread sibling bold and does not re-verify within the cooldown", async () => {
    list_mail_items.mockImplementation(async (args: unknown) => {
      const ids = ids_of(args);

      if (ids) {
        return {
          data: {
            items: [
              build_item("older_sibling", false, "2026-01-01T00:00:00.000Z"),
            ],
            has_more: false,
            next_cursor: null,
          },
        };
      }

      return build_response(false);
    });

    await init_category_index();
    await flush();

    reconcile_unread_thread_siblings([{ id: "rep_read", is_read: true }]);
    await flush();

    expect(is_representative_unread("rep_read")).toBe(true);
    expect(get_counts().primary!.unread).toBe(1);

    const verify_calls_before = list_mail_items.mock.calls.filter((call) =>
      ids_of(call[0]),
    ).length;

    reconcile_unread_thread_siblings([{ id: "rep_read", is_read: true }]);
    await flush();

    const verify_calls_after = list_mail_items.mock.calls.filter((call) =>
      ids_of(call[0]),
    ).length;

    expect(verify_calls_after).toBe(verify_calls_before);
  });

  it("does not touch siblings when the fetched row itself is unread", async () => {
    list_mail_items.mockImplementation(async (args: unknown) => {
      const ids = ids_of(args);

      if (ids) {
        return {
          data: {
            items: [build_item("older_sibling", true, "2026-01-01T00:00:00.000Z")],
            has_more: false,
            next_cursor: null,
          },
        };
      }

      return build_response(false);
    });

    await init_category_index();
    await flush();

    reconcile_unread_thread_siblings([{ id: "rep_read", is_read: false }]);
    await flush();

    expect(is_representative_unread("rep_read")).toBe(true);
    expect(get_counts().primary!.unread).toBe(1);
  });
});
