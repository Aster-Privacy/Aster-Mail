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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
}));

import { encrypted_has, encrypted_set } from "./encrypted_storage";

const master = {} as CryptoKey;

function current_connection(): IDBDatabase {
  const requests = vi.mocked(indexedDB.open).mock.results;

  return (requests[requests.length - 1].value as IDBOpenDBRequest).result;
}

describe("encrypted storage connection release", () => {
  it("closes its connection when another tab deletes the database", async () => {
    await encrypted_set("held", { value: 1 }, master);

    const connection = current_connection();
    const close = vi.mocked(connection.close);
    const opens_before = vi.mocked(indexedDB.open).mock.calls.length;

    close.mockClear();

    expect(typeof connection.onversionchange).toBe("function");

    connection.onversionchange?.call(
      connection,
      new Event("versionchange") as IDBVersionChangeEvent,
    );

    expect(close).toHaveBeenCalledTimes(1);

    await encrypted_set("after", { value: 2 }, master);

    expect(vi.mocked(indexedDB.open).mock.calls.length).toBe(opens_before + 1);
    expect(await encrypted_has("after")).toBe(true);
  });
});
