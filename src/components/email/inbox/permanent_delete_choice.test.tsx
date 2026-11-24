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
  permanent_delete_mail_item: vi.fn(async (_id: string) => ({ data: {} })),
  batched_bulk_permanent_delete: vi.fn(async (_ids: string[]) => ({
    success: true,
    failed_ids: [] as string[],
  })),
}));

const toast_mock = vi.hoisted(() => ({
  messages: [] as string[],
}));

vi.mock("@/services/api/mail", () => ({
  trash_thread: vi.fn(),
  permanent_delete_mail_item: api_mock.permanent_delete_mail_item,
  batched_bulk_permanent_delete: api_mock.batched_bulk_permanent_delete,
  empty_trash: vi.fn(),
  bulk_add_folder: vi.fn(),
  bulk_remove_folder: vi.fn(),
  report_spam_sender: vi.fn(),
  remove_spam_sender: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  bulk_update_metadata_by_ids: vi.fn(),
  update_item_metadata: vi.fn(),
}));

vi.mock("@/services/api/archive", () => ({
  batched_archive: vi.fn(),
  batched_unarchive: vi.fn(),
  batch_archive: vi.fn(),
  batch_unarchive: vi.fn(),
}));

vi.mock("@/services/api/tags", () => ({
  bulk_add_tag: vi.fn(),
  bulk_remove_tag: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(() => [] as string[]),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: vi.fn(),
  adjust_stats_starred: vi.fn(),
  adjust_stats_trash: vi.fn(),
  clear_stats_trash: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { message: string }) => {
    toast_mock.messages.push(opts.message);
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string) => {
    toast_mock.messages.push(message);
  },
}));

import { use_delete_actions } from "@/components/email/inbox/use_delete_actions";
import { build_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_builder";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type DeleteActions = ReturnType<typeof use_delete_actions>;

interface ProbeProps {
  emails: InboxEmail[];
  confirm_before_delete: boolean;
  confirm_before_permanent_delete: boolean;
  dont_ask: boolean;
  pending_delete_email: InboxEmail | null;
}

let actions: DeleteActions;
const update_preference = vi.fn();
const set_confirmations = vi.fn();
const bulk_delete = vi.fn(async (ids: string[]) => ({
  success: true,
  failed_ids: [] as string[],
  requested_ids: ids,
}));

function Probe(props: ProbeProps) {
  actions = use_delete_actions({
    t: (key: string) => key,
    current_view: "trash",
    email_state: { emails: props.emails, total_messages: props.emails.length },
    get_selected_ids: (list: InboxEmail[]) =>
      list.filter((e) => e.is_selected).map((e) => e.id),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    bulk_delete,
    preferences: {
      confirm_before_delete: props.confirm_before_delete,
      confirm_before_permanent_delete: props.confirm_before_permanent_delete,
      conversation_grouping: true,
    },
    update_preference,
    save_now: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
    set_confirmations,
    dont_ask_delete: props.dont_ask,
    set_dont_ask_delete: vi.fn(),
    pending_delete_email: props.pending_delete_email,
    set_pending_delete_email: vi.fn(),
    set_show_single_delete_confirm: vi.fn(),
    dont_ask_single_delete: props.dont_ask,
    set_dont_ask_single_delete: vi.fn(),
    set_show_empty_trash_dialog: vi.fn(),
    set_is_emptying_trash: vi.fn(),
  } as unknown as Parameters<typeof use_delete_actions>[0]);

  return null;
}

const trashed_message = {
  id: "m1",
  is_selected: true,
  is_read: true,
  is_trashed: true,
  item_type: "received",
  timestamp: "2026-09-01T10:00:00Z",
} as unknown as InboxEmail;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(props: Partial<ProbeProps>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(Probe, {
        emails: [trashed_message],
        confirm_before_delete: false,
        confirm_before_permanent_delete: true,
        dont_ask: false,
        pending_delete_email: null,
        ...props,
      }),
    );
  });
}

