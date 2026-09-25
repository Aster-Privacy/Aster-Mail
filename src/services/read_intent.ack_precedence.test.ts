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
  ack_flag_intents,
  apply_flag_intents,
  clear_all_flag_intents,
  get_read_intent,
  note_flag_intents,
  settle_flag_intents,
} from "@/services/read_intent";
import {
  clear_category_index_memory,
  get_counts,
  set_ids_read,
  upsert_entries,
} from "@/services/category_index";

const BASE_NOW = 1_700_000_000_000;

function row(id: string, is_read: boolean, is_starred = false) {
  return { id, is_read, is_starred };
}

function entry(id: string, is_read: boolean): CategoryIndexEntry {
  return {
    id,
    thread_token: id,
    message_ts: "2026-01-01T00:00:00.000Z",
    is_read,
    category: "primary",
  };
}

describe("flag intent acknowledgment precedence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    clear_all_flag_intents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a pending read change over a fetch that starts after it", () => {
    note_flag_intents(["m1"], { is_read: true });
    vi.setSystemTime(BASE_NOW + 500);

    const [result] = apply_flag_intents([row("m1", false)], BASE_NOW + 200);

    expect(result.is_read).toBe(true);
  });

  it("keeps an acknowledged change over a fetch that started before the ack, even after 30 seconds", () => {
    const fetch_started = BASE_NOW + 100;

    note_flag_intents(["m1"], { is_read: true, is_starred: true });
    vi.setSystemTime(BASE_NOW + 1_000);
    ack_flag_intents(["m1"], { is_read: true, is_starred: true });
    vi.setSystemTime(BASE_NOW + 45_000);

    const [result] = apply_flag_intents(
      [row("m1", false, false)],
      fetch_started,
    );

    expect(result.is_read).toBe(true);
    expect(result.is_starred).toBe(true);
  });

  it("lets a fetch that started after the ack win and drops the intent", () => {
    note_flag_intents(["m1"], { is_starred: true });
    vi.setSystemTime(BASE_NOW + 1_000);
    ack_flag_intents(["m1"], { is_starred: true });
    vi.setSystemTime(BASE_NOW + 2_000);

    const [fresh] = apply_flag_intents(
      [row("m1", false, false)],
      BASE_NOW + 1_500,
    );

    expect(fresh.is_starred).toBe(false);

    const [older] = apply_flag_intents(
      [row("m1", false, false)],
      BASE_NOW + 500,
    );

    expect(older.is_starred).toBe(false);
  });

  it("still expires a pending change that is never acknowledged", () => {
    note_flag_intents(["m1"], { is_read: true });
    vi.setSystemTime(BASE_NOW + 30_001);

    expect(get_read_intent("m1")).toBeUndefined();
  });

  it("does not downgrade a pending change when the local index settles it", () => {
    note_flag_intents(["m1"], { is_read: false });
    settle_flag_intents(["m1"], { is_read: false });
    vi.setSystemTime(BASE_NOW + 1_000);

    const [result] = apply_flag_intents([row("m1", true)], BASE_NOW + 500);

    expect(result.is_read).toBe(false);
  });

  it("ignores an ack for a different value", () => {
    note_flag_intents(["m1"], { is_read: false });
    ack_flag_intents(["m1"], { is_read: true });
    vi.setSystemTime(BASE_NOW + 1_000);

    const [result] = apply_flag_intents([row("m1", true)], BASE_NOW + 500);

    expect(result.is_read).toBe(false);
  });
});

describe("category index read state against in-flight syncs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    clear_all_flag_intents();
    clear_category_index_memory();
    upsert_entries([entry("m1", false), entry("m2", false)]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a message read when a sync that started before the read lands late", () => {
    const sync_started = BASE_NOW;

    vi.setSystemTime(BASE_NOW + 200);
    note_flag_intents(["m1"], { is_read: true });
    set_ids_read(["m1"], true);
    ack_flag_intents(["m1"], { is_read: true });

    expect(get_counts().primary?.unread).toBe(1);

    vi.setSystemTime(BASE_NOW + 40_000);
    upsert_entries(
      [entry("m1", false), entry("m2", false)],
      undefined,
      sync_started,
    );

    expect(get_counts().primary?.unread).toBe(1);
  });

  it("accepts a newer server state from a sync that started after the read", () => {
    note_flag_intents(["m1"], { is_read: true });
    set_ids_read(["m1"], true);
    ack_flag_intents(["m1"], { is_read: true });
    vi.setSystemTime(BASE_NOW + 5_000);

    upsert_entries([entry("m1", false)], undefined, BASE_NOW + 4_000);

    expect(get_counts().primary?.unread).toBe(2);
  });

  it("keeps a message unread when a stale sync still reports it read", () => {
    upsert_entries([entry("m1", true)]);
    const sync_started = BASE_NOW;

    vi.setSystemTime(BASE_NOW + 100);
    note_flag_intents(["m1"], { is_read: false });
    set_ids_read(["m1"], false);
    ack_flag_intents(["m1"], { is_read: false });
    vi.setSystemTime(BASE_NOW + 35_000);

    upsert_entries([entry("m1", true)], undefined, sync_started);

    expect(get_counts().primary?.unread).toBe(2);
  });
});
