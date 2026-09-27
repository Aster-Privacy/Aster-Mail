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

import {
  init_category_index,
  get_page_ids,
  get_index_entry_count,
  set_ids_pinned,
  clear_category_index,
} from "@/services/category_index";
import { emit_mail_item_updated } from "@/hooks/mail_events";

const BASE_NOW = 1_700_000_000_000;

function inbox_items(count: number, pinned_ids: string[]) {
  const items = Array.from({ length: count }, (_, i) => {
    const ts = new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString();

    return {
      id: `m${i + 1}`,
      thread_token: undefined,
      message_ts: ts,
      created_at: ts,
      is_read: true,
      is_pinned: pinned_ids.includes(`m${i + 1}`),
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
    };
  });

  return { data: { items, has_more: false, next_cursor: null } };
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

async function build_full_index(expected: number): Promise<void> {
  await init_category_index();
  for (let i = 0; i < 200 && get_index_entry_count() < expected; i++) {
    await flush(5);
  }
  expect(get_index_entry_count()).toBe(expected);
}

describe("category_index pinned ordering", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    list_mail_items.mockReset();
    list_mail_items.mockResolvedValue(inbox_items(120, ["m75", "m110"]));
    await clear_category_index();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts pinned mail at the top of the first page even when it is older than a page of mail", async () => {
    await build_full_index(120);

    const first_page = get_page_ids("primary", 0, 50);
    const second_page = get_page_ids("primary", 1, 50);

    expect(first_page.slice(0, 3)).toEqual(["m75", "m110", "m1"]);
    expect(first_page).toHaveLength(50);
    expect(second_page).not.toContain("m75");
    expect(second_page).not.toContain("m110");
    expect(second_page[0]).toBe("m49");
  });

  it("moves a message to the top when it is pinned and back to its date slot when unpinned", async () => {
    await build_full_index(120);

    emit_mail_item_updated({ id: "m90", is_pinned: true });

    expect(get_page_ids("primary", 0, 50).slice(0, 3)).toEqual([
      "m75",
      "m90",
      "m110",
    ]);

    set_ids_pinned(["m75", "m90", "m110"], false);

    const first_page = get_page_ids("primary", 0, 50);

    expect(first_page[0]).toBe("m1");
    expect(first_page).not.toContain("m75");
    expect(get_page_ids("primary", 1, 50)).toContain("m75");
  });
});
