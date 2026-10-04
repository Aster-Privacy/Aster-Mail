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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  puts: 0,
  account_id: "acct-1" as string | null,
  vault: true,
  folders: [] as { folder_token: string; is_password_protected: boolean }[],
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => h.account_id,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => h.vault,
}));

vi.mock("@/hooks/use_folders", () => ({
  get_cached_folders: () => h.folders,
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (data: string) =>
    `sealed:${Array.from(new TextEncoder().encode(data))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`,
  secure_decrypt: async (sealed: string) => {
    if (!sealed.startsWith("sealed:")) throw new Error("not sealed");

    const hex = sealed.slice("sealed:".length);
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    return new TextDecoder().decode(bytes);
  },
}));

vi.mock("@/utils/date_format", () => ({
  format_email_list_timestamp: (date: Date) => `fmt:${date.toISOString()}`,
}));

import {
  cancel_pending_list_snapshots,
  drop_list_snapshot,
  read_list_snapshot,
  schedule_list_snapshot,
} from "./list_snapshot_store";

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
        put: (value: unknown, key: string) => {
          h.puts += 1;
          h.disk.set(key, value);
        },
        delete: (key: string) => {
          h.disk.delete(key);
        },
        get: (key: string) => fake_request(h.disk.get(key)),
      }),
    };

    queueMicrotask(() => tx.oncomplete?.());

    return tx;
  },
};

const original_indexed_db = globalThis.indexedDB;
const OWNER = "me@example.test";
const SIGNATURE = "primary:0:g1~iso~24h:rr:m0,m1";
const SCOPE = "category:primary";
const RECORD_KEY = "snapshot:acct-1:category:primary";
const FORMAT = {} as never;

function make_rows(count = 2): InboxEmail[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `m${index}`,
        subject: `quarterly figures ${index}`,
        preview: `private body ${index}`,
        timestamp: "old label",
        raw_timestamp: new Date(Date.UTC(2026, 7, 1, 10, index)).toISOString(),
        is_read: true,
        is_selected: false,
      }) as unknown as InboxEmail,
  );
}

async function settle(ms = 1000): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}

function read(owner = OWNER, signature = SIGNATURE) {
  return read_list_snapshot(SCOPE, owner, signature, FORMAT);
}

