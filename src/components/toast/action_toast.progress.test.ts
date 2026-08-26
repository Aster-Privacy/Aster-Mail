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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
  subscribe_action_toast,
  type ActionToastState,
} from "./action_toast";

const STALL_MS = 90000;

let seen: (ActionToastState | null)[];
let unsubscribe: () => void;

function show_progress(total: number) {
  show_action_toast({
    message: "",
    action_type: "progress",
    email_ids: [],
    progress: { completed: 0, total },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  seen = [];
  unsubscribe = subscribe_action_toast((toast) => seen.push(toast));
});

afterEach(() => {
  unsubscribe();
  hide_action_toast();
  vi.useRealTimers();
});

describe("progress toast stall watchdog", () => {
  it("dismisses a progress toast that never finishes", () => {
    show_progress(40);

    expect(seen.at(-1)?.progress).toEqual({ completed: 0, total: 40 });

    vi.advanceTimersByTime(STALL_MS);

    expect(seen.at(-1)).toBeNull();
  });

  it("keeps the toast alive while progress keeps arriving", () => {
    show_progress(40);

    for (let completed = 1; completed <= 4; completed++) {
      vi.advanceTimersByTime(STALL_MS - 1000);
      update_progress_toast(completed, 40);
    }

    expect(seen.at(-1)?.progress).toEqual({ completed: 4, total: 40 });
  });

  it("stops the watchdog once the toast is hidden", () => {
    show_progress(40);
    hide_action_toast();

    const after_hide = seen.length;

    vi.advanceTimersByTime(STALL_MS * 2);

    expect(seen.length).toBe(after_hide);
  });

  it("does not arm the watchdog for a plain toast", () => {
    show_action_toast({
      message: "done",
      action_type: "archive",
      email_ids: [],
    });

    vi.advanceTimersByTime(5000);

    expect(seen.at(-1)).toBeNull();
    expect(seen.length).toBe(2);
  });
});
