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
//
import type { EmailViewerActionsDeps } from "@/components/email/email_viewer_actions";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  undo_success: true,
  on_undo: null as null | (() => Promise<void>),
}));

const reindex_ids = vi.hoisted(() => vi.fn());

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: vi.fn(
    async (_id: string, _meta: unknown, flags: { is_trashed?: boolean }) =>
      flags.is_trashed === false
        ? { success: state.undo_success, encrypted: null }
        : { success: true, encrypted: null },
  ),
  bulk_update_metadata_by_ids: async () => ({ success: true }),
}));

vi.mock("@/services/category_index", () => ({ reindex_ids }));

vi.mock("@/hooks/use_stat_helpers", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/use_stat_helpers")>()),
  apply_stat_deltas: vi.fn(),
  revert_stat_deltas: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: vi.fn(),
  adjust_stats_spam: vi.fn(),
  adjust_stats_trash: vi.fn(),
  adjust_stats_archived: vi.fn(),
  adjust_stats_inbox: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    state.on_undo = opts.on_undo ?? null;
  },
}));

const { use_email_viewer_actions } =
  await import("@/components/email/email_viewer_actions");
const { MAIL_EVENTS } = await import("@/hooks/mail_events");

type Actions = ReturnType<typeof use_email_viewer_actions>;

let latest!: Actions;
let root!: Root;
let trashed_events: boolean[];

function on_item_updated(event: Event) {
  const detail = (event as CustomEvent<{ id: string; is_trashed?: boolean }>)
    .detail;

  if (detail.id === "m1" && detail.is_trashed !== undefined) {
    trashed_events.push(detail.is_trashed);
  }
}

function Harness() {
  latest = use_email_viewer_actions({
    email_id: "m1",
    email: null,
    mail_item: {
      id: "m1",
      item_type: "received",
      encrypted_metadata: "meta",
      metadata_nonce: "nonce",
      metadata_version: 1,
      is_trashed: false,
      metadata: { is_read: true, is_pinned: false },
    } as unknown as EmailViewerActionsDeps["mail_item"],
    is_read: true,
    is_pinned: false,
    is_archive_loading: false,
    is_spam_loading: false,
    is_trash_loading: false,
    is_pin_loading: false,
    is_external: false,
    thread_messages: [],
    current_user_email: "me@astermail.org",
    thread_ghost_email: undefined,
    set_is_read: vi.fn(),
    set_is_pinned: vi.fn(),
    set_is_archive_loading: () => {},
    set_is_spam_loading: () => {},
    set_is_trash_loading: () => {},
    set_is_pin_loading: () => {},
    set_mail_item: vi.fn(),
    set_thread_messages: () => {},
    set_thread_draft: () => {},
    set_view_source_message: () => {},
    on_dismiss: vi.fn(),
    t: (key) => key,
    format_email_detail: () => "",
    preferences_default_reply_behavior: "reply",
  });

  return null;
}

describe("undo trash from the split reader", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    state.undo_success = true;
    state.on_undo = null;
    trashed_events = [];
    reindex_ids.mockClear();
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, on_item_updated);
    act(() => {
      root = createRoot(document.createElement("div"));
      root.render(createElement(Harness));
    });
  });

  afterEach(() => {
    window.removeEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, on_item_updated);
    act(() => root.unmount());
  });

  it("puts the message back in the list right away", async () => {
    await act(async () => {
      await latest.handle_trash();
    });
    expect(state.on_undo).not.toBeNull();

    await act(async () => {
      await state.on_undo!();
    });

    expect(reindex_ids).toHaveBeenCalledWith(["m1"]);
    expect(trashed_events).toContain(false);
  });

  it("reports a failed undo and leaves the message in Trash", async () => {
    state.undo_success = false;

    await act(async () => {
      await latest.handle_trash();
    });

    await expect(state.on_undo!()).rejects.toThrow();
    expect(reindex_ids).not.toHaveBeenCalled();
    expect(trashed_events).not.toContain(false);
  });
});
