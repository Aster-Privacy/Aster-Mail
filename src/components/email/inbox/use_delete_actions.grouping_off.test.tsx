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
import type { EmailListState, InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act, useRef, useState } from "react";
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
}));

const index_mock = vi.hoisted(() => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn((_token: string) => [] as string[]),
  reindex_ids: vi.fn(),
}));

const toast_mock = vi.hoisted(() => ({
  on_undo: null as null | (() => Promise<void>),
}));

vi.mock("@/services/api/mail", () => ({
  trash_thread: api_mock.trash_thread,
  permanent_delete_mail_item: vi.fn(),
  batched_bulk_permanent_delete: vi.fn(),
  empty_trash: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => metadata_mock);

vi.mock("@/services/api/archive", () => ({
  batched_archive: vi.fn(),
  batched_unarchive: vi.fn(),
}));

vi.mock("@/services/category_index", () => index_mock);

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { on_undo?: () => Promise<void> }) => {
    toast_mock.on_undo = opts.on_undo ?? null;
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

import { use_email_list_bulk } from "@/hooks/use_email_list_bulk";
import { use_delete_actions } from "@/components/email/inbox/use_delete_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type DeleteActions = ReturnType<typeof use_delete_actions>;

let actions: DeleteActions;

function Probe({
  emails,
  conversation_grouping,
}: {
  emails: InboxEmail[];
  conversation_grouping: boolean;
}) {
  const [state, set_state] = useState<EmailListState>({
    emails,
    total_messages: emails.length,
  } as unknown as EmailListState);
  const fetch_page_ref = useRef(null);
  const { bulk_delete } = use_email_list_bulk({
    state,
    set_state,
    fetch_page_ref,
  });

  actions = use_delete_actions({
    t: (key: string) => key,
    current_view: "inbox",
    email_state: { emails, total_messages: emails.length },
    get_selected_ids: (list: InboxEmail[]) =>
      list.filter((e) => e.is_selected).map((e) => e.id),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    bulk_delete,
    preferences: { confirm_before_delete: false, conversation_grouping },
    is_drafts_view: false,
    is_scheduled_view: false,
    set_confirmations: vi.fn(),
  } as unknown as Parameters<typeof use_delete_actions>[0]);

  return null;
}

const selected_message = {
  id: "m1",
  is_selected: true,
  is_read: true,
  item_type: "received",
  thread_token: "thread-1",
  thread_message_count: 3,
  timestamp: "2026-09-01T10:00:00Z",
} as unknown as InboxEmail;

let container: HTMLDivElement;
let root: Root;

function render(conversation_grouping: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(Probe, {
        emails: [selected_message],
        conversation_grouping,
      }),
    );
  });
}

async function delete_then_undo() {
  await act(async () => {
    await actions.handle_toolbar_delete();
  });
  expect(toast_mock.on_undo).not.toBeNull();
  await act(async () => {
    await toast_mock.on_undo!();
  });
}

describe("toolbar delete and undo follow conversation grouping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    toast_mock.on_undo = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("trashes and restores only the selected message when grouping is off", async () => {
    render(false);
    await delete_then_undo();

    expect(api_mock.trash_thread).not.toHaveBeenCalled();
    expect(index_mock.remove_thread_entries).not.toHaveBeenCalled();
    expect(metadata_mock.bulk_update_metadata_by_ids.mock.calls).toEqual([
      [["m1"], { is_trashed: true }],
      [["m1"], { is_trashed: false }],
    ]);
  });

  it("still trashes and restores the whole thread when grouping is on", async () => {
    render(true);
    await delete_then_undo();

    expect(api_mock.trash_thread.mock.calls).toEqual([
      ["thread-1", true],
      ["thread-1", false],
    ]);
    expect(metadata_mock.bulk_update_metadata_by_ids).not.toHaveBeenCalled();
  });
});
