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
import type { InboxEmail } from "@/types/email";
import type { UseContextMenuActionsParams } from "@/components/email/inbox/inbox_context_menu_types";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const api_mock = vi.hoisted(() => ({
  trash_thread: vi.fn(async (_token: string, _trashed: boolean) => ({
    data: {},
  })),
}));

const metadata_mock = vi.hoisted(() => ({
  bulk_update_metadata_by_ids: vi.fn(
    async (ids: string[], _flags: Record<string, boolean>) => ({
      success: true,
      updated_count: ids.length,
      failed_ids: [] as string[],
    }),
  ),
  update_item_metadata: vi.fn(
    async (_id: string, _meta: unknown, _flags: Record<string, boolean>) => ({
      success: true,
      encrypted: { encrypted_metadata: "enc", metadata_nonce: "nonce" },
    }),
  ),
  bulk_update_items_metadata: vi.fn(),
}));

const toast_mock = vi.hoisted(() => ({
  on_undo: null as null | (() => Promise<void>),
}));

vi.mock("@/services/api/mail", () => ({
  trash_thread: api_mock.trash_thread,
  empty_spam: vi.fn(),
  bulk_add_folder: vi.fn(),
  bulk_remove_folder: vi.fn(),
  permanent_delete_mail_item: vi.fn(),
  batched_bulk_permanent_delete: vi.fn(),
  report_spam_sender: vi.fn(async () => ({})),
  remove_spam_sender: vi.fn(async () => ({})),
}));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/archive", () => ({
  batch_archive: vi.fn(),
  batch_unarchive: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(() => [] as string[]),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

vi.mock("@/hooks/use_stat_helpers", () => ({
  compute_trash_deltas: vi.fn(() => ({})),
  compute_untrash_deltas: vi.fn(() => ({})),
  compute_restore_deltas: vi.fn(() => ({})),
  compute_removal_deltas: vi.fn(() => ({})),
  compute_archive_deltas: vi.fn(() => ({})),
  apply_stat_deltas: vi.fn(),
  revert_stat_deltas: vi.fn(),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    toast_mock.on_undo = opts.on_undo ?? null;
  },
  hide_action_toast: vi.fn(),
  update_progress_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";
import { build_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_builder";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const message = {
  id: "m1",
  is_read: true,
  is_trashed: true,
  is_selected: true,
  item_type: "received",
  sender_email: "sender@example.com",
  thread_token: "thread-1",
  thread_message_count: 3,
} as unknown as InboxEmail;

type ToolbarHook = ReturnType<typeof use_inbox_toolbar_actions>;

let hook: ToolbarHook;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Probe({ conversation_grouping }: { conversation_grouping: boolean }) {
  hook = use_inbox_toolbar_actions({
    t: (key: string) => key,
    current_view: "trash",
    email_state: { emails: [message], total_messages: 1 },
    get_selected_ids: (list: InboxEmail[]) =>
      list.filter((e) => e.is_selected).map((e) => e.id),
    update_email: vi.fn(),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    folders_lookup: new Map(),
    tags_lookup: new Map(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping,
    },
    update_preference: vi.fn(),
    save_now: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_inbox_toolbar_actions>[0]);

  return null;
}

function render_toolbar(conversation_grouping: boolean): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Probe, { conversation_grouping }));
  });
}

function build_menu(conversation_grouping: boolean) {
  return build_context_menu_actions({
    t: (key: string) => key,
    current_view: "trash",
    get_emails: () => [message],
    update_email: vi.fn(),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    handle_open_compose: vi.fn(),
    folders_lookup: new Map(),
    tags_lookup: new Map(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping,
    },
    set_pending_delete_email: vi.fn(),
    set_show_single_delete_confirm: vi.fn(),
    set_pending_spam_email: vi.fn(),
    set_show_single_spam_confirm: vi.fn(),
    set_pending_archive_email: vi.fn(),
    set_show_single_archive_confirm: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
    schedule_delete_drafts: vi.fn(),
    cancel_scheduled: vi.fn(),
  } as unknown as UseContextMenuActionsParams);
}

describe("restoring from trash follows conversation grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast_mock.on_undo = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("toolbar restore and undo touch only the selected message when grouping is off", async () => {
    render_toolbar(false);

    await act(async () => {
      await hook.handle_toolbar_restore();
    });
    expect(toast_mock.on_undo).not.toBeNull();
    await toast_mock.on_undo!();

    expect(api_mock.trash_thread).not.toHaveBeenCalled();
    expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
      [["m1"], { is_trashed: false }],
      [["m1"], { is_trashed: true }],
    ]);
  });

  it("toolbar restore still restores the whole thread when grouping is on", async () => {
    render_toolbar(true);

    await act(async () => {
      await hook.handle_toolbar_restore();
    });
    await toast_mock.on_undo!();

    expect(api_mock.trash_thread.mock.calls).toEqual([
      ["thread-1", false],
      ["thread-1", true],
    ]);
    expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
      [["m1"], { is_trashed: false }],
      [["m1"], { is_trashed: true }],
    ]);
  });

  it("context menu restore and undo touch only the clicked message when grouping is off", async () => {
    await build_menu(false).handle_restore(message);
    expect(toast_mock.on_undo).not.toBeNull();
    await toast_mock.on_undo!();

    expect(api_mock.trash_thread).not.toHaveBeenCalled();
    expect(
      metadata_mock.update_item_metadata.mock.calls.map((call) => [
        call[0],
        call[2],
      ]),
    ).toEqual([
      ["m1", { is_trashed: false }],
      ["m1", { is_trashed: true }],
    ]);
  });

  it("context menu restore still restores the whole thread when grouping is on", async () => {
    await build_menu(true).handle_restore(message);
    await toast_mock.on_undo!();

    expect(api_mock.trash_thread.mock.calls).toEqual([
      ["thread-1", false],
      ["thread-1", true],
    ]);
    expect(metadata_mock.update_item_metadata).not.toHaveBeenCalled();
  });
});
