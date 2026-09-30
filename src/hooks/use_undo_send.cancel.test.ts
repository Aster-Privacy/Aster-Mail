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
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { use_undo_send, undo_send_manager, store_pending_send_payload } =
  await import("./use_undo_send");

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
