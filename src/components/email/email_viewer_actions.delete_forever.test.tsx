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
import type { EmailViewerActionsDeps } from "@/components/email/email_viewer_actions";
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const placement = vi.hoisted(() => ({
  permanently_delete_message_ids: vi.fn(async () => true),
}));
const update_item_metadata = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, encrypted: null })),
);

vi.mock(
  "@/components/email/viewer_shared/trash_placement",
  async (import_original) => ({
    ...(await import_original<
      typeof import("@/components/email/viewer_shared/trash_placement")
    >()),
    ...placement,
  }),
);

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata,
  bulk_update_metadata_by_ids: async () => ({ success: true }),
}));

vi.mock("@/services/category_index", () => ({ reindex_ids: vi.fn() }));

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
  show_action_toast: vi.fn(),
}));

const { use_email_viewer_actions } =
  await import("@/components/email/email_viewer_actions");

type Actions = ReturnType<typeof use_email_viewer_actions>;

let latest!: Actions;
let root!: Root;
let item_is_trashed = true;
let thread: Partial<DecryptedThreadMessage>[] = [];

function thread_message(
  id: string,
  is_trashed: boolean,
): Partial<DecryptedThreadMessage> {
  return {
    id,
    is_trashed,
    item_type: "received",
    encrypted_metadata: "meta",
    metadata_nonce: "nonce",
  };
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
      is_trashed: item_is_trashed,
      metadata: { is_read: true, is_pinned: false, is_trashed: false },
    } as unknown as EmailViewerActionsDeps["mail_item"],
    is_read: true,
    is_pinned: false,
    is_archive_loading: false,
    is_spam_loading: false,
    is_trash_loading: false,
    is_pin_loading: false,
    is_external: false,
    thread_messages: thread as DecryptedThreadMessage[],
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

function render() {
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(createElement(Harness));
  });
}

describe("delete for messages in Trash", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    placement.permanently_delete_message_ids.mockClear();
    update_item_metadata.mockClear();
    item_is_trashed = true;
    thread = [
      thread_message("m1", true),
      thread_message("m2", true),
      thread_message("m3", false),
    ];
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("deletes the opened message and its trashed siblings forever", async () => {
    render();
    await act(async () => {
      await latest.handle_trash();
    });

    expect(placement.permanently_delete_message_ids).toHaveBeenCalledWith([
      "m1",
      "m2",
    ]);
    expect(update_item_metadata).not.toHaveBeenCalled();
  });

  it("still moves a message outside Trash to Trash", async () => {
    item_is_trashed = false;
    thread = [thread_message("m1", false)];
    render();
    await act(async () => {
      await latest.handle_trash();
    });

    expect(placement.permanently_delete_message_ids).not.toHaveBeenCalled();
    expect(update_item_metadata).toHaveBeenCalledWith("m1", expect.anything(), {
      is_trashed: true,
    });
  });

  it("decides each thread message from its own folder", async () => {
    item_is_trashed = false;
    render();
    await act(async () => {
      await latest.handle_per_message_trash(
        thread[1] as DecryptedThreadMessage,
      );
    });

    expect(placement.permanently_delete_message_ids).toHaveBeenCalledWith([
      "m2",
    ]);
    expect(update_item_metadata).not.toHaveBeenCalled();

    await act(async () => {
      await latest.handle_per_message_trash(
        thread[2] as DecryptedThreadMessage,
      );
    });

    expect(update_item_metadata).toHaveBeenCalledWith("m3", expect.anything(), {
      is_trashed: true,
    });
  });
});
