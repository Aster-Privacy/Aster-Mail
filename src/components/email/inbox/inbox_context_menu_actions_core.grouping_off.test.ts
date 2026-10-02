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

import { describe, it, expect, beforeEach, vi } from "vitest";

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
  update_item_metadata: vi.fn(),
}));

const index_mock = vi.hoisted(() => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn((_token: string) => [] as string[]),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

const toast_mock = vi.hoisted(() => ({
  on_undo: null as null | (() => Promise<void>),
}));

vi.mock("@/services/api/mail", () => ({
  trash_thread: api_mock.trash_thread,
  permanent_delete_mail_item: vi.fn(),
  batched_bulk_permanent_delete: vi.fn(),
  report_spam_sender: vi.fn(),
  remove_spam_sender: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/archive", () => ({
  batch_archive: vi.fn(),
  batch_unarchive: vi.fn(),
}));

vi.mock("@/services/category_index", () => index_mock);

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: vi.fn(),
  adjust_stats_starred: vi.fn(),
  adjust_stats_trash: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/hooks/use_stat_helpers", () => ({
  compute_trash_deltas: vi.fn(() => ({})),
  compute_removal_deltas: vi.fn(() => ({})),
  compute_archive_deltas: vi.fn(() => ({})),
  apply_stat_deltas: vi.fn(),
  revert_stat_deltas: vi.fn(),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    toast_mock.on_undo = opts.on_undo ?? null;
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { build_core_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_actions_core";

const message = {
  id: "m1",
  is_read: true,
  item_type: "received",
  thread_token: "thread-1",
  thread_message_count: 3,
} as unknown as InboxEmail;

function build(conversation_grouping: boolean) {
  return build_core_context_menu_actions({
    t: (key: string) => key,
    current_view: "inbox",
    get_emails: () => [message],
    update_email: vi.fn(),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping,
    },
    is_drafts_view: false,
    is_scheduled_view: false,
    schedule_delete_drafts: vi.fn(),
    cancel_scheduled: vi.fn(),
  } as unknown as UseContextMenuActionsParams);
}

describe("context menu delete follows conversation grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast_mock.on_undo = null;
  });

  it("trashes and restores only the clicked message when grouping is off", async () => {
    await build(false).perform_delete(message);
    expect(toast_mock.on_undo).not.toBeNull();
    await toast_mock.on_undo!();

    expect(api_mock.trash_thread).not.toHaveBeenCalled();
    expect(index_mock.remove_thread_entries).not.toHaveBeenCalled();
    expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
      [["m1"], { is_trashed: true }],
      [["m1"], { is_trashed: false }],
    ]);
  });

  it("still trashes and restores the whole thread when grouping is on", async () => {
    await build(true).perform_delete(message);
    expect(toast_mock.on_undo).not.toBeNull();
    await toast_mock.on_undo!();

    expect(api_mock.trash_thread.mock.calls).toEqual([
      ["thread-1", true],
      ["thread-1", false],
    ]);
    expect(metadata_mock.bulk_update_metadata_by_ids).not.toHaveBeenCalled();
  });
});
