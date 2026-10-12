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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  ALIAS_SORT_STORAGE_KEY,
  read_alias_sort_mode,
  sort_alias_entries,
  store_alias_sort_mode,
} from "./alias_sort";

const entries = [
  { sort_address: "shop@diogo.example", created_at: "2026-03-01T10:00:00Z" },
  { sort_address: "Bank@diogo.example", created_at: "2026-01-15T10:00:00Z" },
  { sort_address: "news10@diogo.example", created_at: "2026-05-20T10:00:00Z" },
  { sort_address: "news2@diogo.example", created_at: "2026-02-10T10:00:00Z" },
  { sort_address: "ébène@diogo.example", created_at: "2026-04-05T10:00:00Z" },
];

const order = (mode: Parameters<typeof sort_alias_entries>[1]) =>
  sort_alias_entries(entries, mode, "en").map((e) => e.sort_address);

describe("sort_alias_entries", () => {
  it("lists the newest first by default", () => {
    expect(order("newest")).toEqual([
      "news10@diogo.example",
      "ébène@diogo.example",
      "shop@diogo.example",
      "news2@diogo.example",
      "Bank@diogo.example",
    ]);
  });

  it("lists the oldest first", () => {
    expect(order("oldest")).toEqual([
      "Bank@diogo.example",
      "news2@diogo.example",
      "shop@diogo.example",
      "ébène@diogo.example",
      "news10@diogo.example",
    ]);
  });

  it("sorts addresses A to Z ignoring case and accents, with numbers in order", () => {
    expect(order("az")).toEqual([
      "Bank@diogo.example",
      "ébène@diogo.example",
      "news2@diogo.example",
      "news10@diogo.example",
      "shop@diogo.example",
    ]);
  });

  it("sorts addresses Z to A", () => {
    expect(order("za")).toEqual([
      "shop@diogo.example",
      "news10@diogo.example",
      "news2@diogo.example",
      "ébène@diogo.example",
      "Bank@diogo.example",
    ]);
  });

  it("does not reorder the list it was given", () => {
    const before = entries.map((e) => e.sort_address);

    sort_alias_entries(entries, "az", "en");
    expect(entries.map((e) => e.sort_address)).toEqual(before);
  });

  it("puts the newer of two equal addresses first and keeps unparseable dates last", () => {
    const sorted = sort_alias_entries(
      [
        { sort_address: "a@x.example", created_at: "not a date" },
        { sort_address: "a@x.example", created_at: "2026-01-01T00:00:00Z" },
        { sort_address: "b@x.example", created_at: "2026-06-01T00:00:00Z" },
      ],
      "newest",
      "en",
    );

    expect(sorted.map((e) => e.created_at)).toEqual([
      "2026-06-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      "not a date",
    ]);
  });
});

describe("remembered alias sort", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starts at newest first and remembers the last choice", () => {
    expect(read_alias_sort_mode()).toBe("newest");
    store_alias_sort_mode("za");
    expect(localStorage.getItem(ALIAS_SORT_STORAGE_KEY)).toBe("za");
    expect(read_alias_sort_mode()).toBe("za");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(ALIAS_SORT_STORAGE_KEY, "biggest");
    expect(read_alias_sort_mode()).toBe("newest");
  });

  it("falls back to newest first when storage is unavailable", () => {
    const blocked = () => {
      throw new Error("blocked");
    };

    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });

    expect(() => store_alias_sort_mode("az")).not.toThrow();
    expect(read_alias_sort_mode()).toBe("newest");
  });
});
