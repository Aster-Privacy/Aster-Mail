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
import { describe, expect, it, vi } from "vitest";

import { release_on_version_change } from "./idb_release";

function fake_connection(close: () => void): IDBDatabase {
  return { close, onversionchange: null } as unknown as IDBDatabase;
}

function request_version_change(db: IDBDatabase): void {
  db.onversionchange?.call(
    db,
    new Event("versionchange") as IDBVersionChangeEvent,
  );
}

describe("releasing a database connection", () => {
  it("returns the same connection", () => {
    const db = fake_connection(vi.fn());

    expect(release_on_version_change(db)).toBe(db);
  });

  it("closes the connection when a deletion asks for it", () => {
    const close = vi.fn();
    const db = release_on_version_change(fake_connection(close));

    request_version_change(db);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("drops the cached connection before closing", () => {
    const order: string[] = [];
    const db = release_on_version_change(
      fake_connection(() => {
        order.push("close");
      }),
      () => {
        order.push("forget");
      },
    );

    request_version_change(db);

    expect(order).toEqual(["forget", "close"]);
  });

  it("still closes when dropping the cached connection throws", () => {
    const close = vi.fn();
    const db = release_on_version_change(fake_connection(close), () => {
      throw new Error("forget failed");
    });

    expect(() => request_version_change(db)).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("survives a connection that refuses to close", () => {
    const db = release_on_version_change(
      fake_connection(() => {
        throw new Error("already closed");
      }),
    );

    expect(() => request_version_change(db)).not.toThrow();
  });
});
