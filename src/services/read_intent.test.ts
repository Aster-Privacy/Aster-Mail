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
  apply_read_intents,
  clear_all_read_intents,
  clear_read_intent,
  get_read_intent,
  note_read_intent,
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
