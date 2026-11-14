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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { create_transactional_indexed_db } from "@/tests/fixtures/transactional_indexed_db";

const keys = vi.hoisted(() => ({ current: new Uint8Array(32).fill(1) }));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => keys.current.slice(),
}));

import {
  encrypted_clear_all,
  encrypted_get,
  encrypted_set,
  encrypted_set_plaintext,
  rewrap_legacy_entries,
} from "./encrypted_storage";
import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
} from "./legacy_keks";

interface RawEntry {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  version: number;
  timestamp: number;
}

const database = create_transactional_indexed_db();

Object.assign(globalThis.indexedDB, {
  open: database.factory.open,
  deleteDatabase: database.factory.deleteDatabase,
});

const master = {} as CryptoKey;
const legacy_raw = new Uint8Array(32).fill(41);
const current_raw = new Uint8Array(32).fill(77);
const stranger_raw = new Uint8Array(32).fill(99);

function with_store<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("astermail_secure_db");

    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = run(db.transaction("encrypted_data", mode).objectStore("encrypted_data"));

      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    };
  });
}

function raw_entry(key: string): Promise<RawEntry | undefined> {
  return with_store("readonly", (store) => store.get(key));
}

function same_bytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

async function write_under(raw: Uint8Array, key: string, value: unknown): Promise<RawEntry> {
  keys.current = raw;
  await encrypted_set(key, value, master);

  return (await raw_entry(key))!;
}

async function switch_to_current_with_legacy_pool(): Promise<void> {
  keys.current = current_raw;
  await append_legacy_key_raw_bytes(legacy_raw.slice());
}

describe("rewrap_legacy_entries", () => {
  beforeEach(async () => {
    clear_legacy_keks_from_memory();
    keys.current = current_raw;
    await encrypted_clear_all();
  });

  afterEach(() => {
    clear_legacy_keks_from_memory();
  });

  it("reseals an entry only a legacy key opens and keeps its timestamp", async () => {
    const value = { drafts: ["one", "two"] };
    const before = await write_under(legacy_raw, "multi_drafts_u1", value);

    await switch_to_current_with_legacy_pool();
    expect(await encrypted_get("multi_drafts_u1", master)).toEqual(value);

    const counts = await rewrap_legacy_entries();
    const after = (await raw_entry("multi_drafts_u1"))!;

    expect(counts).toEqual({ rewrapped: 1, current: 0, unreadable: 0, changed: 0 });
    expect(after.timestamp).toBe(before.timestamp);
    expect(same_bytes(after.iv, before.iv)).toBe(false);

    clear_legacy_keks_from_memory();
    expect(await encrypted_get("multi_drafts_u1", master)).toEqual(value);
  });

  it("reseals bytes stored as raw plaintext so they still read back", async () => {
    const value = { items: [{ id: "a" }] };

    keys.current = legacy_raw;
    await encrypted_set_plaintext(
      "search_index_u1",
      new TextEncoder().encode(JSON.stringify(value)),
      master,
    );
    await switch_to_current_with_legacy_pool();

    expect((await rewrap_legacy_entries()).rewrapped).toBe(1);

    clear_legacy_keks_from_memory();
    expect(await encrypted_get("search_index_u1", master)).toEqual(value);
  });

  it("leaves an entry the current key opens untouched", async () => {
    const before = await write_under(current_raw, "prefs_u1", { theme: "dark" });

    await switch_to_current_with_legacy_pool();

    const counts = await rewrap_legacy_entries();
    const after = (await raw_entry("prefs_u1"))!;

    expect(counts).toEqual({ rewrapped: 0, current: 1, unreadable: 0, changed: 0 });
    expect(same_bytes(after.iv, before.iv)).toBe(true);
    expect(same_bytes(after.ciphertext, before.ciphertext)).toBe(true);
  });

  it("keeps an entry no key opens exactly as it was", async () => {
    const before = await write_under(stranger_raw, "lost_u1", { gone: true });

    await switch_to_current_with_legacy_pool();

    const counts = await rewrap_legacy_entries();
    const after = (await raw_entry("lost_u1"))!;

    expect(counts).toEqual({ rewrapped: 0, current: 0, unreadable: 1, changed: 0 });
    expect(same_bytes(after.ciphertext, before.ciphertext)).toBe(true);
  });

  it("never rewrites an entry from a newer storage version", async () => {
    const before = await write_under(legacy_raw, "future_u1", { v: 2 });
    const future = { ...before, version: before.version + 1 };

    await with_store("readwrite", (store) => store.put(future, "future_u1"));
    await switch_to_current_with_legacy_pool();

    const counts = await rewrap_legacy_entries();
    const after = (await raw_entry("future_u1"))!;

    expect(counts.rewrapped).toBe(0);
    expect(after.version).toBe(future.version);
    expect(same_bytes(after.ciphertext, before.ciphertext)).toBe(true);
  });

  it("handles a mix of legacy, current and unreadable entries in one pass", async () => {
    await write_under(legacy_raw, "a", 1);
    await write_under(legacy_raw, "b", 2);
    await write_under(current_raw, "c", 3);
    await write_under(stranger_raw, "d", 4);
    await switch_to_current_with_legacy_pool();

    expect(await rewrap_legacy_entries()).toEqual({
      rewrapped: 2,
      current: 1,
      unreadable: 1,
      changed: 0,
    });
    expect(await rewrap_legacy_entries()).toEqual({
      rewrapped: 0,
      current: 3,
      unreadable: 1,
      changed: 0,
    });
  });
});
