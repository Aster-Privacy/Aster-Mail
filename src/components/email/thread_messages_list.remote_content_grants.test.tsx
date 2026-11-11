//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/email/thread_message_block", () => ({
  ThreadMessageBlock: ({
    message,
    loaded_content_types,
    external_content_mode,
    on_load_external_content,
  }: {
    message: DecryptedThreadMessage;
    loaded_content_types?: Set<string>;
    external_content_mode?: string;
    on_load_external_content?: (message_id: string, types: string[]) => void;
  }) =>
    createElement(
      "button",
      {
        "data-row": message.id,
        "data-loaded": [...(loaded_content_types ?? [])].sort().join(","),
        "data-mode": external_content_mode ?? "",
        onClick: () => on_load_external_content?.(message.id, ["image"]),
      },
      message.id,
    ),
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
const { use_remote_content_grants } =
  await import("@/hooks/use_remote_content_grants");

function message(index: number): DecryptedThreadMessage {
  return {
    id: `m${index}`,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.org",
    subject: "Weekly update",
    body: `Message number ${index}`,
    timestamp: new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString(),
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
  };
}

function Viewer({
  email_id,
  messages,
}: {
  email_id: string;
  messages: DecryptedThreadMessage[];
}) {
  const { remote_content_grants, grant_remote_content } =
    use_remote_content_grants(email_id);

  return createElement(ThreadMessagesList, {
    hide_counter: true,
    current_user_email: "me@astermail.org",
    default_expanded_id: messages[messages.length - 1].id,
    main_email_id: email_id,
    messages,
    on_load_external_content: grant_remote_content,
    remote_content_grants,
    subject: "Weekly update",
  });
}

let root: Root | null = null;
let container: HTMLDivElement;

function render_viewer(email_id: string, messages: DecryptedThreadMessage[]) {
  act(() => {
    root!.render(createElement(Viewer, { email_id, messages }));
  });
}

function row(id: string): HTMLElement {
  return container.querySelector(`[data-row="${id}"]`) as HTMLElement;
}

function loaded(id: string): string {
  return row(id).getAttribute("data-loaded") ?? "";
}

function load_images_for(id: string) {
  act(() => {
    row(id).click();
  });
}

describe("remote content choice in a thread", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
  });

  it("loads content only for the message the button belongs to", () => {
    render_viewer("m1", [message(1), message(2), message(3)]);

    load_images_for("m2");

    expect(loaded("m2")).toBe("image");
    expect(loaded("m1")).toBe("");
    expect(loaded("m3")).toBe("");
    expect(row("m1").getAttribute("data-mode")).toBe("");
    expect(row("m3").getAttribute("data-mode")).toBe("");
  });

  it("keeps a message that arrives later blocked", () => {
    render_viewer("m1", [message(1), message(2)]);

    load_images_for("m1");
    render_viewer("m1", [message(1), message(2), message(3)]);

    expect(loaded("m1")).toBe("image");
    expect(loaded("m2")).toBe("");
    expect(loaded("m3")).toBe("");
  });

  it("keeps separate choices for separate messages", () => {
    render_viewer("m1", [message(1), message(2)]);

    load_images_for("m1");
    load_images_for("m2");

    expect(loaded("m1")).toBe("image");
    expect(loaded("m2")).toBe("image");
  });

  it("forgets every choice when another conversation opens", () => {
    render_viewer("m1", [message(1), message(2)]);

    load_images_for("m1");
    render_viewer("m9", [message(1), message(2)]);

    expect(loaded("m1")).toBe("");
    expect(loaded("m2")).toBe("");
  });
});
