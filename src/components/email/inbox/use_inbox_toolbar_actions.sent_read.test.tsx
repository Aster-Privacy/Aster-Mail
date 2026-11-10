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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const metadata_mock = vi.hoisted(() => ({
  bulk_update_metadata_by_ids: vi.fn(),
  bulk_update_items_metadata: vi.fn(),
}));

const index_mock = vi.hoisted(() => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

const stats_mock = vi.hoisted(() => ({ adjust_unread: vi.fn() }));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/mail", () => ({
  empty_spam: vi.fn(),
  report_spam_sender: vi.fn(async () => ({})),
  remove_spam_sender: vi.fn(async () => ({})),
  trash_thread: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
  hide_action_toast: vi.fn(),
  update_progress_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/category_index", () => index_mock);

vi.mock("@/hooks/use_mail_stats", async (original) => ({
  ...(await original<typeof import("@/hooks/use_mail_stats")>()),
  adjust_stats_unread: stats_mock.adjust_unread,
}));

import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_inbox_toolbar_actions>;

let hook: HookResult;
const update_email = vi.fn();

function Probe({ emails }: { emails: InboxEmail[] }) {
  hook = use_inbox_toolbar_actions({
    t: (key: string) => key,
    current_view: "sent",
    email_state: { emails, total_messages: emails.length },
    get_selected_ids: (list: InboxEmail[]) =>
      list.filter((e) => e.is_selected).map((e) => e.id),
    update_email,
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    folders_lookup: new Map(),
    tags_lookup: new Map(),
    preferences: {
      confirm_before_delete: false,
      confirm_before_spam: false,
      confirm_before_archive: false,
      conversation_grouping: true,
    },
    update_preference: vi.fn(),
    save_now: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_inbox_toolbar_actions>[0]);

  return null;
}

function sent_emails(is_read: boolean): InboxEmail[] {
  return ["s1", "s2", "s3"].map((id) => ({
    id,
    item_type: "sent",
    is_selected: true,
    is_read,
  })) as unknown as InboxEmail[];
}

let container: HTMLDivElement;
let root: Root;

function render(emails: InboxEmail[]) {
  act(() => {
    root.render(createElement(Probe, { emails }));
  });
}

function sent_ids(): string[] {
  return metadata_mock.bulk_update_items_metadata.mock.calls[0][0].map(
    (item: { id: string }) => item.id,
  );
}

describe("use_inbox_toolbar_actions read state on sent mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metadata_mock.bulk_update_items_metadata.mockResolvedValue({
      failed_ids: [],
      encrypted_by_id: new Map(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("marks every selected sent message as unread", async () => {
    render(sent_emails(true));

    await act(async () => {
      await hook.handle_toolbar_mark_unread();
    });

    expect(sent_ids()).toEqual(["s1", "s2", "s3"]);
    expect(metadata_mock.bulk_update_items_metadata.mock.calls[0][1]).toEqual({
      is_read: false,
    });
    for (const id of ["s1", "s2", "s3"]) {
      expect(update_email).toHaveBeenCalledWith(id, { is_read: false });
    }
    expect(index_mock.set_ids_read).toHaveBeenCalledWith(
      ["s1", "s2", "s3"],
      false,
    );
    expect(stats_mock.adjust_unread).not.toHaveBeenCalled();
  });

  it("marks every selected sent message as read", async () => {
    render(sent_emails(false));

    await act(async () => {
      await hook.handle_toolbar_mark_read();
    });

    expect(sent_ids()).toEqual(["s1", "s2", "s3"]);
    expect(metadata_mock.bulk_update_items_metadata.mock.calls[0][1]).toEqual({
      is_read: true,
    });
    for (const id of ["s1", "s2", "s3"]) {
      expect(update_email).toHaveBeenCalledWith(id, { is_read: true });
    }
    expect(stats_mock.adjust_unread).not.toHaveBeenCalled();
  });

  it("restores sent messages the server rejects", async () => {
    metadata_mock.bulk_update_items_metadata.mockResolvedValueOnce({
      failed_ids: ["s2"],
      encrypted_by_id: new Map(),
    });
    render(sent_emails(true));

    await act(async () => {
      await hook.handle_toolbar_mark_unread();
    });

    expect(update_email).toHaveBeenLastCalledWith("s2", { is_read: true });
    expect(index_mock.set_ids_read).toHaveBeenCalledWith(["s1", "s3"], false);
  });
});
