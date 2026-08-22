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
import { describe, it, expect } from "vitest";

import { group_search_results, expand_thread_ids } from "./thread_grouping";

interface Row {
  id: string;
  subject: string;
  thread_token?: string;
  thread_message_count?: number;
  grouped_email_ids?: string[];
  is_read?: boolean;
  raw_timestamp?: string;
  timestamp?: string;
}

const rows: Row[] = [
  {
    id: "c",
    subject: "Re: 2nd Account",
    thread_token: "t1",
    thread_message_count: 3,
    is_read: true,
    raw_timestamp: "2026-08-20T12:00:00Z",
    timestamp: "Aug 20",
  },
  {
    id: "b",
    subject: "Re: 2nd Account",
    thread_token: "t1",
    thread_message_count: 3,
    is_read: false,
    raw_timestamp: "2026-08-19T12:00:00Z",
    timestamp: "Aug 19",
  },
  {
    id: "a",
    subject: "Verification Links",
    thread_token: "t2",
    thread_message_count: 1,
    is_read: true,
    raw_timestamp: "2026-08-18T12:00:00Z",
    timestamp: "Aug 18",
  },
];

describe("group_search_results", () => {
  it("collapses messages that share a thread into one row", () => {
    const grouped = group_search_results(rows, true);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].id).toBe("c");
    expect(grouped[0].grouped_email_ids).toEqual(["c", "b"]);
    expect(grouped[0].thread_message_count).toBe(3);
    expect(grouped[1].id).toBe("a");
  });

  it("marks a collapsed row unread when any member is unread", () => {
    const grouped = group_search_results(rows, true);

    expect(grouped[0].is_read).toBe(false);
  });

  it("leaves every message on its own row when threading is off", () => {
    const grouped = group_search_results(rows, false);

    expect(grouped).toHaveLength(3);
    expect(grouped.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("keeps a message with no thread token on its own row", () => {
    const loose: Row[] = [{ id: "x", subject: "no thread" }];

    expect(group_search_results(loose, true)).toHaveLength(1);
  });
});

describe("expand_thread_ids", () => {
  it("expands a selected thread row into every message it represents", () => {
    const grouped = group_search_results(rows, true);

    expect(expand_thread_ids(grouped, ["c"]).sort()).toEqual(["b", "c"]);
  });

  it("leaves a single message selection alone", () => {
    const grouped = group_search_results(rows, true);

    expect(expand_thread_ids(grouped, ["a"])).toEqual(["a"]);
  });

  it("does not repeat a message selected twice over", () => {
    const grouped = group_search_results(rows, true);

    expect(expand_thread_ids(grouped, ["c", "a"]).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