describe("list snapshot store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      open: () => fake_request(fake_db),
    };
    cancel_pending_list_snapshots();
    h.disk.clear();
    h.puts = 0;
    h.account_id = "acct-1";
    h.vault = true;
    h.folders = [];
  });

  afterEach(() => {
    cancel_pending_list_snapshots();
    vi.useRealTimers();
    (globalThis as unknown as { indexedDB: unknown }).indexedDB =
      original_indexed_db;
  });

  it("restores the saved rows with fresh timestamps", async () => {
    const rows = make_rows();

    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, rows);
    await settle();

    const snapshot = await read();

    expect(snapshot!.emails.map((email) => email.id)).toEqual(["m0", "m1"]);
    expect(snapshot!.emails[0].subject).toBe("quarterly figures 0");
    expect(snapshot!.emails[0].timestamp).toBe(`fmt:${rows[0].raw_timestamp}`);
    expect(typeof snapshot!.saved_at).toBe("number");
  });

  it("never stores readable mail content", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    const stored = h.disk.get(RECORD_KEY) as string;

    expect(typeof stored).toBe("string");
    expect(stored.startsWith("sealed:")).toBe(true);
    expect(stored).not.toContain("quarterly");
    expect(stored).not.toContain("private body");
    expect(stored).not.toContain(OWNER);
  });

  it("waits for the list to settle and writes once", async () => {
    schedule_list_snapshot(SCOPE, OWNER, "older", make_rows(1));
    await settle(500);
    expect(h.puts).toBe(0);

    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    expect(h.puts).toBe(1);
    expect((await read())!.emails).toHaveLength(2);
    expect(await read(OWNER, "older")).toBeNull();
  });

  it("skips a save that repeats the last one", async () => {
    const rows = make_rows();

    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, rows);
    await settle();
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, rows);
    await settle();

    expect(h.puts).toBe(1);
  });

  it("returns nothing for another owner or another page signature", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    expect(await read("other@example.test")).toBeNull();
    expect(await read(OWNER, `${SIGNATURE},m2`)).toBeNull();
  });

  it("keeps accounts apart", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    h.account_id = "acct-2";

    expect(await read()).toBeNull();
  });

  it("expires after a week", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);

    expect(await read()).toBeNull();
  });

  it("does nothing while the vault is locked", async () => {
    h.vault = false;
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    expect(h.puts).toBe(0);

    h.vault = true;
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();
    h.vault = false;

    expect(await read()).toBeNull();
  });

  it("does nothing without a signed-in account", async () => {
    h.account_id = null;
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    expect(h.puts).toBe(0);
    expect(await read()).toBeNull();
  });

  it("removes the snapshot instead of saving a protected folder row", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();
    expect(h.disk.has(RECORD_KEY)).toBe(true);

    h.folders = [{ folder_token: "locked", is_password_protected: true }];

    const rows = make_rows();

    rows[1] = {
      ...rows[1],
      folders: [{ folder_token: "locked" }],
    } as unknown as InboxEmail;
    schedule_list_snapshot(SCOPE, OWNER, "next", rows);
    await settle();

    expect(h.puts).toBe(1);
    expect(h.disk.has(RECORD_KEY)).toBe(false);
  });

  it("saves rows in folders that are not protected", async () => {
    h.folders = [{ folder_token: "open", is_password_protected: false }];

    const rows = make_rows();

    rows[0] = {
      ...rows[0],
      folders: [{ folder_token: "open" }],
    } as unknown as InboxEmail;
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, rows);
    await settle();

    expect((await read())!.emails).toHaveLength(2);
  });

  it("refuses foldered rows when folders are protected later or unknown", async () => {
    h.folders = [{ folder_token: "open", is_password_protected: false }];

    const rows = make_rows();

    rows[0] = {
      ...rows[0],
      folders: [{ folder_token: "open" }],
    } as unknown as InboxEmail;
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, rows);
    await settle();

    h.folders = [{ folder_token: "open", is_password_protected: true }];
    expect(await read()).toBeNull();

    h.folders = [];
    expect(await read()).toBeNull();
  });

  it("removes the snapshot when the list is empty", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();

    schedule_list_snapshot(SCOPE, OWNER, "empty", []);
    await settle();

    expect(h.disk.has(RECORD_KEY)).toBe(false);
  });

  it("does not persist row selection and caps the row count", async () => {
    const rows = make_rows(130);

    rows[0] = { ...rows[0], is_selected: true };
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, rows);
    await settle();

    const snapshot = await read();

    expect(snapshot!.emails).toHaveLength(100);
    expect(snapshot!.emails[0].is_selected).toBe(false);
  });

  it("cancels a pending save", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    cancel_pending_list_snapshots();
    await settle();

    expect(h.puts).toBe(0);
  });

  it("drops a stored snapshot and its pending save", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    await settle();
    schedule_list_snapshot(SCOPE, OWNER, "next", make_rows(3));

    await drop_list_snapshot(SCOPE);
    await settle();

    expect(h.disk.has(RECORD_KEY)).toBe(false);
    expect(h.puts).toBe(1);
  });

  it("does not let a write in flight outlive a drop", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    vi.advanceTimersByTime(1000);
    await drop_list_snapshot(SCOPE);
    await settle();

    expect(h.puts).toBe(0);
    expect(h.disk.has(RECORD_KEY)).toBe(false);
  });

  it("does not let a write in flight outlive a full clear", async () => {
    schedule_list_snapshot(SCOPE, OWNER, SIGNATURE, make_rows());
    vi.advanceTimersByTime(1000);
    cancel_pending_list_snapshots();
    await settle();

    expect(h.puts).toBe(0);
  });

  it("returns nothing when the stored value cannot be opened", async () => {
    h.disk.set(RECORD_KEY, "garbage");

    expect(await read()).toBeNull();
  });
});
