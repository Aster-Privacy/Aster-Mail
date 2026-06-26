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

const decrypt_mail_metadata = vi.fn();

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: (...args: unknown[]) => decrypt_mail_metadata(...args),
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
  clear_category_index,
} from "@/services/category_index";

const BASE_NOW = 1_700_000_000_000;

function item({
  server_is_read,
  meta_is_read,
}: {
  server_is_read: boolean;
  meta_is_read: boolean | null;
}) {
  return {
    data: {
      items: [
        {
          id: "m1",
          thread_token: undefined,
          message_ts: "2026-01-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
          is_read: server_is_read,
          encrypted_envelope: "env",
          envelope_nonce: "nonce",
          encrypted_metadata: meta_is_read === null ? undefined : "meta",
          metadata_nonce: meta_is_read === null ? undefined : "metanonce",
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

describe("category_index server read-state authority", () => {
  beforeEach(async () => {
    install_fake_idb();
    idb_data.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    list_mail_items.mockReset();
    decrypt_mail_metadata.mockReset();
    await clear_category_index();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders read when the server says read even though stale metadata says unread (the stuck-unread bug)", async () => {
    decrypt_mail_metadata.mockResolvedValue({ is_read: false });
    list_mail_items.mockResolvedValue(
      item({ server_is_read: true, meta_is_read: false }),
    );

    await init_category_index();
    await flush();

    expect(get_counts().primary.unread).toBe(0);
  });

  it("renders unread when both server and metadata say unread", async () => {
    decrypt_mail_metadata.mockResolvedValue({ is_read: false });
    list_mail_items.mockResolvedValue(
      item({ server_is_read: false, meta_is_read: false }),
    );

    await init_category_index();
    await flush();

    expect(get_counts().primary.unread).toBe(1);
  });

  it("renders read when metadata says read but the server has not caught up", async () => {
    decrypt_mail_metadata.mockResolvedValue({ is_read: true });
    list_mail_items.mockResolvedValue(
      item({ server_is_read: false, meta_is_read: true }),
    );

    await init_category_index();
    await flush();

    expect(get_counts().primary.unread).toBe(0);
  });

  it("renders unread for a freshly delivered item with a server flag and no metadata blob", async () => {
    list_mail_items.mockResolvedValue(
      item({ server_is_read: false, meta_is_read: null }),
    );

    await init_category_index();
    await flush();

    expect(get_counts().primary.unread).toBe(1);
    expect(decrypt_mail_metadata).not.toHaveBeenCalled();
  });
});
