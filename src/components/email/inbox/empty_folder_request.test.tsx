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

const api_mock = vi.hoisted(() => ({
  empty_trash: vi.fn(async () => ({
    data: { success: true, deleted_count: 2 },
  })),
  empty_spam: vi.fn(async () => ({
    data: { success: true, deleted_count: 1 },
  })),
}));

const toast_mock = vi.hoisted(() => ({
  messages: [] as string[],
}));

vi.mock("@/services/api/mail", () => ({
  empty_trash: api_mock.empty_trash,
  empty_spam: api_mock.empty_spam,
  report_spam_sender: vi.fn(async () => ({})),
  remove_spam_sender: vi.fn(async () => ({})),
  trash_thread: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (opts: { message?: string }) => {
    toast_mock.messages.push(opts.message ?? "");
  },
  hide_action_toast: vi.fn(),
  update_progress_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string) => {
    toast_mock.messages.push(message);
  },
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: vi.fn(),
  remove_thread_entries: vi.fn(),
  reindex_ids: vi.fn(),
  set_ids_read: vi.fn(),
}));

import {
  request_empty_folder,
  use_empty_folder_request,
} from "@/components/email/inbox/empty_folder_request";
import { use_inbox_toolbar_actions } from "@/components/email/inbox/use_inbox_toolbar_actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_inbox_toolbar_actions>;

let hook: HookResult;

interface ProbeProps {
  current_view: string;
  is_ready: boolean;
  emails: InboxEmail[];
}

function Probe({ current_view, is_ready, emails }: ProbeProps) {
  hook = use_inbox_toolbar_actions({
    t: (key: string) => key,
    current_view,
    email_state: { emails, total_messages: emails.length },
    get_selected_ids: () => [],
    update_email: vi.fn(),
    remove_email: vi.fn(),
    remove_emails: vi.fn(),
    restore_emails: vi.fn(),
    folders_lookup: new Map(),
    tags_lookup: new Map(),
    preferences: {
      confirm_before_delete: true,
      confirm_before_spam: true,
      confirm_before_archive: true,
      conversation_grouping: true,
    },
    update_preference: vi.fn(),
    save_now: vi.fn(),
    is_drafts_view: false,
    is_scheduled_view: false,
  } as unknown as Parameters<typeof use_inbox_toolbar_actions>[0]);

  use_empty_folder_request({
    current_view,
    is_ready,
    on_empty_trash: hook.handle_empty_trash,
    on_empty_spam: hook.handle_empty_spam,
  });

  return null;
}

const trash_emails = [
  { id: "t1", is_trashed: true },
  { id: "t2", is_trashed: true },
] as unknown as InboxEmail[];

const spam_emails = [{ id: "s1", is_spam: true }] as unknown as InboxEmail[];

let container: HTMLDivElement;
let root: Root;

function render(props: ProbeProps) {
  act(() => {
    root.render(createElement(Probe, props));
  });
}

describe("use_empty_folder_request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast_mock.messages = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("waits for Trash to load, then opens the existing Empty Trash confirmation", async () => {
    render({ current_view: "inbox", is_ready: true, emails: [] });

    act(() => request_empty_folder("trash"));
    expect(hook.show_empty_trash_dialog).toBe(false);

    render({ current_view: "trash", is_ready: false, emails: [] });
    expect(hook.show_empty_trash_dialog).toBe(false);

    render({ current_view: "trash", is_ready: true, emails: trash_emails });
    expect(hook.show_empty_trash_dialog).toBe(true);
    expect(hook.show_empty_spam_dialog).toBe(false);
    expect(api_mock.empty_trash).not.toHaveBeenCalled();

    await act(async () => {
      await hook.confirm_empty_trash();
    });

    expect(api_mock.empty_trash).toHaveBeenCalledTimes(1);
    expect(api_mock.empty_spam).not.toHaveBeenCalled();
    expect(toast_mock.messages).toEqual(["common.trash_emptied"]);
  });

  it("opens the existing Empty Spam confirmation for a Spam request", async () => {
    render({ current_view: "inbox", is_ready: true, emails: [] });

    act(() => request_empty_folder("spam"));
    render({ current_view: "spam", is_ready: true, emails: spam_emails });

    expect(hook.show_empty_spam_dialog).toBe(true);
    expect(hook.show_empty_trash_dialog).toBe(false);

    await act(async () => {
      await hook.confirm_empty_spam();
    });

    expect(api_mock.empty_spam).toHaveBeenCalledTimes(1);
    expect(api_mock.empty_trash).not.toHaveBeenCalled();
  });

  it("asks at once when the folder is already open", () => {
    render({ current_view: "trash", is_ready: true, emails: trash_emails });

    act(() => request_empty_folder("trash"));

    expect(hook.show_empty_trash_dialog).toBe(true);
  });

  it("drops the request when the user leaves the folder before it loads", () => {
    render({ current_view: "inbox", is_ready: true, emails: [] });

    act(() => request_empty_folder("trash"));
    render({ current_view: "trash", is_ready: false, emails: [] });
    render({ current_view: "inbox", is_ready: true, emails: [] });
    render({ current_view: "trash", is_ready: true, emails: trash_emails });

    expect(hook.show_empty_trash_dialog).toBe(false);
  });

  it("never empties anything without the confirmation", () => {
    render({ current_view: "inbox", is_ready: true, emails: [] });

    act(() => request_empty_folder("trash"));
    render({ current_view: "trash", is_ready: true, emails: trash_emails });

    expect(api_mock.empty_trash).not.toHaveBeenCalled();
    act(() => hook.cancel_empty_trash());
    expect(hook.show_empty_trash_dialog).toBe(false);
    expect(api_mock.empty_trash).not.toHaveBeenCalled();
  });
});
