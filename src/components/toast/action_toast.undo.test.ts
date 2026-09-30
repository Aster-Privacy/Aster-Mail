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
  hide_action_toast,
  settle_undo_toast,
  subscribe_action_toast,
  type ActionToastState,
} from "./action_toast";

let seen: (ActionToastState | null)[];
let unsubscribe: () => void;

function latest(): ActionToastState | null {
  return seen[seen.length - 1] ?? null;
}

function show(message: string): ActionToastState {
  show_action_toast({
    message,
    action_type: "archive",
    email_ids: [message],
    on_undo: async () => {},
  });

  const shown = latest();

  if (!shown) throw new Error("toast was not shown");

  return shown;
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

describe("settle_undo_toast", () => {
  it("rewrites the toast it belongs to and dismisses it after the delay", () => {
    const first = show("first");

    expect(settle_undo_toast(first, "undone", 2000)).toBe(true);
    expect(latest()?.id).toBe(first.id);
    expect(latest()?.message).toBe("undone");
    expect(latest()?.on_undo).toBeUndefined();

    vi.advanceTimersByTime(2000);
    expect(latest()).toBeNull();
  });

  it("leaves a newer toast untouched when an older undo settles", () => {
    const first = show("first");
    const second = show("second");

    expect(settle_undo_toast(first, "undone", 2000)).toBe(false);
    expect(latest()?.id).toBe(second.id);
    expect(latest()?.message).toBe("second");
    expect(latest()?.on_undo).toBeTypeOf("function");

    vi.advanceTimersByTime(2000);
    expect(latest()?.id).toBe(second.id);

    vi.advanceTimersByTime(3000);
    expect(latest()).toBeNull();
  });
});
