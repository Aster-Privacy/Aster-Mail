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
  hold_action_toast,
  release_action_toast,
  settle_undo_toast,
  subscribe_action_toast,
  type ActionToastState,
} from "./action_toast";

const KEY = "undo_send:q1";

let seen: (ActionToastState | null)[];
let unsubscribe: () => void;

function latest(): ActionToastState | null {
  return seen[seen.length - 1] ?? null;
}

function show_undo_send(): ActionToastState {
  show_action_toast({
    message: "sent",
    action_type: "archive",
    email_ids: [],
    duration_ms: 15000,
    hide_dismiss: true,
    resume_key: KEY,
    on_undo: async () => {},
  });

  const shown = latest();

  if (!shown) throw new Error("toast was not shown");

  return shown;
}

function show_other(message: string, duration_ms?: number) {
  show_action_toast({
    message,
    action_type: "archive",
    email_ids: [message],
    duration_ms,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  seen = [];
  unsubscribe = subscribe_action_toast((toast) => seen.push(toast));
});

afterEach(() => {
  release_action_toast(KEY);
  hide_action_toast();
  unsubscribe();
  vi.useRealTimers();
});

describe("resumable action toast", () => {
  it("stays up for its full duration", () => {
    const undo = show_undo_send();

    vi.advanceTimersByTime(14000);
    expect(latest()?.id).toBe(undo.id);

    vi.advanceTimersByTime(1000);
    expect(latest()).toBeNull();
  });

  it("comes back after a newer toast ends and keeps its deadline", () => {
    const undo = show_undo_send();

    vi.advanceTimersByTime(2000);
    show_other("archived", 5000);
    expect(latest()?.message).toBe("archived");

    vi.advanceTimersByTime(5000);
    expect(latest()?.id).toBe(undo.id);
    expect(latest()?.on_undo).toBeDefined();

    vi.advanceTimersByTime(7900);
    expect(latest()?.id).toBe(undo.id);

    vi.advanceTimersByTime(100);
    expect(latest()).toBeNull();
  });

  it("cuts a newer toast short when the resumable one is about to end", () => {
    show_undo_send();

    vi.advanceTimersByTime(13000);
    show_other("archived", 5000);

    vi.advanceTimersByTime(2000);
    expect(latest()).toBeNull();
  });

  it("comes back when a newer toast is hidden", () => {
    const undo = show_undo_send();

    show_other("working");
    hide_action_toast();

    expect(latest()?.id).toBe(undo.id);
  });

  it("is not removed by a hide meant for another toast", () => {
    const undo = show_undo_send();

    hide_action_toast();

    expect(latest()?.id).toBe(undo.id);
  });

  it("goes away when released and does not come back", () => {
    show_undo_send();
    release_action_toast(KEY);
    expect(latest()).toBeNull();

    show_other("archived", 5000);
    vi.advanceTimersByTime(5000);
    expect(latest()).toBeNull();
  });

  it("is not resumed after a newer toast once it is released", () => {
    show_undo_send();
    show_other("archived", 5000);
    release_action_toast(KEY);

    vi.advanceTimersByTime(5000);
    expect(latest()).toBeNull();
  });

  it("keeps the undo result visible when released during an undo", () => {
    const undo = show_undo_send();

    hold_action_toast();
    release_action_toast(KEY);
    expect(latest()?.id).toBe(undo.id);

    expect(settle_undo_toast(undo, "undone", 2000)).toBe(true);
    expect(latest()?.message).toBe("undone");
    expect(latest()?.actions).toBeUndefined();

    vi.advanceTimersByTime(2000);
    expect(latest()).toBeNull();
  });
});