function build_menu(preferences: {
  confirm_before_delete: boolean;
  confirm_before_permanent_delete: boolean;
}) {
  const set_show_single_delete_confirm = vi.fn();
  const menu = build_context_menu_actions({
    t: (key: string) => key,
    current_view: "trash",
    get_emails: () => [trashed_message],
    update_email: vi.fn(),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    handle_open_compose: vi.fn(),
    folders_lookup: new Map(),
    tags_lookup: new Map(),
    preferences: {
      ...preferences,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping: true,
    },
    set_pending_delete_email: vi.fn(),
    set_show_single_delete_confirm,
    set_pending_spam_email: vi.fn(),
    set_show_single_spam_confirm: vi.fn(),
    set_pending_archive_email: vi.fn(),
    set_show_single_archive_confirm: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
    schedule_delete_drafts: vi.fn(),
    cancel_scheduled: vi.fn(),
  } as unknown as UseContextMenuActionsParams);

  return { menu, set_show_single_delete_confirm };
}

describe("the permanent delete choice in trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast_mock.messages = [];
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("stores the single dialog choice under the permanent delete preference", async () => {
    render({ dont_ask: true, pending_delete_email: trashed_message });
    await act(async () => {
      await actions.confirm_single_delete();
    });

    expect(update_preference.mock.calls).toEqual([
      ["confirm_before_permanent_delete", false, true],
    ]);
    expect(api_mock.permanent_delete_mail_item).toHaveBeenCalledWith("m1");
  });

  it("stores the bulk dialog choice under the permanent delete preference", async () => {
    render({ dont_ask: true });
    await act(async () => {
      await actions.confirm_delete();
    });

    expect(update_preference.mock.calls).toEqual([
      ["confirm_before_permanent_delete", false, true],
    ]);
    expect(api_mock.batched_bulk_permanent_delete).toHaveBeenCalledWith(["m1"]);
  });

  it("still asks from the toolbar while the preference is on", async () => {
    render({});
    await act(async () => {
      await actions.handle_toolbar_delete();
    });

    expect(set_confirmations).toHaveBeenCalledTimes(1);
    expect(api_mock.batched_bulk_permanent_delete).not.toHaveBeenCalled();
  });

  it("deletes from the toolbar without asking once the choice is saved", async () => {
    render({ confirm_before_permanent_delete: false });
    await act(async () => {
      await actions.handle_toolbar_delete();
    });

    expect(set_confirmations).not.toHaveBeenCalled();
    expect(api_mock.batched_bulk_permanent_delete).toHaveBeenCalledWith(["m1"]);
    expect(bulk_delete).not.toHaveBeenCalled();
    expect(toast_mock.messages).toEqual(["common.emails_permanently_deleted"]);
  });

  it("skips the prompt for trashed mail even when the trash prompt is on", async () => {
    render({
      confirm_before_delete: true,
      confirm_before_permanent_delete: false,
    });
    await act(async () => {
      await actions.handle_toolbar_delete();
    });

    expect(set_confirmations).not.toHaveBeenCalled();
    expect(api_mock.batched_bulk_permanent_delete).toHaveBeenCalledWith(["m1"]);
  });

  it("still asks from the context menu while the preference is on", () => {
    const { menu, set_show_single_delete_confirm } = build_menu({
      confirm_before_delete: false,
      confirm_before_permanent_delete: true,
    });

    menu.handle_delete(trashed_message);

    expect(set_show_single_delete_confirm).toHaveBeenCalledWith(true);
    expect(api_mock.permanent_delete_mail_item).not.toHaveBeenCalled();
  });

  it("deletes from the context menu without asking once the choice is saved", async () => {
    const { menu, set_show_single_delete_confirm } = build_menu({
      confirm_before_delete: false,
      confirm_before_permanent_delete: false,
    });

    menu.handle_delete(trashed_message);
    await Promise.resolve();
    await Promise.resolve();

    expect(set_show_single_delete_confirm).not.toHaveBeenCalled();
    expect(api_mock.permanent_delete_mail_item).toHaveBeenCalledWith("m1");
  });

  it("does not let the trash prompt force a permanent delete prompt", () => {
    const { menu, set_show_single_delete_confirm } = build_menu({
      confirm_before_delete: true,
      confirm_before_permanent_delete: false,
    });

    menu.handle_delete(trashed_message);

    expect(set_show_single_delete_confirm).not.toHaveBeenCalled();
  });
});
