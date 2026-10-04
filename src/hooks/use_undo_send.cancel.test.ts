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

const cancel_send = vi.fn();
const show_toast = vi.fn();

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/services/send_queue", () => ({
  cancel_send: (...args: unknown[]) => cancel_send(...args),
  send_now: vi.fn(),
  cancel_server_queued_email_with_reason: vi.fn(),
  send_server_queued_immediately: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

const { act } = await import("react");
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const {
  use_undo_send,
  undo_send_manager,
  store_pending_send_payload,
  has_tab_timer_sends,
  take_interrupted_tab_sends,
  clear_undo_send_state,
} = await import("./use_undo_send");

type UndoHook = ReturnType<typeof use_undo_send>;

const mounted_roots: Array<{ unmount: () => void }> = [];

async function mount_hook(): Promise<{ current: UndoHook }> {
  const holder = { current: null as unknown as UndoHook };
  const Harness = () => {
    holder.current = use_undo_send();

    return null;
  };
  const root = createRoot(document.createElement("div"));

  mounted_roots.push(root);
  await act(async () => {
    root.render(createElement(Harness));
  });

  return holder;
}

describe("undoing a locally queued send", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await act(async () => {
      mounted_roots.splice(0).forEach((root) => root.unmount());
    });
    undo_send_manager.get_all().forEach((p) => undo_send_manager.remove(p.id));
  });

  it("refuses when the queue has already handed the message off", async () => {
    undo_send_manager.add({
      id: "local-1",
      to: ["a@example.com"],
      subject: "s",
      body: "b",
      scheduled_time: Date.now() + 5_000,
      total_seconds: 5,
    });
    store_pending_send_payload("local-1", {
      to: ["a@example.com"],
      subject: "s",
      body: "b",
    });
    cancel_send.mockReturnValue(null);
    const listener = vi.fn();

    window.addEventListener("astermail:undo-send", listener);
    const result = await mount_hook();
    let outcome = true;

    await act(async () => {
      outcome = await result.current.cancel_send("local-1");
    });
    window.removeEventListener("astermail:undo-send", listener);

    expect(outcome).toBe(false);
    expect(show_toast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(listener).not.toHaveBeenCalled();
    expect(undo_send_manager.get("local-1")).toBeDefined();
  });

  it("reopens the compose when the queue still held the message", async () => {
    undo_send_manager.add({
      id: "local-2",
      to: ["a@example.com"],
      subject: "s",
      body: "b",
      scheduled_time: Date.now() + 5_000,
      total_seconds: 5,
    });
    cancel_send.mockReturnValue({ id: "local-2" });
    const listener = vi.fn();

    window.addEventListener("astermail:undo-send", listener);
    const result = await mount_hook();
    let outcome = false;

    await act(async () => {
      outcome = await result.current.cancel_send("local-2");
    });
    window.removeEventListener("astermail:undo-send", listener);

    expect(outcome).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(undo_send_manager.get("local-2")).toBeUndefined();
  });
});

function add_tab_timer_send(
  id: string,
  on_timer: () => void,
  on_send_immediately?: () => void,
  delay_ms = 5_000,
) {
  undo_send_manager.add({
    id,
    to: ["a@example.com"],
    subject: "s",
    body: "b",
    scheduled_time: Date.now() + delay_ms,
    total_seconds: delay_ms / 1000,
    timeout_id: window.setTimeout(on_timer, delay_ms),
    is_external: true,
    on_send_immediately,
  });
}

