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

const api_mock = vi.hoisted(() => {
  const ok = async (ids: string[]) => ({
    success: true,
    affected_total: ids.length,
    failed_ids: [] as string[],
    was_cancelled: false,
  });

  return {
    trash_thread: vi.fn(async (_token: string, _trashed: boolean) => ({
      data: {},
    })),
    bulk_add_folder: vi.fn(
      async (
        _ids: string[],
        _token: string,
      ): Promise<{ data?: unknown; error?: string }> => ({ data: {} }),
    ),
    bulk_remove_folder: vi.fn(
      async (
        _ids: string[],
        _token: string,
      ): Promise<{ data?: unknown; error?: string }> => ({ data: {} }),
    ),
    batched_bulk_add_folder: vi.fn((ids: string[], _token: string) => ok(ids)),
    batched_bulk_remove_folder: vi.fn((ids: string[], _token: string) =>
      ok(ids),
    ),
    report_spam_sender: vi.fn(async (_sender: string) => ({})),
    remove_spam_sender: vi.fn(async (_sender: string) => ({})),
  };
});

const metadata_mock = vi.hoisted(() => ({
  bulk_update_metadata_by_ids: vi.fn(
    async (ids: string[], _flags: Record<string, boolean>) => ({
      success: true,
      updated_count: ids.length,
      failed_ids: [] as string[],
    }),
  ),
  update_item_metadata: vi.fn(),
  bulk_update_items_metadata: vi.fn(),
}));

const archive_mock = vi.hoisted(() => ({
  batch_archive: vi.fn(async () => ({ data: { success: true } })),
  batch_unarchive: vi.fn(async () => ({ data: { success: true } })),
}));

const events_mock = vi.hoisted(() => ({
  removed: [] as string[][],
  updated: [] as Record<string, unknown>[],
}));

const toast_mock = vi.hoisted(() => ({
  last: null as null | { message: string; on_undo?: () => Promise<void> },
  simple: [] as string[],
}));

