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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/email/thread_message_block", () => ({
  ThreadMessageBlock: ({
    message,
    is_read,
  }: {
    message: DecryptedThreadMessage;
    is_read?: boolean;
  }) =>
    createElement("div", {
      "data-row": message.id,
      "data-read": String(!!is_read),
    }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      conversation_order: "asc",
      conversation_grouping: true,
      mark_as_read_delay: "never",
    },
  }),
}));

vi.mock("@/components/email/use_email_dark_mode", () => ({
  use_email_dark_mode: () => ({
    is_dark_mode_message: () => false,
    is_dark_mode_opted_out: () => false,
    toggle_dark_mode: () => {},
    set_all_dark_mode: () => {},
  }),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/hooks/use_folders", () => ({ get_cached_folders: () => [] }));

vi.mock("@/services/api/mail", () => ({
  bulk_add_folder: async () => ({}),
  bulk_remove_folder: async () => ({}),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_starred: vi.fn(),
  adjust_stats_unread: vi.fn(),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

const { ThreadMessagesList } =
  await import("@/components/email/thread_messages_list");
const { emit_mail_item_updated } = await import("@/hooks/mail_events");
const { note_read_intent, clear_all_read_intents } =
  await import("@/services/read_intent");

function message(index: number, is_read: boolean): DecryptedThreadMessage {
  return {
    id: `m${index}`,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.org",
    subject: "Weekly update",
    body: `Message number ${index}`,
    timestamp: new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString(),
    is_read,
    is_starred: false,
    is_deleted: false,
    is_external: false,
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

function render_list(messages: DecryptedThreadMessage[], opened: string) {
  act(() => {
    root!.render(
      createElement(ThreadMessagesList, {
        hide_counter: true,
        current_user_email: "me@astermail.org",
        default_expanded_id: opened,
        main_email_id: opened,
        messages,
        subject: "Weekly update",
      }),
    );
  });
}

function read_flag(id: string): string | null {
  return (
    host.querySelector(`[data-row="${id}"]`)?.getAttribute("data-read") ?? null
  );
}

describe("thread list read state for the opened message", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    clear_all_read_intents();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    const mounted = root;

    root = null;
    if (mounted) act(() => mounted.unmount());
    host.remove();
    clear_all_read_intents();
  });

  it("shows the opened message as read once the viewer marks it read", () => {
    const thread = [message(0, true), message(1, false)];

    render_list(thread, "m1");
    expect(read_flag("m1")).toBe("false");

    act(() => emit_mail_item_updated({ id: "m1", is_read: true }));
    expect(read_flag("m1")).toBe("true");
  });

  it("keeps it read when the thread re-renders with the fetched copy", () => {
    const thread = [message(0, true), message(1, false)];

    render_list(thread, "m1");
    act(() => emit_mail_item_updated({ id: "m1", is_read: true }));

    render_list([...thread], "m1");
    expect(read_flag("m1")).toBe("true");
  });

  it("starts read when the message was marked read before the thread opened", () => {
    note_read_intent(["m1"], true);

    render_list([message(0, true), message(1, false)], "m1");
    expect(read_flag("m1")).toBe("true");
  });

  it("follows a later mark as unread", () => {
    render_list([message(0, true), message(1, true)], "m1");

    act(() => emit_mail_item_updated({ id: "m1", is_read: false }));
    expect(read_flag("m1")).toBe("false");
  });
});
