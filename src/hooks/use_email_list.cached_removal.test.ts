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
import type { EmailListState, InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { overlay_cached_state } from "./use_email_list";
import { begin_list_removal } from "./list_removal";
import { merge_silent_refresh_emails } from "./email_list_helpers/silent_refresh";

import { clear_removed_items } from "@/services/removed_items";

function make_rows(ids: string[]): InboxEmail[] {
  return ids.map((id) => ({ id }) as InboxEmail);
}

function make_state(ids: string[]): EmailListState {
  return {
    emails: make_rows(ids),
    is_loading: false,
    is_loading_more: false,
    has_initial_load: true,
    total_messages: ids.length,
  } as EmailListState;
}

function count_exits(history: string[][], id: string): number {
  let exits = 0;

  for (let i = 1; i < history.length; i += 1) {
    if (history[i - 1].includes(id) && !history[i].includes(id)) exits += 1;
  }

  return exits;
}

describe("overlay_cached_state", () => {
  beforeEach(() => {
    clear_removed_items();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a row removed after the cache was written out of the restored view", () => {
    const cached = { state: make_state(["a", "b", "c"]), time: Date.now() };

    vi.advanceTimersByTime(1_000);
    let rows = cached.state.emails;
    const removal = begin_list_removal(rows, ["b"], {
      remove_emails: (ids) => {
        rows = rows.filter((row) => !ids.includes(row.id));
      },
      restore_emails: () => {},
    });

    removal.settle([]);

    const restored = overlay_cached_state(cached);

    expect(restored.emails.map((row) => row.id)).toEqual(["a", "c"]);
    expect(restored.total_messages).toBe(2);
  });

  it("returns the cached state untouched when nothing was removed", () => {
    const cached = { state: make_state(["a", "b"]), time: Date.now() };

    expect(overlay_cached_state(cached)).toBe(cached.state);
  });

  it("removes a deleted id once across a view switch and a revalidate", () => {
    const fetch_started_at = Date.now();
    const cached = { state: make_state(["a", "b", "c"]), time: Date.now() };
    let rows = cached.state.emails;
    const history: string[][] = [rows.map((row) => row.id)];
    const record = () => history.push(rows.map((row) => row.id));

    vi.advanceTimersByTime(500);
    const removal = begin_list_removal(rows, ["b"], {
      remove_emails: (ids) => {
        rows = rows.filter((row) => !ids.includes(row.id));
      },
      restore_emails: () => {},
    });

    record();

    rows = overlay_cached_state(cached).emails;
    record();

    vi.advanceTimersByTime(2_500);
    removal.settle([]);
    rows = merge_silent_refresh_emails(
      rows,
      make_rows(["a", "b", "c"]),
      fetch_started_at,
    );
    record();

    rows = overlay_cached_state(cached).emails;
    record();

    expect(
      history.every((ids, index) => index === 0 || !ids.includes("b")),
    ).toBe(true);
    expect(count_exits(history, "b")).toBe(1);
    expect(rows.map((row) => row.id)).toEqual(["a", "c"]);
  });
});