vi.mock("@/services/api/mail", () => ({
  ...api_mock,
  empty_spam: vi.fn(),
  permanent_delete_mail_item: vi.fn(),
  batched_bulk_permanent_delete: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/archive", () => archive_mock);

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(() => [] as string[]),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

vi.mock("@/hooks/mail_events", async (original) => ({
  ...(await original<typeof import("@/hooks/mail_events")>()),
  emit_mail_items_removed: (detail: { ids: string[] }) => {
    events_mock.removed.push(detail.ids);
  },
  emit_mail_item_updated: (detail: Record<string, unknown>) => {
    events_mock.updated.push(detail);
  },
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
  show_action_toast: (opts: {
    message: string;
    on_undo?: () => Promise<void>;
  }) => {
    toast_mock.last = opts;
  },
  hide_action_toast: vi.fn(),
  update_progress_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string) => {
    toast_mock.simple.push(message);
  },
}));

import { move_out_of_bin } from "@/hooks/email_actions/move_out_of_bin";
import { leaves_view_on_folder_move } from "@/hooks/view_membership";
import { build_context_menu_actions } from "@/components/email/inbox/inbox_context_menu_builder";
import { use_folder_tag_actions } from "@/components/email/inbox/use_folder_tag_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const work_folder = { folder_token: "work", name: "Work", color: "#111111" };

function make_email(overrides: Partial<InboxEmail>): InboxEmail {
  return {
    id: "m1",
    is_read: true,
    is_trashed: false,
    is_spam: false,
    is_archived: false,
    is_selected: false,
    item_type: "received",
    sender_email: "sender@example.com",
    folders: [],
    ...overrides,
  } as unknown as InboxEmail;
}

const folders_lookup = new Map([
  ["work", { name: "Work", color: "#111111" }],
  ["receipts", { name: "Receipts", color: "#222222" }],
]);

function build_menu(current_view: string, emails: InboxEmail[]) {
  return build_context_menu_actions({
    t: (key: string) => key,
    current_view,
    get_emails: () => emails,
    update_email: vi.fn(),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    handle_open_compose: vi.fn(),
    folders_lookup,
    tags_lookup: new Map(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping: false,
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

function flag_calls() {
  return metadata_mock.bulk_update_metadata_by_ids.mock.calls.map((call) => [
    call[0],
    call[1],
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  events_mock.removed = [];
  events_mock.updated = [];
  toast_mock.last = null;
  toast_mock.simple = [];
});

describe("move_out_of_bin", () => {
  it("clears the trash flag and files the message into the chosen folder", async () => {
    const email = make_email({ is_trashed: true });
    const result = await move_out_of_bin({
      emails: [email],
      source: "trash",
      target_folder_token: "receipts",
      conversation_grouping: false,
    });

    expect(result.moved).toEqual([email]);
    expect(result.filing_failed).toBe(false);
    expect(flag_calls()).toEqual([[["m1"], { is_trashed: false }]]);
    expect(api_mock.batched_bulk_add_folder).toHaveBeenCalledWith(
      ["m1"],
      "receipts",
    );
  });

  it("moves a trashed message that was in a folder back to the inbox", async () => {
    const email = make_email({ is_trashed: true, folders: [work_folder] });

    await move_out_of_bin({
      emails: [email],
      source: "trash",
      target_folder_token: null,
      conversation_grouping: false,
    });

    expect(flag_calls()).toEqual([[["m1"], { is_trashed: false }]]);
    expect(api_mock.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ["m1"],
      "work",
    );
    expect(api_mock.batched_bulk_add_folder).not.toHaveBeenCalled();
  });

  it("unarchives a trashed archived message moved to the inbox", async () => {
    const email = make_email({ is_trashed: true, is_archived: true });

    await move_out_of_bin({
      emails: [email],
      source: "trash",
      target_folder_token: null,
      conversation_grouping: false,
    });

    expect(archive_mock.batch_unarchive).toHaveBeenCalledWith({
      ids: ["m1"],
    });
    expect(flag_calls()).toEqual([
      [["m1"], { is_trashed: false }],
      [["m1"], { is_archived: false }],
    ]);
  });

  it("restores the whole conversation when grouping trashed it as one", async () => {
    const email = make_email({
      is_trashed: true,
      thread_token: "thread-1",
      thread_message_count: 3,
      grouped_email_ids: ["m1", "m2", "m3"],
    } as Partial<InboxEmail>);

    await move_out_of_bin({
      emails: [email],
      source: "trash",
      target_folder_token: "receipts",
      conversation_grouping: true,
    });

    expect(api_mock.trash_thread).toHaveBeenCalledWith("thread-1", false);
    expect(metadata_mock.bulk_update_metadata_by_ids).not.toHaveBeenCalled();
    expect(api_mock.batched_bulk_add_folder).toHaveBeenCalledWith(
      ["m1", "m2", "m3"],
      "receipts",
    );
  });

  it("clears the spam flag and forgets the sender when moving out of spam", async () => {
    const email = make_email({ is_spam: true });

    await move_out_of_bin({
      emails: [email],
      source: "spam",
      target_folder_token: "work",
      conversation_grouping: false,
    });

    expect(flag_calls()).toEqual([[["m1"], { is_spam: false }]]);
    expect(api_mock.remove_spam_sender).toHaveBeenCalledWith(
      "sender@example.com",
    );
  });

  it("does not file anything when the trash flag cannot be cleared", async () => {
    metadata_mock.bulk_update_metadata_by_ids.mockResolvedValueOnce({
      success: false,
      updated_count: 0,
      failed_ids: ["m1"],
    });
    const result = await move_out_of_bin({
      emails: [make_email({ is_trashed: true })],
      source: "trash",
      target_folder_token: "receipts",
      conversation_grouping: false,
    });

    expect(result.moved).toEqual([]);
    expect(api_mock.batched_bulk_add_folder).not.toHaveBeenCalled();
  });

  it("undo puts the message back in the trash and in its old folder", async () => {
    const email = make_email({ is_trashed: true, folders: [work_folder] });
    const result = await move_out_of_bin({
      emails: [email],
      source: "trash",
      target_folder_token: "receipts",
      conversation_grouping: false,
    });

    vi.clearAllMocks();
    await result.undo();

    expect(api_mock.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ["m1"],
      "receipts",
    );
    expect(api_mock.batched_bulk_add_folder).toHaveBeenCalledWith(
      ["m1"],
      "work",
    );
    expect(flag_calls()).toEqual([[["m1"], { is_trashed: true }]]);
  });
});

describe("leaves_view_on_folder_move", () => {
  it("removes the row from the inbox, archive, and the source folder", () => {
    expect(leaves_view_on_folder_move("inbox", "work")).toBe(true);
    expect(leaves_view_on_folder_move("archive", "work")).toBe(true);
    expect(leaves_view_on_folder_move("folder-receipts", "work")).toBe(true);
  });

  it("keeps the row in the destination folder and unrelated views", () => {
    expect(leaves_view_on_folder_move("folder-work", "work")).toBe(false);
    expect(leaves_view_on_folder_move("sent", "work")).toBe(false);
    expect(leaves_view_on_folder_move("tag-abc", "work")).toBe(false);
  });
});

describe("context menu folder moves", () => {
  it("picking a folder in the trash moves the message out of the trash", async () => {
    const email = make_email({ is_trashed: true });
    const menu = build_menu("trash", [email]);

    await menu.handle_folder_toggle(email, "receipts");

    expect(flag_calls()).toEqual([[["m1"], { is_trashed: false }]]);
    expect(api_mock.batched_bulk_add_folder).toHaveBeenCalledWith(
      ["m1"],
      "receipts",
    );
    expect(events_mock.updated).toContainEqual({
      id: "m1",
      is_trashed: false,
      folders: [
        { folder_token: "receipts", name: "Receipts", color: "#222222" },
      ],
    });
    expect(toast_mock.last?.message).toBe("common.moved_to_folder");
  });

  it("picking the folder a trashed message came from still restores it", async () => {
    const email = make_email({ is_trashed: true, folders: [work_folder] });
    const menu = build_menu("trash", [email]);

    await menu.handle_folder_toggle(email, "work");

    expect(flag_calls()).toEqual([[["m1"], { is_trashed: false }]]);
    expect(api_mock.bulk_remove_folder).not.toHaveBeenCalled();
    expect(api_mock.batched_bulk_add_folder).toHaveBeenCalledWith(
      ["m1"],
      "work",
    );
  });

  it("move to inbox from the trash restores the message and clears its folder", async () => {
    const email = make_email({ is_trashed: true, folders: [work_folder] });
    const menu = build_menu("trash", [email]);

    await menu.handle_move_to_inbox(email);

    expect(flag_calls()).toEqual([[["m1"], { is_trashed: false }]]);
    expect(api_mock.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ["m1"],
      "work",
    );
    expect(archive_mock.batch_unarchive).not.toHaveBeenCalled();
    expect(toast_mock.last?.message).toBe("common.moved_to_inbox_toast");
  });

  it("undo after moving out of the trash sends the message back", async () => {
    const email = make_email({ is_trashed: true });
    const menu = build_menu("trash", [email]);

    await menu.handle_folder_toggle(email, "receipts");
    vi.clearAllMocks();
    await toast_mock.last!.on_undo!();

    expect(flag_calls()).toEqual([[["m1"], { is_trashed: true }]]);
    expect(api_mock.batched_bulk_remove_folder).toHaveBeenCalledWith(
      ["m1"],
      "receipts",
    );
  });

  it("moving between folders removes the row from the source folder at once", async () => {
    const email = make_email({ folders: [work_folder] });
    const menu = build_menu("folder-work", [email]);

    await menu.handle_folder_toggle(email, "receipts");

    expect(events_mock.removed).toEqual([["m1"]]);
    expect(api_mock.bulk_add_folder).toHaveBeenCalledWith(["m1"], "receipts");
    expect(events_mock.updated).toContainEqual({
      id: "m1",
      folders: [
        { folder_token: "receipts", name: "Receipts", color: "#222222" },
      ],
    });
  });

  it("undo after moving between folders puts the message back in its old folder", async () => {
    const email = make_email({ folders: [work_folder] });
    const menu = build_menu("folder-work", [email]);

    await menu.handle_folder_toggle(email, "receipts");
    vi.clearAllMocks();
    await toast_mock.last!.on_undo!();

    expect(api_mock.bulk_remove_folder).toHaveBeenCalledWith(
      ["m1"],
      "receipts",
    );
    expect(api_mock.bulk_add_folder).toHaveBeenCalledWith(["m1"], "work");
  });
});

type FolderHook = ReturnType<typeof use_folder_tag_actions>;

let folder_hook: FolderHook;
let container: HTMLDivElement | null = null;
let root: Root | null = null;
const remove_email = vi.fn();

function Probe({
  current_view,
  emails,
}: {
  current_view: string;
  emails: InboxEmail[];
}) {
  folder_hook = use_folder_tag_actions({
    t: (key: string) => key,
    current_view,
    email_state: { emails, total_messages: emails.length },
    update_email: vi.fn(),
    remove_email,
    conversation_grouping: false,
    folders_lookup,
    tags_lookup: new Map(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_folder_tag_actions>[0]);

  return null;
}

function render_probe(current_view: string, emails: InboxEmail[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Probe, { current_view, emails }));
  });
}

describe("toolbar folder moves for selected messages", () => {
  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("moves selected trashed messages into a folder and out of the trash", async () => {
    const emails = [
      make_email({ id: "a", is_trashed: true, is_selected: true }),
      make_email({ id: "b", is_trashed: true, is_selected: true }),
      make_email({ id: "c", is_trashed: true, is_selected: false }),
    ];

    render_probe("trash", emails);
    await act(async () => {
      await folder_hook.handle_toolbar_toggle_folder("receipts", true);
    });

    expect(flag_calls()).toEqual([[["a", "b"], { is_trashed: false }]]);
    expect(api_mock.batched_bulk_add_folder).toHaveBeenCalledWith(
      ["a", "b"],
      "receipts",
    );
    expect(remove_email.mock.calls).toEqual([["a"], ["b"]]);
    expect(toast_mock.last?.message).toBe(
      "common.conversations_moved_to_folder",
    );
  });

  it("move to inbox restores selected spam messages", async () => {
    const emails = [make_email({ id: "a", is_spam: true, is_selected: true })];

    render_probe("spam", emails);
    await act(async () => {
      await folder_hook.handle_toolbar_move_out_of_bin(null);
    });

    expect(flag_calls()).toEqual([[["a"], { is_spam: false }]]);
    expect(api_mock.remove_spam_sender).toHaveBeenCalledWith(
      "sender@example.com",
    );
    expect(toast_mock.last?.message).toBe("common.moved_to_inbox_toast");
  });

  it("moving selected messages between folders leaves only the new folder", async () => {
    const emails = [
      make_email({ id: "a", is_selected: true, folders: [work_folder] }),
    ];

    render_probe("folder-work", emails);
    await act(async () => {
      await folder_hook.handle_toolbar_toggle_folder("receipts", false);
    });

    expect(events_mock.removed).toEqual([["a"]]);
    expect(events_mock.updated).toContainEqual({
      id: "a",
      folders: [
        { folder_token: "receipts", name: "Receipts", color: "#222222" },
      ],
    });
  });
});
