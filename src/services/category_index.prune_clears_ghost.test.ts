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
  get_page_ids,
  remove_ids,
  clear_category_index,
} from "@/services/category_index";

function two_primary_threads() {
  return {
    data: {
      items: [
        {
          id: "keep1",
          thread_token: "thread-A",
          message_ts: "2026-01-02T00:00:00.000Z",
          created_at: "2026-01-02T00:00:00.000Z",
          is_read: false,
          encrypted_envelope: "env",
          envelope_nonce: "nonce",
        },
        {
          id: "keep2",
          thread_token: "thread-B",
          message_ts: "2026-01-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
          is_read: false,
          encrypted_envelope: "env",
          envelope_nonce: "nonce",
        },
      ],
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

describe("category_index prune clears the ghost", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    list_mail_items.mockReset();
    list_mail_items.mockResolvedValue(two_primary_threads());
    await clear_category_index();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops the count to zero and empties the page once the stale ids are pruned", async () => {
    await init_category_index();
    await flush();

    expect(get_counts().primary.total).toBe(2);
    expect(get_counts().primary.unread).toBe(2);
    expect(get_page_ids("primary", 0, 50)).toEqual(["keep1", "keep2"]);

    remove_ids(["keep1", "keep2"]);

    expect(get_counts().primary.total).toBe(0);
    expect(get_counts().primary.unread).toBe(0);
    expect(get_page_ids("primary", 0, 50)).toEqual([]);
  });
});
