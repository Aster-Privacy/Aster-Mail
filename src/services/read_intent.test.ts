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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  apply_flag_intents,
  apply_read_intents,
  clear_all_flag_intents,
  clear_all_read_intents,
  clear_flag_intents,
  clear_read_intent,
  get_flag_intent,
  get_read_intent,
  get_snooze_intent,
  is_removal_intended,
  note_flag_intents,
  note_read_intent,
  pick_flag_intents,
  resolve_read_intent,
} from "@/services/read_intent";

const BASE_NOW = 1_700_000_000_000;

describe("read_intent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    clear_all_read_intents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("overrides a stale server row with the pending client state", () => {
    note_read_intent(["m1"], false);

    const rows = apply_read_intents([
      { id: "m1", is_read: true },
      { id: "m2", is_read: true },
    ]);

    expect(rows).toEqual([
      { id: "m1", is_read: false },
      { id: "m2", is_read: true },
    ]);
  });

  it("returns the same array when nothing needs to change", () => {
    note_read_intent(["m1"], true);
    const rows = [{ id: "m1", is_read: true }];

    expect(apply_read_intents(rows)).toBe(rows);
  });

  it("expires an intent after the guard window", () => {
    note_read_intent(["m1"], false);
    vi.setSystemTime(BASE_NOW + 30_000);

    expect(get_read_intent("m1")).toBeUndefined();
  });

  it("only clears an intent when the failed write matches its direction", () => {
    note_read_intent(["m1"], false);
    clear_read_intent(["m1"], true);

    expect(get_read_intent("m1")).toBe(false);

    clear_read_intent(["m1"], false);

    expect(get_read_intent("m1")).toBeUndefined();
  });

  it("keeps a grouped row unread while any member is intended unread", () => {
    note_read_intent(["m2"], false);

    expect(
      resolve_read_intent({
        id: "m1",
        is_read: true,
        grouped_email_ids: ["m1", "m2"],
      }),
    ).toBe(false);
  });
});

describe("flag_intents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    clear_all_flag_intents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("overlays pending star and pin state onto stale rows", () => {
    note_flag_intents(["m1"], { is_starred: true, is_pinned: true });

    const rows = apply_flag_intents([
      { id: "m1", is_read: true, is_starred: false, is_pinned: false },
      { id: "m2", is_read: true, is_starred: false, is_pinned: false },
    ]);

    expect(rows[0]).toEqual({
      id: "m1",
      is_read: true,
      is_starred: true,
      is_pinned: true,
    });
    expect(rows[1].is_starred).toBe(false);
  });

  it("picks only flag fields out of a metadata patch", () => {
    expect(
      pick_flag_intents({
        is_read: true,
        is_starred: false,
        snoozed_until: null,
        folders: ["f1"],
        category: "x",
      }),
    ).toEqual({ is_read: true, is_starred: false, snoozed_until: null });
  });

  it("marks trashed, archived, spam, and future snooze as removals", () => {
    note_flag_intents(["t"], { is_trashed: true });
    note_flag_intents(["a"], { is_archived: true });
    note_flag_intents(["s"], { is_spam: true });
    note_flag_intents(["z"], {
      snoozed_until: new Date(BASE_NOW + 60_000).toISOString(),
    });
    note_flag_intents(["p"], {
      snoozed_until: new Date(BASE_NOW - 60_000).toISOString(),
    });
    note_flag_intents(["u"], { is_trashed: false, snoozed_until: null });

    expect(is_removal_intended("t")).toBe(true);
    expect(is_removal_intended("a")).toBe(true);
    expect(is_removal_intended("s")).toBe(true);
    expect(is_removal_intended("z")).toBe(true);
    expect(is_removal_intended("p")).toBe(false);
    expect(is_removal_intended("u")).toBe(false);
    expect(is_removal_intended("missing")).toBe(false);
  });

  it("overlays a snooze onto a row and clears it when unsnoozed", () => {
    const until = new Date(BASE_NOW + 60_000).toISOString();

    note_flag_intents(["m1"], { snoozed_until: until });
    note_flag_intents(["m2"], { snoozed_until: null });

    const rows = apply_flag_intents([
      { id: "m1", is_read: true },
      { id: "m2", is_read: true, snoozed_until: until },
    ]);

    expect(rows[0].snoozed_until).toBe(until);
    expect(rows[1].snoozed_until).toBeUndefined();
    expect(get_snooze_intent("m2")).toBeNull();
  });

  it("expires removal intents after the guard window", () => {
    note_flag_intents(["m1"], { is_trashed: true, is_starred: true });
    vi.setSystemTime(BASE_NOW + 30_000);

    expect(is_removal_intended("m1")).toBe(false);
    expect(get_flag_intent("m1", "is_starred")).toBeUndefined();
  });

  it("only clears an intent whose value matches the failed write", () => {
    note_flag_intents(["m1"], { is_starred: true, is_archived: true });
    clear_flag_intents(["m1"], { is_starred: false });

    expect(get_flag_intent("m1", "is_starred")).toBe(true);

    clear_flag_intents(["m1"], { is_starred: true });

    expect(get_flag_intent("m1", "is_starred")).toBeUndefined();
    expect(get_flag_intent("m1", "is_archived")).toBe(true);
  });

  it("drops the oldest entries past the capacity cap", () => {
    for (let i = 0; i < 2001; i += 1) {
      note_flag_intents(["m" + String(i)], { is_starred: true });
    }

    expect(get_flag_intent("m0", "is_starred")).toBeUndefined();
    expect(get_flag_intent("m2000", "is_starred")).toBe(true);
  });

  it("clears every intent kind on account clear", () => {
    note_flag_intents(["m1"], { is_starred: true, is_trashed: true });
    clear_all_read_intents();

    expect(get_flag_intent("m1", "is_starred")).toBeUndefined();
    expect(is_removal_intended("m1")).toBe(false);
  });
});
