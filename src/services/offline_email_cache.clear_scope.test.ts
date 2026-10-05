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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  account_id: "acct-1" as string | null,
  cancelled: 0,
  complete_tx: true,
  held: [] as Array<() => void>,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => h.account_id,
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  device_encrypt: async (data: string) => data,
  device_decrypt: async (data: string) => data,
}));

vi.mock("@/services/list_snapshot_store", () => ({
  cancel_pending_list_snapshots: () => {
    h.cancelled += 1;
  },
  drop_list_snapshot: async () => undefined,
}));

vi.mock("@/services/crypto/list_decrypt_cache", () => ({
  clear_list_decrypt_cache: () => undefined,
}));

import { clear_email_cache } from "./offline_email_cache";

function fake_request<T>(result: T) {
  const request = {
    result,
    error: null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null,
  };

  queueMicrotask(() => request.onsuccess?.());

  return request;
}

const fake_db = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => undefined,
  close: () => undefined,
  transaction: () => {
    const tx = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      error: null,
      objectStore: () => ({
        delete: (key: string) => {
          h.disk.delete(key);
        },
        getAllKeys: () => fake_request([...h.disk.keys()]),
      }),
    };
    const complete = () => setTimeout(() => tx.oncomplete?.(), 0);

    if (h.complete_tx) complete();
    else h.held.push(complete);

    return tx;
  },
};

const original_indexed_db = globalThis.indexedDB;

function seed(): void {
  h.disk.clear();
  h.disk.set("acct-1:inbox", "offline-1");
  h.disk.set("acct-2:inbox", "offline-2");
  h.disk.set("snapshot:acct-1:category:primary", "snap-1a");
  h.disk.set("snapshot:acct-1:view:sent", "snap-1b");
  h.disk.set("snapshot:acct-2:category:primary", "snap-2a");
  h.disk.set("snapshot:acct-1x:view:sent", "snap-1x");
}

describe("clearing the stored mail lists", () => {
  beforeEach(() => {
    seed();
    h.account_id = "acct-1";
    h.cancelled = 0;
    h.complete_tx = true;
    h.held.length = 0;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      open: () => fake_request(fake_db),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { indexedDB: unknown }).indexedDB =
      original_indexed_db;
  });

  it("removes only the current account's snapshots by default", async () => {
    await clear_email_cache();

    expect([...h.disk.keys()].sort()).toEqual([
      "snapshot:acct-1x:view:sent",
      "snapshot:acct-2:category:primary",
    ]);
    expect(h.cancelled).toBe(1);
  });

  it("keeps every account's snapshots on an account switch", async () => {
    await clear_email_cache("none");

    expect([...h.disk.keys()].sort()).toEqual([
      "snapshot:acct-1:category:primary",
      "snapshot:acct-1:view:sent",
      "snapshot:acct-1x:view:sent",
      "snapshot:acct-2:category:primary",
    ]);
  });

  it("removes every snapshot of the account that signed out", async () => {
    h.account_id = "acct-1";
    await clear_email_cache({ account_id: "acct-2" });

    expect([...h.disk.keys()].sort()).toEqual([
      "snapshot:acct-1:category:primary",
      "snapshot:acct-1:view:sent",
      "snapshot:acct-1x:view:sent",
    ]);
  });

  it("removes every snapshot when no account can be resolved", async () => {
    h.account_id = null;
    await clear_email_cache();

    expect(h.disk.size).toBe(0);
  });

  it("resolves only after the stored rows are gone", async () => {
    h.complete_tx = false;
    let settled = false;
    const cleared = clear_email_cache({ account_id: "acct-1" }).then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(h.held.length).toBe(1));
    expect(settled).toBe(false);

    h.held[0]();
    await cleared;

    expect(settled).toBe(true);
    expect(h.disk.has("snapshot:acct-1:view:sent")).toBe(false);
  });
});
