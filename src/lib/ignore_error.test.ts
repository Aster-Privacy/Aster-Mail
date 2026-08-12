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
import { describe, it, expect, beforeEach } from "vitest";

import {
  clear_ignored_errors,
  ignore_error,
  ignored_errors,
} from "./ignore_error";

describe("ignore_error", () => {
  beforeEach(() => {
    clear_ignored_errors();
  });

  it("records the context and the error name", () => {
    ignore_error("lib/example:run", new TypeError("boom"));
    const entries = ignored_errors();

    expect(entries).toHaveLength(1);
    expect(entries[0].context).toBe("lib/example:run");
    expect(entries[0].name).toBe("TypeError");
    expect(typeof entries[0].at).toBe("number");
  });

  it("never retains the error message", () => {
    ignore_error("lib/example:run", new Error("user@example.com failed"));
    expect(JSON.stringify(ignored_errors())).not.toContain("user@example.com");
  });

  it("handles non-error values", () => {
    ignore_error("a", "text");
    ignore_error("b", 42);
    ignore_error("c", null);
    ignore_error("d", undefined);
    ignore_error("e");
    ignore_error("f", { name: "AbortError" });
    expect(ignored_errors().map((entry) => entry.name)).toEqual([
      "string",
      "number",
      "null",
      "undefined",
      "undefined",
      "AbortError",
    ]);
  });

  it("bounds the buffer at 100 entries and keeps the newest", () => {
    for (let i = 0; i < 150; i += 1) ignore_error(`ctx_${i}`);
    const entries = ignored_errors();

    expect(entries).toHaveLength(100);
    expect(entries[0].context).toBe("ctx_50");
    expect(entries[99].context).toBe("ctx_149");
  });

  it("returns a copy that callers cannot use to mutate the buffer", () => {
    ignore_error("one");
    const entries = ignored_errors() as IgnoredEntryList;

    entries.length = 0;
    expect(ignored_errors()).toHaveLength(1);
  });
});

type IgnoredEntryList = { length: number };
