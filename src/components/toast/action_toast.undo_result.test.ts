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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hide_action_toast,
  release_action_toast,
  resolve_toast_icon,
  run_action_toast_undo,
  show_action_toast,
  subscribe_action_toast,
  undo_action_toast_by_key,
  type ActionToastState,
  type UndoToastResult,
} from "./action_toast";

const KEY = "undo_send:q-result";

let seen: (ActionToastState | null)[];
let unsubscribe: () => void;

function latest(): ActionToastState | null {
  return seen[seen.length - 1] ?? null;
}

function show_undo_send(
  on_undo: () => Promise<void | UndoToastResult>,
): ActionToastState {
  show_action_toast({
    message: "Email sent.",
    action_type: "archive",
    sound: "none",
    email_ids: [],
    duration_ms: 15000,
    hide_dismiss: true,
    resume_key: KEY,
    actions: [{ label: "Send now", on_press: () => {} }],
    on_undo,
  });

  const shown = latest();

  if (!shown) throw new Error("toast was not shown");

  return shown;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

const ALREADY_SENT: UndoToastResult = {
  message: "Undo failed. Already sent.",
  tone: "error",
};

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

describe("undo result on the action toast", () => {
  it("shows an already sent result as an error, not a success", async () => {
    const toast = show_undo_send(async () => ALREADY_SENT);

    await run_action_toast_undo(toast.id);

    const settled = latest();

    expect(settled?.id).toBe(toast.id);
    expect(settled?.message).toBe("Undo failed. Already sent.");
    expect(settled?.result_tone).toBe("error");
    expect(settled?.on_undo).toBeUndefined();
    expect(settled?.actions).toBeUndefined();
    expect(resolve_toast_icon(settled as ActionToastState)).toBe("error");
  });

  it("keeps the success check for a plain archive toast", () => {
    show_action_toast({
      message: "Archived",
      action_type: "archive",
      sound: "none",
      email_ids: ["1"],
    });

    expect(resolve_toast_icon(latest() as ActionToastState)).toBe("check");
  });

  it("shows a thrown undo as an error", async () => {
    const toast = show_undo_send(async () => {
      throw new Error("boom");
    });

    await run_action_toast_undo(toast.id);

    expect(latest()?.result_tone).toBe("error");
    expect(resolve_toast_icon(latest() as ActionToastState)).toBe("error");
  });

  it("runs the undo once while a request is in flight", async () => {
    const gate = deferred<UndoToastResult>();
    const on_undo = vi.fn(() => gate.promise);
    const toast = show_undo_send(on_undo);

    const first = run_action_toast_undo(toast.id);
    const second = run_action_toast_undo(toast.id);
    const third = undo_action_toast_by_key(KEY);

    expect(latest()?.is_undoing).toBe(true);
    gate.resolve(ALREADY_SENT);
    await Promise.all([first, second, third]);

    expect(on_undo).toHaveBeenCalledTimes(1);
  });

  it("updates the same toast in place instead of adding one", async () => {
    const toast = show_undo_send(async () => ALREADY_SENT);

    await run_action_toast_undo(toast.id);

    const ids = new Set(
      seen.filter((entry) => entry !== null).map((entry) => entry?.id),
    );

    expect(ids).toEqual(new Set([toast.id]));
  });

  it("keeps the result visible when the send settles right after", async () => {
    const toast = show_undo_send(async () => ALREADY_SENT);

    await run_action_toast_undo(toast.id);
    release_action_toast(KEY);

    expect(latest()?.id).toBe(toast.id);
    vi.advanceTimersByTime(5000);
    expect(latest()).toBeNull();
  });

  it("keeps undo available when the result asks for it", async () => {
    const toast = show_undo_send(async () => ({
      message: "Undo failed. Try again.",
      tone: "error",
      keep_undo: true,
    }));

    await run_action_toast_undo(toast.id);

    expect(latest()?.message).toBe("Undo failed. Try again.");
    expect(latest()?.on_undo).toBeDefined();
    expect(latest()?.is_undoing).toBeFalsy();
  });

  it("undoes the waiting toast by key from the keyboard", async () => {
    const on_undo = vi.fn(async () => {});
    const toast = show_undo_send(on_undo);

    await expect(undo_action_toast_by_key(KEY)).resolves.toBe(true);
    expect(on_undo).toHaveBeenCalledTimes(1);
    expect(latest()?.id).toBe(toast.id);
    expect(latest()?.result_tone).toBe("success");
  });

  it("brings a waiting undo toast back to run it from the keyboard", async () => {
    const on_undo = vi.fn(async () => ALREADY_SENT);
    const toast = show_undo_send(on_undo);

    show_action_toast({
      message: "Archived",
      action_type: "archive",
      sound: "none",
      email_ids: ["1"],
    });
    await undo_action_toast_by_key(KEY);

    expect(on_undo).toHaveBeenCalledTimes(1);
    expect(latest()?.id).toBe(toast.id);
    expect(latest()?.message).toBe("Undo failed. Already sent.");
  });

  it("reports no toast for an unknown key", async () => {
    await expect(undo_action_toast_by_key("undo_send:none")).resolves.toBe(
      false,
    );
  });
});
