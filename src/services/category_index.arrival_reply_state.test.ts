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
import type { CategoryIndexEntry } from "@/services/category_index";

import { describe, it, expect, beforeEach } from "vitest";

import {
  upsert_entries,
  get_arrival_reply_state,
  clear_category_index_memory,
} from "@/services/category_index";

function entry(
  id: string,
  thread_token: string | undefined,
  message_ts: string,
): CategoryIndexEntry {
  return {
    id,
    thread_token,
    message_ts,
    is_read: false,
    category: "primary",
  };
}

describe("get_arrival_reply_state", () => {
  beforeEach(() => {
    clear_category_index_memory();
    upsert_entries([
      entry("sent", "t1", "2026-01-01T00:00:00.000Z"),
      entry("reply", "t1", "2026-01-02T00:00:00.000Z"),
      entry("lone_thread", "t2", "2026-01-03T00:00:00.000Z"),
      entry("no_thread", undefined, "2026-01-04T00:00:00.000Z"),
    ]);
  });

  it("reports a message that joins an existing thread as a reply", () => {
    expect(get_arrival_reply_state("reply")).toBe(true);
  });

  it("reports the only message of a thread as not a reply", () => {
    expect(get_arrival_reply_state("lone_thread")).toBe(false);
  });

  it("reports a message without a thread as not a reply", () => {
    expect(get_arrival_reply_state("no_thread")).toBe(false);
  });

  it("reports an unknown message as undetermined so the caller can fall back", () => {
    expect(get_arrival_reply_state("missing")).toBeNull();
    expect(get_arrival_reply_state("")).toBeNull();
  });
});
