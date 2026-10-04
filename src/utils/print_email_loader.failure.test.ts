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
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fail: true,
  print_email: vi.fn(),
  print_thread: vi.fn(),
  inner_teardown: vi.fn(),
  setup_thread_print_intercept: vi.fn(),
  show_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: state.show_toast,
}));

vi.mock("@/utils/lazy_with_retry", async (import_original) => {
  const actual =
    await import_original<typeof import("@/utils/lazy_with_retry")>();

  return {
    ...actual,
    import_on_demand: () =>
      state.fail
        ? Promise.reject(
            new actual.LazyLoadError(
              new TypeError("Failed to fetch dynamically imported module"),
            ),
          )
        : Promise.resolve({
            print_email: state.print_email,
            print_thread: state.print_thread,
            setup_thread_print_intercept: state.setup_thread_print_intercept,
          }),
  };
});

const loader = await import("./print_email_loader");

const t = (key: string) => key;
const email = {
  subject: "Quarterly report",
  sender: "Ada",
  sender_email: "ada@example.com",
  to: [{ email: "grace@example.com" }],
  timestamp: "Mon",
  body: "<p>Hello</p>",
};
const thread = {
  subject: "Thread",
  messages: [
    {
      sender: "Ada",
      sender_email: "ada@example.com",
      timestamp: "Mon",
      body: "<p>Hello</p>",
    },
  ],
};

function press_print_shortcut(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "p",
    ctrlKey: true,
    cancelable: true,
  });

  window.dispatchEvent(event);

  return event;
}

afterEach(() => {
  state.show_toast.mockClear();
  state.print_email.mockClear();
  state.print_thread.mockClear();
  state.setup_thread_print_intercept.mockClear();
  state.inner_teardown.mockClear();
});

describe("print_email_loader when the print module cannot load", () => {
  it("tells the user and leaves the page alone", async () => {
    loader.print_email(email, t);

    await vi.waitFor(() => expect(state.show_toast).toHaveBeenCalledTimes(1));
    expect(state.show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong_try_again",
      "error",
    );
    expect(state.print_email).not.toHaveBeenCalled();
  });

  it("installs the thread shortcut at once and reports a failed load", async () => {
    const stop = loader.setup_thread_print_intercept(() => thread, t);
    const event = press_print_shortcut();

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(state.show_toast).toHaveBeenCalledTimes(1));
    expect(state.print_thread).not.toHaveBeenCalled();

    stop();

    expect(press_print_shortcut().defaultPrevented).toBe(false);
  });

  it("leaves the shortcut alone when there is no thread to print", () => {
    const stop = loader.setup_thread_print_intercept(() => null, t);
    const event = press_print_shortcut();

    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it("prints the thread from the shortcut once a later load succeeds", async () => {
    state.fail = false;
    state.setup_thread_print_intercept.mockReturnValue(state.inner_teardown);

    const stop = loader.setup_thread_print_intercept(() => thread, t);

    press_print_shortcut();

    await vi.waitFor(() =>
      expect(state.print_thread).toHaveBeenCalledWith(thread, t),
    );
    expect(state.setup_thread_print_intercept).toHaveBeenCalledTimes(1);
    expect(state.show_toast).not.toHaveBeenCalled();
    expect(press_print_shortcut().defaultPrevented).toBe(false);

    stop();
    expect(state.inner_teardown).toHaveBeenCalledTimes(1);
  });

  it("prints on a later request without another error", () => {
    loader.print_email(email, t);

    expect(state.print_email).toHaveBeenCalledWith(email, t);
    expect(state.show_toast).not.toHaveBeenCalled();
  });
});
