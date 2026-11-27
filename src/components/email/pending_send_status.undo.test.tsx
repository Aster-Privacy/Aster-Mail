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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const cancel_undo_send = vi.fn();
const undo_action_toast_by_key = vi.fn();
const show_toast = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/services/iconic_sounds", () => ({ play_iconic_sound: vi.fn() }));

vi.mock("@/hooks/use_undo_send", async (import_original) => {
  const actual =
    await import_original<typeof import("@/hooks/use_undo_send")>();

  return {
    ...actual,
    cancel_undo_send: (id: string) => cancel_undo_send(id),
  };
});

vi.mock("@/components/toast/action_toast", () => ({
  undo_action_toast_by_key: (key: string) => undo_action_toast_by_key(key),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

const { PendingSendStatus } = await import("./pending_send_status");
const { undo_send_manager } = await import("@/hooks/use_undo_send");
const {
  add_pending_reply_message,
  remove_pending_reply_message,
  reset_pending_reply_messages,
} = await import("@/hooks/pending_reply_messages");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const START = new Date("2026-11-26T18:00:00.000Z");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_status(message_id: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PendingSendStatus message_id={message_id} />);
  });

  return container;
}

function add_reply(optimistic_id: string) {
  add_pending_reply_message({
    optimistic_id,
    thread_token: "thread_1",
    original_email_id: "email_1",
    sender_name: "Me",
    sender_email: "me@astermail.org",
    subject: "Re: hi",
    body: "<p>reply</p>",
    to_recipients: [{ name: "You", email: "you@astermail.org" }],
  });
}

function queue_send(optimistic_id: string, is_in_flight = false) {
  undo_send_manager.add({
    id: "send_1",
    to: ["you@astermail.org"],
    subject: "Re: hi",
    body: "<p>reply</p>",
    scheduled_time: Date.now() + 5000,
    total_seconds: 5,
    is_server_queued: true,
    server_queue_id: "send_1",
    optimistic_id,
    is_in_flight,
  });
}

function undo_button() {
  return container?.querySelector<HTMLButtonElement>(
    "[data-testid='pending-send-undo']",
  );
}

describe("PendingSendStatus inline undo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    reset_pending_reply_messages();
    cancel_undo_send.mockReset();
    undo_action_toast_by_key.mockReset().mockResolvedValue(false);
    show_toast.mockReset();
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    undo_send_manager
      .get_all()
      .forEach((send) => undo_send_manager.remove(send.id));
    vi.useRealTimers();
  });

  it("offers Undo next to Sending during the undo window", async () => {
    add_reply("p_reply");
    queue_send("p_reply");

    await render_status("p_reply");

    expect(container?.textContent).toContain("common.sending");
    expect(undo_button()?.textContent).toBe("common.undo");
  });

  it("cancels the send once and removes the pending copy", async () => {
    add_reply("p_reply");
    queue_send("p_reply");
    cancel_undo_send.mockImplementation(async (id: string) => {
      undo_send_manager.remove(id);
      remove_pending_reply_message("p_reply");

      return "cancelled";
    });

    await render_status("p_reply");
    await act(async () => {
      undo_button()!.click();
      undo_button()?.click();
    });

    expect(undo_action_toast_by_key).toHaveBeenCalledWith("undo_send:send_1");
    expect(cancel_undo_send).toHaveBeenCalledTimes(1);
    expect(cancel_undo_send).toHaveBeenCalledWith("send_1");
    expect(container?.querySelector("[role='status']")).toBeNull();
    expect(show_toast).not.toHaveBeenCalled();
  });

  it("lets the undo toast handle the click when it is showing", async () => {
    add_reply("p_reply");
    queue_send("p_reply");
    undo_action_toast_by_key.mockResolvedValue(true);

    await render_status("p_reply");
    await act(async () => {
      undo_button()!.click();
    });

    expect(undo_action_toast_by_key).toHaveBeenCalledWith("undo_send:send_1");
    expect(cancel_undo_send).not.toHaveBeenCalled();
  });

  it("hides Undo once the undo window ends", async () => {
    add_reply("p_reply");
    queue_send("p_reply");

    await render_status("p_reply");
    expect(undo_button()).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    expect(undo_button()).toBeNull();
    expect(container?.textContent).toContain("common.sending");
  });

  it("never offers Undo once the send is in flight", async () => {
    add_reply("p_reply");
    queue_send("p_reply", true);

    await render_status("p_reply");

    expect(undo_button()).toBeNull();
  });

  it("tells you when the send already went out", async () => {
    add_reply("p_reply");
    queue_send("p_reply");
    cancel_undo_send.mockResolvedValue("too_late");

    await render_status("p_reply");
    await act(async () => {
      undo_button()!.click();
    });

    expect(show_toast).toHaveBeenCalledWith(
      "common.undo_send_already_sent",
      "error",
    );
  });
});
