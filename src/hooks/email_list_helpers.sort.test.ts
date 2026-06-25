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

import { sort_emails_by_timestamp } from "./email_list_helpers";

function email(id: string, raw_timestamp: string): InboxEmail {
  return { id, raw_timestamp, timestamp: raw_timestamp } as InboxEmail;
}

const unsorted = [
  email("middle", "2022-01-01T00:00:00.000Z"),
  email("newest", "2024-01-01T00:00:00.000Z"),
  email("oldest", "2020-01-01T00:00:00.000Z"),
];

describe("sort_emails_by_timestamp", () => {
  it("sorts newest first when descending", () => {
    expect(sort_emails_by_timestamp(unsorted, "desc").map((e) => e.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("sorts oldest first when ascending", () => {
    expect(sort_emails_by_timestamp(unsorted, "asc").map((e) => e.id)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [...unsorted];
    sort_emails_by_timestamp(input, "asc");
    expect(input.map((e) => e.id)).toEqual(["middle", "newest", "oldest"]);
  });

  it("falls back to the display timestamp when raw is missing", () => {
    const items = [
      { id: "a", timestamp: "2021-01-01T00:00:00.000Z" } as InboxEmail,
      { id: "b", timestamp: "2023-01-01T00:00:00.000Z" } as InboxEmail,
    ];
    expect(sort_emails_by_timestamp(items, "desc").map((e) => e.id)).toEqual([
      "b",
      "a",
    ]);
  });
});
