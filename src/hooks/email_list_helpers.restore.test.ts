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
  collect_restore_entries,
  insert_emails_at,
} from "./email_list_helpers";

function email(id: string): InboxEmail {
  return { id } as unknown as InboxEmail;
}

const list = [email("a"), email("b"), email("c"), email("d")];

describe("collect_restore_entries", () => {
  it("captures the position of every requested row", () => {
    expect(collect_restore_entries(list, ["b", "d"])).toEqual([
      { email: list[1], index: 1 },
      { email: list[3], index: 3 },
    ]);
  });

  it("skips ids that are not in the list", () => {
    expect(collect_restore_entries(list, ["z"])).toEqual([]);
  });
});

describe("insert_emails_at", () => {
  it("puts a removed row back where it was", () => {
    const entries = collect_restore_entries(list, ["b"]);
    const without_b = list.filter((e) => e.id !== "b");

    expect(insert_emails_at(without_b, entries).map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("restores several rows in their original order", () => {
    const entries = collect_restore_entries(list, ["a", "c"]);
    const remaining = list.filter((e) => e.id !== "a" && e.id !== "c");

    expect(insert_emails_at(remaining, entries).map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("clamps a position past the end of a shortened list", () => {
    const entries = collect_restore_entries(list, ["d"]);

    expect(insert_emails_at([email("a")], entries).map((e) => e.id)).toEqual([
      "a",
      "d",
    ]);
  });

  it("returns the same array when every row is already present", () => {
    const entries = collect_restore_entries(list, ["b"]);

    expect(insert_emails_at(list, entries)).toBe(list);
  });
});
