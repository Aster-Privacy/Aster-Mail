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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  ack_scope_read_intent,
  apply_flag_intents,
  clear_all_read_intents,
  get_read_intent,
  note_read_intent,
  note_scope_read_intent,
  resolve_read_intent,
} from "@/services/read_intent";
import {
  clear_category_index_memory,
  get_index_entries,
  upsert_entries,
} from "@/services/category_index";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CLICK = Date.parse("2026-05-01T12:00:00.000Z");
const SENT_BEFORE_CLICK = "2026-05-01T11:59:55.000Z";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    item_type: "received",
    is_read: false,
    is_trashed: false,
    raw_timestamp: SENT_BEFORE_CLICK,
    ...overrides,
  };
}

function entry(id: string): CategoryIndexEntry {
  return {
    id,
    thread_token: id,
    message_ts: SENT_BEFORE_CLICK,
    is_read: false,
    category: "primary",
  };
}

describe("scope-wide read intent after the server confirms", () => {
  let token = 0;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(CLICK);
    clear_all_read_intents();
    clear_category_index_memory();
    token = note_scope_read_intent();
  });

  afterEach(() => {
    clear_all_read_intents();
    clear_category_index_memory();
    vi.useRealTimers();
  });

  it("still covers older mail while the request is in flight", () => {
    const fetched_at = Date.now();

    expect(apply_flag_intents([row("old")], fetched_at)[0].is_read).toBe(true);
  });

  it("leaves mail fetched after the confirmation unread", () => {
    vi.setSystemTime(CLICK + 1_000);
    ack_scope_read_intent(token);
    vi.setSystemTime(CLICK + 5_000);

    const fetched_at = Date.now();

    expect(apply_flag_intents([row("new")], fetched_at)[0].is_read).toBe(false);
    expect(resolve_read_intent(row("new"))).toBeUndefined();

    upsert_entries([entry("new")], undefined, fetched_at);
    expect(get_index_entries(["new"])[0].is_read).toBe(false);
  });

  it("keeps covering responses requested before the confirmation", () => {
    const stale_fetch = CLICK + 500;

    vi.setSystemTime(CLICK + 1_000);
    ack_scope_read_intent(token);
    vi.setSystemTime(CLICK + 2_000);

    expect(apply_flag_intents([row("old")], stale_fetch)[0].is_read).toBe(true);

    upsert_entries([entry("old")], undefined, stale_fetch);
    expect(get_index_entries(["old"])[0].is_read).toBe(true);
  });

  it("ignores an acknowledgement for a superseded click", () => {
    vi.setSystemTime(CLICK + 1_000);
    note_scope_read_intent();
    ack_scope_read_intent(token);

    expect(apply_flag_intents([row("old")], CLICK + 5_000)[0].is_read).toBe(
      true,
    );
  });

  it("does not touch explicit single-message read state", () => {
    note_read_intent(["kept_read"], true);
    vi.setSystemTime(CLICK + 1_000);
    ack_scope_read_intent(token);
    note_read_intent(["reopened"], false);
    vi.setSystemTime(CLICK + 5_000);

    expect(get_read_intent("kept_read")).toBe(true);
    expect(get_read_intent("reopened")).toBe(false);
    expect(
      apply_flag_intents(
        [row("kept_read"), row("reopened", { is_read: true })],
        Date.now(),
      ).map((email) => email.is_read),
    ).toEqual([true, false]);
  });
});
