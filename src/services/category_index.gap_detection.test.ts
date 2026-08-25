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
  decrypt_mail_metadata: vi.fn(async () => null),
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

import { list_mail_items } from "@/services/api/mail";
import {
  upsert_entries,
  sync_recent,
  clear_category_index_memory,
} from "@/services/category_index";

const mocked_list = vi.mocked(list_mail_items);

function page_item(index: number, day: number): MailItem {
  const ts = `2026-07-${String(day).padStart(2, "0")}T00:00:00.000Z`;

  return {
    id: `new-${index}`,
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
    created_at: ts,
    message_ts: ts,
  } as MailItem;
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

async function flush(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

function full_page(): MailItem[] {
  return Array.from({ length: 25 }, (_, i) => page_item(i, 10 + i));
}

async function load_index(): Promise<void> {
  mocked_list.mockResolvedValue({
    data: { items: [], has_more: false },
  } as never);
  await sync_recent();
  await flush();
  mocked_list.mockReset();
}

function full_rebuild_calls(): number {
  return mocked_list.mock.calls.filter(
    (call) => (call[0] as { limit?: number } | undefined)?.limit === 150,
  ).length;
}

describe("category index gap detection", () => {
  beforeEach(() => {
    install_fake_idb();
    idb_data.clear();
    clear_category_index_memory();
    localStorage.clear();
    mocked_list.mockReset();
  });

  it("rebuilds when the newest page does not reach back to the indexed mail", async () => {
    await load_index();
    upsert_entries([
      {
        id: "old-1",
        message_ts: "2026-06-01T00:00:00.000Z",
        is_read: true,
        category: "primary",
      },
    ]);

    mocked_list.mockResolvedValue({
      data: { items: full_page(), has_more: false },
    } as never);

    await sync_recent();
    await flush();

    expect(full_rebuild_calls()).toBeGreaterThan(0);
  });

  it("does not rebuild when the newest page overlaps the indexed mail", async () => {
    await load_index();

    const page = full_page();

    upsert_entries([
      {
        id: page[0].id,
        message_ts: page[0].message_ts as string,
        is_read: true,
        category: "primary",
      },
    ]);

    mocked_list.mockResolvedValue({
      data: { items: page, has_more: false },
    } as never);

    await sync_recent();
    await flush();

    expect(full_rebuild_calls()).toBe(0);
  });

  it("does not rebuild when the page is not full", async () => {
    await load_index();
    upsert_entries([
      {
        id: "old-1",
        message_ts: "2026-06-01T00:00:00.000Z",
        is_read: true,
        category: "primary",
      },
    ]);

    mocked_list.mockResolvedValue({
      data: { items: full_page().slice(0, 5), has_more: false },
    } as never);

    await sync_recent();
    await flush();

    expect(full_rebuild_calls()).toBe(0);
  });
});
