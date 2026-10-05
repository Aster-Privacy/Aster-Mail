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
import { createElement, act, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";

const ROW_HEIGHT = 50;
const LIST_TOP = 40;

const h = vi.hoisted(() => ({ order: "asc" as "asc" | "desc" }));

vi.mock("@/components/email/thread_message_block", () => ({
  ThreadMessageBlock: ({
    message,
    island_ref,
  }: {
    message: DecryptedThreadMessage;
    island_ref?: Ref<HTMLDivElement>;
  }) => createElement("div", { ref: island_ref, "data-row": message.id }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      conversation_order: h.order,
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
    is_external: false,
  };
}

let root: Root | null = null;
let scroller: HTMLDivElement;
let original_rect: typeof HTMLElement.prototype.getBoundingClientRect;

function rect(top: number): DOMRect {
  return {
    top,
    bottom: top + ROW_HEIGHT,
    left: 0,
    right: 0,
    width: 0,
    height: ROW_HEIGHT,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function render_list(
  messages: DecryptedThreadMessage[],
  opened: string,
  pending_earlier_count = 0,
) {
  act(() => {
    root!.render(
      createElement(ThreadMessagesList, {
        hide_counter: true,
        current_user_email: "me@astermail.org",
        default_expanded_id: opened,
        main_email_id: opened,
        messages,
        pending_earlier_count,
        subject: "Weekly update",
      }),
    );
  });
}

const ROW_SELECTOR = '[data-row], [aria-hidden="true"], button[aria-expanded]';

function stacked_rows(): Element[] {
  return Array.from(scroller.querySelectorAll(ROW_SELECTOR)).filter(
    (el) => !el.parentElement?.closest(ROW_SELECTOR),
  );
}

function top_of(id: string): number {
  return scroller.querySelector(`[data-row="${id}"]`)!.getBoundingClientRect()
    .top;
}

async function flush_frames(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 10)),
      );
    });
  }
}

function make_unscrollable(): void {
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    value: 500,
  });
}

describe("thread list when the rest of the thread arrives", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    h.order = "asc";
    scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 5_000,
    });
    Object.defineProperty(scroller, "clientHeight", { value: 500 });
    document.body.appendChild(scroller);
    original_rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this === scroller) return rect(0);
      const rows = stacked_rows();
      const index = rows.indexOf(this);
      const list_top = LIST_TOP - scroller.scrollTop;

      return rect(index === -1 ? list_top : list_top + index * ROW_HEIGHT);
    };
    root = createRoot(scroller);
  });

  afterEach(() => {
    const mounted = root;

    root = null;
    if (mounted) act(() => mounted.unmount());
    HTMLElement.prototype.getBoundingClientRect = original_rect;
    scroller.remove();
  });

  it("keeps the opened message where it was when earlier messages appear above it", async () => {
    const thread = Array.from({ length: 10 }, (_, i) => message(i));
    const opened = thread[9];

    render_list([opened], opened.id);
    await flush_frames();
    const before = top_of(opened.id);

    render_list(thread, opened.id);
    await flush_frames();

    expect(scroller.querySelectorAll("[data-row]").length).toBeGreaterThan(1);
    expect(top_of(opened.id)).toBe(before);
  });

  it("keeps the opened message in place in a short thread", async () => {
    const thread = Array.from({ length: 3 }, (_, i) => message(i));
    const opened = thread[2];

    render_list([opened], opened.id);
    await flush_frames();
    const before = top_of(opened.id);

    render_list(thread, opened.id);
    await flush_frames();

    expect(scroller.querySelectorAll("[data-row]")).toHaveLength(3);
    expect(top_of(opened.id)).toBe(before);
  });

  it("does not scroll when the new messages land below the opened one", async () => {
    h.order = "desc";
    const thread = Array.from({ length: 3 }, (_, i) => message(i));
    const opened = thread[2];

    render_list([opened], opened.id);
    await flush_frames();
    const before = top_of(opened.id);
    const scroll_before = scroller.scrollTop;

    render_list(thread, opened.id);
    await flush_frames();

    expect(scroller.querySelector("[data-row]")?.getAttribute("data-row")).toBe(
      opened.id,
    );
    expect(scroller.scrollTop).toBe(scroll_before);
    expect(top_of(opened.id)).toBe(before);
  });

  it("holds space for the earlier messages while the thread loads", async () => {
    make_unscrollable();
    const thread = Array.from({ length: 10 }, (_, i) => message(i));
    const opened = thread[9];

    render_list([opened], opened.id, 9);
    await flush_frames();
    const before = top_of(opened.id);

    render_list(thread, opened.id);
    await flush_frames();

    expect(scroller.scrollTop).toBe(0);
    expect(scroller.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(
      0,
    );
    expect(top_of(opened.id)).toBe(before);
  });

  it("holds one row per earlier message in a short thread", async () => {
    make_unscrollable();
    const thread = Array.from({ length: 3 }, (_, i) => message(i));
    const opened = thread[2];

    render_list([opened], opened.id, 2);
    await flush_frames();
    const before = top_of(opened.id);

    render_list(thread, opened.id);
    await flush_frames();

    expect(scroller.scrollTop).toBe(0);
    expect(top_of(opened.id)).toBe(before);
  });
});
