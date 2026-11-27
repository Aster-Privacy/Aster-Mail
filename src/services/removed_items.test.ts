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
  clear_removed_items,
  drop_removed_after,
  forget_removed_ids,
  hold_removed_ids,
  is_recently_removed,
  note_removed_ids,
  release_removed_ids,
  removed_within,
} from "./removed_items";

const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("removed_items", () => {
  beforeEach(() => {
    clear_removed_items();
  });

  it("drops rows removed after a fetch started", () => {
    const started = Date.now();

    note_removed_ids(["b"]);

    expect(drop_removed_after(rows, started)).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
  });

  it("keeps rows removed before a fetch started", () => {
    note_removed_ids(["b"]);

    expect(drop_removed_after(rows, Date.now() + 1)).toEqual(rows);
  });

  it("keeps every row when nothing was removed", () => {
    expect(drop_removed_after(rows, Date.now())).toBe(rows);
  });

  it("stops reporting an id once it is restored", () => {
    note_removed_ids(["b"]);
    expect(is_recently_removed("b")).toBe(true);

    forget_removed_ids(["b"]);

    expect(is_recently_removed("b")).toBe(false);
    expect(drop_removed_after(rows, Date.now() - 1000)).toEqual(rows);
  });

  it("drops a held row from fetches that start after the removal", () => {
    hold_removed_ids(["b"]);

    expect(drop_removed_after(rows, Date.now() + 60_000)).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
  });

  it("returns to normal timing once the hold is released", () => {
    hold_removed_ids(["b"]);
    release_removed_ids(["b"]);

    expect(drop_removed_after(rows, Date.now() + 60_000)).toEqual(rows);
    expect(is_recently_removed("b")).toBe(true);
  });

  it("keeps a row held until every hold is released", () => {
    hold_removed_ids(["b"]);
    hold_removed_ids(["b"]);
    release_removed_ids(["b"]);

    expect(drop_removed_after(rows, Date.now() + 60_000)).toHaveLength(2);
  });

  it("reports a recent removal", () => {
    expect(removed_within(2_000)).toBe(false);

    note_removed_ids(["a"]);

    expect(removed_within(2_000)).toBe(true);
  });
});
