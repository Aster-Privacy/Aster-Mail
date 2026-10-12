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

import { describe, it, expect } from "vitest";

import {
  count_left_read_filter,
  shift_page_offsets_after,
} from "./use_email_list";

function row(id: string, is_read: boolean): InboxEmail {
  return { id, is_read } as InboxEmail;
}

describe("count_left_read_filter", () => {
  const rows = [row("a", false), row("b", true), row("c", true)];

  it("counts nothing when no read filter is active", () => {
    expect(count_left_read_filter(rows, "all")).toBe(0);
  });

  it("counts the rows that were read while the unread filter is active", () => {
    expect(count_left_read_filter(rows, "unread")).toBe(2);
  });

  it("counts the rows that turned unread while the read filter is active", () => {
    expect(count_left_read_filter(rows, "read")).toBe(1);
  });
});

describe("shift_page_offsets_after", () => {
  it("pulls only the later pages back by the rows that left the filter", () => {
    const shifted = shift_page_offsets_after(
      new Map([
        [1, 10],
        [2, 20],
        [3, 30],
      ]),
      1,
      3,
    );

    expect(shifted.get(1)).toBe(10);
    expect(shifted.get(2)).toBe(17);
    expect(shifted.get(3)).toBe(27);
  });

  it("never goes below the start of the list", () => {
    expect(shift_page_offsets_after(new Map([[1, 2]]), 0, 5).get(1)).toBe(0);
  });

  it("leaves offsets alone when nothing left the filter", () => {
    const offsets = new Map([[1, 10]]);

    expect(shift_page_offsets_after(offsets, 0, 0)).toBe(offsets);
  });
});
