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
import { afterEach, describe, expect, it } from "vitest";

import { delete_device_recovery_database } from "./device_recovery_store";

interface FakeDeleteRequest {
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
}

const original_indexed_db = globalThis.indexedDB;

function set_indexed_db(value: unknown) {
  Reflect.set(globalThis, "indexedDB", value);
}

function stub_delete(outcome: "success" | "blocked" | "error") {
  const names: string[] = [];

  set_indexed_db({
    deleteDatabase: (name: string) => {
      names.push(name);
      const request: FakeDeleteRequest = {
        error: outcome === "error" ? new Error("denied") : null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };

      queueMicrotask(() => {
        if (outcome === "success") request.onsuccess?.();
        if (outcome === "blocked") request.onblocked?.();
        if (outcome === "error") request.onerror?.();
      });

      return request;
    },
  });

  return names;
}

describe("delete_device_recovery_database", () => {
  afterEach(() => {
    set_indexed_db(original_indexed_db);
  });

  it("deletes the whole device recovery database", async () => {
    const names = stub_delete("success");

    await expect(delete_device_recovery_database()).resolves.toBeUndefined();
    expect(names).toEqual(["astermail_device_recovery"]);
  });

  it("resolves when the delete waits for open connections", async () => {
    stub_delete("blocked");

    await expect(delete_device_recovery_database()).resolves.toBeUndefined();
  });

  it("rejects when the browser refuses the delete", async () => {
    stub_delete("error");

    await expect(delete_device_recovery_database()).rejects.toThrow("denied");
  });

  it("does nothing when IndexedDB is unavailable", async () => {
    set_indexed_db(undefined);

    await expect(delete_device_recovery_database()).resolves.toBeUndefined();
  });
});
