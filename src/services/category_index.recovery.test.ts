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

vi.mock("@/hooks/mail_events", () => ({
  on_mail_event: () => {},
  MAIL_EVENTS: {
    EMAIL_RECEIVED: "EMAIL_RECEIVED",
    MAIL_ITEMS_REMOVED: "MAIL_ITEMS_REMOVED",
    MAIL_ACTION: "MAIL_ACTION",
    MAIL_CHANGED: "MAIL_CHANGED",
    MAIL_ITEM_UPDATED: "MAIL_ITEM_UPDATED",
  },
}));

import {
  init_category_index,
  build_index,
  is_build_in_progress,
  is_build_stalled,
  is_fully_built,
  get_page_ids,
  get_category_total,
  clear_category_index,
} from "@/services/category_index";

const BASE_NOW = 1_700_000_000_000;

function never_resolves() {
  return new Promise(() => {});
}

function one_page() {
  return {
    data: {
      items: [
        {
          id: "m1",
          thread_token: undefined,
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

// Minimal correct IndexedDB for the few operations category_index performs
// (open + onupgradeneeded, put/get/clear with tx.oncomplete). The shared test
// setup's mock exposes objectStoreNames as a plain array with no contains().
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
      const tx: Record<string, unknown> = { oncomplete: null, onerror: null, error: null };

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
            () => (req.onsuccess as ((e: unknown) => void) | null)?.({ target: req }),
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
      (req.onupgradeneeded as ((e: unknown) => void) | null)?.({ target: { result: db } });
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

function set_visible_and_dispatch() {
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("category_index build recovery", () => {
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

  it("a healthy build completes and is never reported as stalled", async () => {
    list_mail_items.mockResolvedValue(one_page());

    await init_category_index();
    await flush();

    expect(is_build_in_progress()).toBe(false);
    expect(is_fully_built()).toBe(true);
    expect(is_build_stalled()).toBe(false);
    expect(get_category_total("primary")).toBe(1);
    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);
  });

  it("a build wedged behind a hung request is detected as stalled and recovers on tab focus", async () => {
    // First build hangs forever (request never settles, e.g. tab frozen).
    list_mail_items.mockReturnValue(never_resolves());

    await init_category_index();
    await flush();

    expect(is_build_in_progress()).toBe(true);
    expect(is_build_stalled()).toBe(false); // just started, making progress

    // Time passes while the tab is backgrounded; the build makes no progress.
    vi.setSystemTime(BASE_NOW + 31_000);
    expect(is_build_stalled()).toBe(true);

    // The user returns. The next attempt now succeeds.
    list_mail_items.mockReturnValue(Promise.resolve(one_page()));
    set_visible_and_dispatch();
    await flush();

    // The wedged latch was superseded and the index rebuilt to completion -
    // no manual page refresh required.
    expect(is_build_in_progress()).toBe(false);
    expect(is_build_stalled()).toBe(false);
    expect(is_fully_built()).toBe(true);
    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);
  });

  it("build_index supersedes a stalled build directly", async () => {
    list_mail_items.mockReturnValue(never_resolves());

    await init_category_index();
    await flush();
    expect(is_build_in_progress()).toBe(true);

    vi.setSystemTime(BASE_NOW + 31_000);
    expect(is_build_stalled()).toBe(true);

    // A fresh caller (not the visibility handler) also takes over a stalled build.
    list_mail_items.mockReturnValue(Promise.resolve(one_page()));
    await build_index();
    await flush();

    expect(is_fully_built()).toBe(true);
    expect(is_build_in_progress()).toBe(false);
  });
});
