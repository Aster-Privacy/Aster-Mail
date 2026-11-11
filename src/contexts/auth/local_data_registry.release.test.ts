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
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { erase_indexed_databases } from "./local_data_registry";

import { ensure_pepper, read_app_lock_pepper } from "@/services/app_lock_store";
import { secure_get, secure_set } from "@/services/secure_storage";
import {
  create_version_change_indexed_db,
  replace_indexed_db,
  type VersionChangeIndexedDb,
} from "@/tests/fixtures/version_change_indexed_db";

const PEPPER_DB = "aster_app_lock";
const SESSION_DB = "astermail_session_db";
const HELD_DB = "astermail_secure_db";
const ACCOUNT = "account-1";

function install_database(): VersionChangeIndexedDb {
  const fake = create_version_change_indexed_db();

  onTestFinished(replace_indexed_db(fake.factory));

  return fake;
}

function hold_open(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function hold_with_record(name: string): Promise<IDBDatabase> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("kept");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("kept", "readwrite");

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore("kept").put("secret", "key");
  });

  return db;
}

describe("erasing databases that are still open", () => {
  it("removes the app lock pepper store while its connection is open", async () => {
    const fake = install_database();
    const pepper = await ensure_pepper(ACCOUNT);

    expect(pepper).toBeInstanceOf(Uint8Array);
    expect(await read_app_lock_pepper(ACCOUNT)).toEqual(pepper);
    expect(fake.database_names()).toContain(PEPPER_DB);
    expect(fake.open_connections(PEPPER_DB)).toBeGreaterThan(0);

    expect(await erase_indexed_databases()).toEqual({ failed: [], blocked: [] });

    expect(fake.open_connections(PEPPER_DB)).toBe(0);
    expect(fake.database_names()).not.toContain(PEPPER_DB);
    expect(await read_app_lock_pepper(ACCOUNT)).toBeNull();
  });

  it("removes the session database and reopens it on the next use", async () => {
    const fake = install_database();

    await secure_set("held", { value: 1 });

    expect(fake.open_connections(SESSION_DB)).toBe(1);

    expect(await erase_indexed_databases()).toEqual({ failed: [], blocked: [] });

    expect(fake.open_connections(SESSION_DB)).toBe(0);
    expect(fake.database_names()).not.toContain(SESSION_DB);

    await secure_set("after", { value: 2 });

    expect(await secure_get<{ value: number }>("after")).toEqual({ value: 2 });
    expect(await secure_get<{ value: number }>("held")).toBeNull();
  });

  it("waits for a blocked deletion to finish once the holder closes", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const fake = install_database();
    const held = await hold_open(HELD_DB);

    setTimeout(() => held.close(), 1500);

    const pending = erase_indexed_databases();

    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.database_names()).toContain(HELD_DB);

    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toEqual({ failed: [], blocked: [] });
    expect(fake.database_names()).not.toContain(HELD_DB);
  });

  it("leaves no database behind that was not there before", async () => {
    const fake = install_database();

    expect(await erase_indexed_databases()).toEqual({ failed: [], blocked: [] });
    expect(fake.database_names()).toEqual([]);
  });

  it("reports a database whose holder never lets go", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const fake = install_database();
    const held = await hold_with_record(HELD_DB);

    expect(fake.record_count(HELD_DB)).toBe(1);

    const pending = erase_indexed_databases();

    await vi.advanceTimersByTimeAsync(5000);

    expect(await pending).toEqual({ failed: [], blocked: [HELD_DB] });
    expect(fake.database_names()).toContain(HELD_DB);
    expect(fake.record_count(HELD_DB)).toBe(0);

    held.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.database_names()).not.toContain(HELD_DB);
  });

  it("waits on the deletion already asked for when a blocked database is retried", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const fake = install_database();
    const asked = vi.spyOn(fake.factory, "deleteDatabase");
    const held = await hold_with_record(HELD_DB);
    const first = erase_indexed_databases([HELD_DB]);

    await vi.advanceTimersByTimeAsync(5000);

    expect(await first).toEqual({ failed: [], blocked: [HELD_DB] });

    const retry = erase_indexed_databases([HELD_DB]);

    await vi.advanceTimersByTimeAsync(500);
    held.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(await retry).toEqual({ failed: [], blocked: [] });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(fake.clear_calls(HELD_DB)).toBe(1);
    expect(fake.database_names()).toEqual([]);
  });

  it("only touches the databases a retry names", async () => {
    const fake = install_database();
    const asked = vi.spyOn(fake.factory, "deleteDatabase");

    expect(await erase_indexed_databases([PEPPER_DB])).toEqual({ failed: [], blocked: [] });
    expect(asked.mock.calls.map(([name]) => name)).toEqual([PEPPER_DB]);
  });
});
