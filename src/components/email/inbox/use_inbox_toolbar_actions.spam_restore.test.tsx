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
  bulk_update_metadata_by_ids: vi.fn(
    async (
      ids: string[],
    ): Promise<{
      success: boolean;
      updated_count: number;
      failed_ids: string[];
    }> => ({ success: true, updated_count: ids.length, failed_ids: [] }),
  ),
  bulk_update_items_metadata: vi.fn(),
}));

const toast_mock = vi.hoisted(() => ({
  action: null as { message?: string; email_ids?: string[] } | null,
  errors: [] as string[],
}));

const removed = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/mail", () => ({
  empty_spam: vi.fn(),
  report_spam_sender: vi.fn(async () => ({})),
  remove_spam_sender: vi.fn(async () => ({})),
  trash_thread: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { message?: string; email_ids?: string[] }) => {
    toast_mock.action = opts;
  },
  hide_action_toast: vi.fn(),
  update_progress_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string) => {
    toast_mock.errors.push(message);
  },
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_inbox_toolbar_actions>;

let hook: HookResult;

function Probe({ emails }: { emails: InboxEmail[] }) {
  hook = use_inbox_toolbar_actions({
    t: (key: string) => key,
    current_view: "spam",
    email_state: { emails, total_messages: emails.length },
    get_selected_ids: (list: InboxEmail[]) =>
      list.filter((e) => e.is_selected).map((e) => e.id),
    update_email: vi.fn(),
    remove_email: (id: string) => {
      removed.ids.push(id);
    },
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

const emails = [
  {
    id: "a1",
    is_selected: true,
    thread_token: "thread-a",
    thread_message_count: 2,
    grouped_email_ids: ["a1", "a2"],
    sender_email: "one@example.com",
  },
  { id: "b", is_selected: true, sender_email: "two@example.com" },
] as unknown as InboxEmail[];

let container: HTMLDivElement;
let root: Root;

function render(list: InboxEmail[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Probe, { emails: list }));
  });
}

describe("use_inbox_toolbar_actions bulk restore out of spam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metadata_mock.bulk_update_metadata_by_ids.mockImplementation(
      async (ids: string[]) => ({
        success: true,
        updated_count: ids.length,
        failed_ids: [],
      }),
    );
    toast_mock.action = null;
    toast_mock.errors = [];
    removed.ids = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("unmarks every grouped sibling id, not just the visible row", async () => {
    render(emails);

    await act(async () => {
      await hook.handle_toolbar_restore();
    });

    expect(metadata_mock.bulk_update_metadata_by_ids).toHaveBeenCalledWith(
      ["a1", "a2", "b"],
      { is_spam: false },
    );
  });

  it("still restores the rows that succeeded when one id fails", async () => {
    metadata_mock.bulk_update_metadata_by_ids.mockResolvedValueOnce({
      success: false,
      updated_count: 2,
      failed_ids: ["b"],
    });
    render(emails);

    await act(async () => {
      await hook.handle_toolbar_restore();
    });

    expect(removed.ids).toEqual(["a1"]);
    expect(toast_mock.errors).toEqual([]);
    expect(toast_mock.action?.email_ids).toEqual(["a1"]);
  });

  it("reports an error only when nothing could be restored", async () => {
    metadata_mock.bulk_update_metadata_by_ids.mockResolvedValueOnce({
      success: false,
      updated_count: 0,
      failed_ids: ["a1", "a2", "b"],
    });
    render(emails);

    await act(async () => {
      await hook.handle_toolbar_restore();
    });

    expect(removed.ids).toEqual([]);
    expect(toast_mock.errors).toEqual(["common.failed_to_restore_conversations"]);
  });
});