describe("sends that wait on a timer in this tab", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await act(async () => {
      mounted_roots.splice(0).forEach((root) => root.unmount());
    });
    undo_send_manager.get_all().forEach((p) => undo_send_manager.remove(p.id));
    vi.useFakeTimers();
  });

  afterEach(() => {
    undo_send_manager.get_all().forEach((p) => undo_send_manager.remove(p.id));
    vi.useRealTimers();
  });

  it("undo stops the timer so the message is never sent", async () => {
    const on_timer = vi.fn();

    add_tab_timer_send("tab-1", on_timer);
    const listener = vi.fn();

    window.addEventListener("astermail:undo-send", listener);
    const result = await mount_hook();
    let outcome = false;

    await act(async () => {
      outcome = await result.current.cancel_send("tab-1");
    });
    window.removeEventListener("astermail:undo-send", listener);
    vi.advanceTimersByTime(10_000);

    expect(outcome).toBe(true);
    expect(on_timer).not.toHaveBeenCalled();
    expect(cancel_send).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(undo_send_manager.get("tab-1")).toBeUndefined();
  });

  it("keeps the undo window when the page is hidden or cached", () => {
    const on_timer = vi.fn();
    const on_send_immediately = vi.fn();

    add_tab_timer_send("tab-2", on_timer, on_send_immediately);

    const cached = new Event("pagehide") as Event & { persisted?: boolean };

    Object.defineProperty(cached, "persisted", { value: true });
    window.dispatchEvent(cached);
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(on_send_immediately).not.toHaveBeenCalled();
    expect(on_timer).not.toHaveBeenCalled();
    expect(has_tab_timer_sends()).toBe(true);

    vi.advanceTimersByTime(5_000);
    expect(on_timer).toHaveBeenCalledTimes(1);
  });

  it("refuses undo and send now once the timer has started sending", async () => {
    const on_send_immediately = vi.fn();

    add_tab_timer_send("tab-3", vi.fn(), on_send_immediately);

    expect(undo_send_manager.begin_tab_timer_send("tab-3")).toBe(true);
    expect(undo_send_manager.begin_tab_timer_send("tab-3")).toBe(false);

    const listener = vi.fn();

    window.addEventListener("astermail:undo-send", listener);
    const result = await mount_hook();
    let outcome = true;

    await act(async () => {
      outcome = await result.current.cancel_send("tab-3");
      result.current.send_immediately("tab-3");
    });
    window.removeEventListener("astermail:undo-send", listener);

    expect(outcome).toBe(false);
    expect(show_toast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(listener).not.toHaveBeenCalled();
    expect(on_send_immediately).not.toHaveBeenCalled();
    expect(undo_send_manager.get("tab-3")?.is_in_flight).toBe(true);
    expect(has_tab_timer_sends()).toBe(true);
  });

  it("does not start a send that was undone or already sent", () => {
    add_tab_timer_send("tab-5", vi.fn(), vi.fn());
    undo_send_manager.remove("tab-5");

    expect(undo_send_manager.begin_tab_timer_send("tab-5")).toBe(false);
  });

  it("reports a send that this tab lost on reload exactly once", () => {
    add_tab_timer_send("tab-6", vi.fn(), vi.fn());

    expect(take_interrupted_tab_sends()).toBe(0);

    const stored = localStorage.getItem("astermail:waiting_tab_sends") ?? "";

    expect(stored).not.toContain("a@example.com");
    undo_send_manager.remove("tab-6");
    localStorage.setItem("astermail:waiting_tab_sends", stored);

    expect(take_interrupted_tab_sends()).toBe(1);
    expect(take_interrupted_tab_sends()).toBe(0);
  });

  it("does not report a send that finished, was undone, or is going out", () => {
    add_tab_timer_send("tab-7", vi.fn(), vi.fn());
    undo_send_manager.remove("tab-7");
    add_tab_timer_send("tab-8", vi.fn(), vi.fn());
    undo_send_manager.begin_tab_timer_send("tab-8");

    expect(localStorage.getItem("astermail:waiting_tab_sends")).toBeNull();
    expect(take_interrupted_tab_sends()).toBe(0);
  });

  it("waits before reporting a send that another tab may still hold", () => {
    localStorage.setItem(
      "astermail:waiting_tab_sends",
      JSON.stringify([
        { id: "other-1", tab: "other", due: Date.now() + 5_000 },
      ]),
    );

    expect(take_interrupted_tab_sends()).toBe(0);
    vi.advanceTimersByTime(70_000);
    expect(take_interrupted_tab_sends()).toBe(1);
    expect(localStorage.getItem("astermail:waiting_tab_sends")).toBeNull();
  });

  it("forgets waiting sends on sign-out", () => {
    const on_timer = vi.fn();

    add_tab_timer_send("tab-9", on_timer, vi.fn());
    clear_undo_send_state();
    vi.advanceTimersByTime(10_000);

    expect(on_timer).not.toHaveBeenCalled();
    expect(localStorage.getItem("astermail:waiting_tab_sends")).toBeNull();
  });

  it("asks before the tab closes while a send is waiting", () => {
    add_tab_timer_send("tab-4", vi.fn(), vi.fn());
    const waiting = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(waiting);
    expect(waiting.defaultPrevented).toBe(true);

    undo_send_manager.remove("tab-4");
    const idle = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
  });

  it("leaves server queued sends alone when the page is hidden", () => {
    const on_send_immediately = vi.fn();

    undo_send_manager.add({
      id: "server-1",
      to: ["a@example.com"],
      subject: "s",
      body: "b",
      scheduled_time: Date.now() + 5_000,
      total_seconds: 5,
      is_server_queued: true,
      on_send_immediately,
    });

    window.dispatchEvent(new Event("pagehide"));
    expect(has_tab_timer_sends()).toBe(false);
    expect(localStorage.getItem("astermail:waiting_tab_sends")).toBeNull();
    expect(on_send_immediately).not.toHaveBeenCalled();
    expect(undo_send_manager.get("server-1")).toBeDefined();
  });
});
