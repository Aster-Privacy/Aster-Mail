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
import type { MailItemUpdatedEventDetail } from "@/hooks/mail_events";

import { describe, it, expect, beforeEach, vi } from "vitest";

const metadata_mock = vi.hoisted(() => ({
  bulk_update_metadata_by_ids: vi.fn(),
  update_item_metadata: vi.fn(),
}));

const index_mock = vi.hoisted(() => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn((_token: string) => [] as string[]),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
  thread_has_unread_entries: vi.fn(() => false),
}));

vi.mock("@/services/api/mail", () => ({
  trash_thread: vi.fn(),
  permanent_delete_mail_item: vi.fn(),
  batched_bulk_permanent_delete: vi.fn(),
  report_spam_sender: vi.fn(),
  remove_spam_sender: vi.fn(),
  mark_thread_read: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/crypto/mail_metadata_writer", () => ({
  update_item_metadata: metadata_mock.update_item_metadata,
}));

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

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { build_core_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_actions_core";
import { MAIL_EVENTS, on_mail_event } from "@/hooks/mail_events";

const read_message = {
  id: "m1",
  is_read: true,
  item_type: "received",
  thread_token: "thread-1",
  thread_message_count: 1,
} as unknown as InboxEmail;

function build() {
  const update_email = vi.fn();
  const actions = build_core_context_menu_actions({
    t: (key: string) => key,
    current_view: "inbox",
    get_emails: () => [read_message],
    update_email,
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping: true,
    },
    is_drafts_view: false,
    is_scheduled_view: false,
    schedule_delete_drafts: vi.fn(),
    cancel_scheduled: vi.fn(),
  } as unknown as UseContextMenuActionsParams);

  return { actions, update_email };
}

function capture_read_events(): MailItemUpdatedEventDetail[] {
  const seen: MailItemUpdatedEventDetail[] = [];

  on_mail_event(MAIL_EVENTS.MAIL_ITEM_UPDATED, (detail) => {
    if (detail.is_read !== undefined) seen.push(detail);
  });

  return seen;
}

describe("context menu read toggle keeps the open viewer in sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("announces the new read state before the server answers", async () => {
    let resolve_write: (value: { success: boolean }) => void = () => {};

    metadata_mock.update_item_metadata.mockReturnValue(
      new Promise((resolve) => {
        resolve_write = resolve;
      }),
    );
    const seen = capture_read_events();
    const { actions, update_email } = build();

    const pending = actions.handle_toggle_read(read_message);

    expect(update_email).toHaveBeenCalledWith("m1", { is_read: false });
    expect(seen).toEqual([{ id: "m1", is_read: false }]);

    resolve_write({ success: true });
    await pending;

    expect(seen.map((detail) => detail.is_read)).toEqual([false, false]);
  });

  it("announces the restored state when the server rejects the change", async () => {
    metadata_mock.update_item_metadata.mockResolvedValue({ success: false });
    const seen = capture_read_events();
    const { actions, update_email } = build();

    await actions.handle_toggle_read(read_message);

    expect(update_email).toHaveBeenLastCalledWith("m1", { is_read: true });
    expect(seen.map((detail) => detail.is_read)).toEqual([false, true]);
  });
});
