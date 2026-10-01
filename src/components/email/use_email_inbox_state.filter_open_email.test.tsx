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
import type { Dispatch, SetStateAction } from "react";
import type { InboxEmail, InboxFilterType } from "@/types/email";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/email/use_inbox_view_state", () => ({
  use_inbox_view_state: () => ({
    ...view_state,
    email_state: harness.email_state,
  }),
}));

vi.mock("@/services/category_index", () => ({
  is_fully_built: () => true,
  is_index_reconciled: () => true,
  is_index_settled: () => true,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: () => null,
}));

vi.mock("@/components/email/inbox/use_category_drop", () => ({
  use_category_drop: () => () => {},
}));

vi.mock("@/components/email/inbox/use_inbox_bulk_actions", () => ({
  use_inbox_bulk_actions: () => ({}),
}));

vi.mock("@/components/email/inbox/use_inbox_selection_menu", () => ({
  use_inbox_selection_menu: () => null,
}));

const { use_email_inbox_state } =
  await import("@/components/email/use_email_inbox_state");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type InboxState = ReturnType<typeof use_email_inbox_state>;

const noop = (): void => {};
const t = (key: string): string => key;

interface EmailState {
  emails: InboxEmail[];
  is_loading: boolean;
  is_loading_more: boolean;
  has_initial_load: boolean;
  has_more: boolean;
  has_load_error: boolean;
  total_messages: number;
}

const harness: {
  initial_emails: InboxEmail[];
  email_state: EmailState | null;
  set_emails: Dispatch<SetStateAction<InboxEmail[]>> | null;
  state: InboxState | null;
} = { initial_emails: [], email_state: null, set_emails: null, state: null };

const on_navigate_to = vi.fn<(id: string) => void>();
const on_email_list_change = vi.fn<(ids: string[]) => void>();

function update_email(id: string, updates: Partial<InboxEmail>): void {
  harness.set_emails?.((prev) =>
    prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
  );
}

const view_state = {
  t,
  user: { id: "user-1", email: "me@example.com" },
  preferences: {
    email_view_mode: "split",
    reading_pane_position: "right",
    split_pane_width: 480,
    split_pane_height: 320,
    conversation_grouping: false,
    custom_categories: [],
  },
  update_preference: noop,
  mail_stats: { inbox: 0, unread: 0 },
  folders_state: { folders: [] },
  tags_state: { tags: [] },
  current_page: 0,
  set_current_page: noop,
  page_size: 50,
  categories: { enabled: false, active_category: "primary", counts: {} },
  is_drafts_view: false,
  is_scheduled_view: false,
  is_snoozed_view: false,
  is_archive_view: false,
  is_folder_view: false,
  folder_view_token: null,
  folders_loading_for_view: false,
  folder_not_found: false,
  is_tag_view: false,
  tag_view_token: null,
  tag_not_found: false,
  locked_folder: null,
  page_category_ref: { current: "primary" },
  fetch_page: () => Promise.resolve(),
  is_page_cached: () => true,
  update_email,
  refresh_active_list: noop,
  refresh_current_view: noop,
  update_draft: noop,
  scheduled_state: { emails: [] },
  update_scheduled: noop,
  manual_refresh_active: false,
  handle_snooze: () => Promise.resolve(),
  handle_unsnooze: () => Promise.resolve(),
  handle_category_change: noop,
  handle_edit_thread_draft: noop,
  folders_lookup: new Map(),
  tags_lookup: new Map(),
  toolbar: {},
  context_menu_actions: {},
};

function email(id: string, is_read = false): InboxEmail {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: `subject ${id}`,
    preview: "",
    timestamp: "2026-09-30T10:00:00.000Z",
    is_read,
    is_starred: false,
    is_pinned: false,
    is_selected: false,
    has_attachment: false,
  } as unknown as InboxEmail;
}

function Probe({ open_id }: { open_id: string | null }): null {
  const [emails, set_emails] = useState(harness.initial_emails);

  harness.set_emails = set_emails;
  harness.email_state = useMemo(
    () => ({
      emails,
      is_loading: false,
      is_loading_more: false,
      has_initial_load: true,
      has_more: false,
      has_load_error: false,
      total_messages: emails.length,
    }),
    [emails],
  );
  harness.state = use_email_inbox_state({
    current_view: "inbox",
    on_settings_click: noop,
    active_email_id: open_id,
    split_email_id: open_id,
    on_navigate_to,
    on_email_list_change,
  });

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function view(open_id: string | null): React.ReactElement {
  return createElement(MemoryRouter, null, createElement(Probe, { open_id }));
}

function state(): InboxState {
  if (!harness.state) throw new Error("inbox state not rendered");

  return harness.state;
}

async function mount(
  emails: InboxEmail[],
  filter: InboxFilterType,
): Promise<void> {
  harness.initial_emails = emails;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(view(null));
  });
  await act(async () => {
    state().handle_filter_change(filter);
  });
}

async function open_email(
  id: string,
  updates?: Partial<InboxEmail>,
): Promise<void> {
  await act(async () => {
    if (updates) update_email(id, updates);
    root!.render(view(id));
  });
}

async function close_email(): Promise<void> {
  await act(async () => {
    root!.render(view(null));
  });
}

function listed_ids(): string[] {
  return state().filtered_emails.map((e) => e.id);
}

describe("use_email_inbox_state keeps the open email under a list filter", () => {
  beforeEach(() => {
    on_navigate_to.mockClear();
    on_email_list_change.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    harness.state = null;
    harness.email_state = null;
    harness.set_emails = null;
    vi.useRealTimers();
  });

  it("keeps an unread email in place after opening it marks it read", async () => {
    await mount([email("a"), email("b"), email("c")], "unread");
    await open_email("b", { is_read: true });

    expect(listed_ids()).toEqual(["a", "b", "c"]);
    expect(on_email_list_change.mock.lastCall?.[0]).toEqual(["a", "b", "c"]);
    expect(state().nav.local_email_index).toBe(1);
    expect(state().nav.local_can_go_prev).toBe(true);
    expect(state().nav.local_can_go_next).toBe(true);
    expect(state().effective_total_for_pages).toBe(2);
  });

  it("navigates from the kept email and drops it once another email is open", async () => {
    await mount([email("a"), email("b"), email("c")], "unread");
    await open_email("b", { is_read: true });

    act(() => {
      state().nav.handle_local_navigate_next();
    });
    expect(on_navigate_to).toHaveBeenLastCalledWith("c");

    act(() => {
      state().nav.handle_local_navigate_prev();
    });
    expect(on_navigate_to).toHaveBeenLastCalledWith("a");

    await open_email("c", { is_read: true });
    expect(listed_ids()).toEqual(["a", "c"]);
    expect(state().nav.local_email_index).toBe(1);

    await close_email();
    expect(listed_ids()).toEqual(["a"]);
  });

  it("shows the last unread email instead of the empty state while it is open", async () => {
    vi.useFakeTimers();
    await mount([email("a"), email("b", true)], "unread");
    await open_email("a", { is_read: true });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(listed_ids()).toEqual(["a"]);
    expect(state().empty_state_visible).toBe(false);
    expect(state().skeleton_visible).toBe(false);
    expect(state().effective_total_for_pages).toBe(0);

    await close_email();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(listed_ids()).toEqual([]);
    expect(state().empty_state_visible).toBe(true);
  });

  it("keeps the open email when it is marked unread under the Read filter", async () => {
    await mount([email("a", true), email("b", true), email("c", true)], "read");
    await open_email("b");
    expect(state().effective_total_for_pages).toBe(3);

    await act(async () => {
      update_email("b", { is_read: false });
    });

    expect(listed_ids()).toEqual(["a", "b", "c"]);
    expect(state().nav.local_can_go_next).toBe(true);
    expect(state().effective_total_for_pages).toBe(2);
  });

  it("selects every row on screen, including the kept email", async () => {
    await mount([email("a"), email("b"), email("c")], "unread");
    await open_email("b", { is_read: true });
    await act(async () => {
      state().selection.handle_toggle_select_all();
    });

    expect(state().selection.page_selected_count).toBe(3);
    expect(state().selection.all_selected).toBe(true);
  });

  it("does not rebuild the list when an email is opened with no filter on", async () => {
    await mount([email("a"), email("b")], "all");
    const reported = on_email_list_change.mock.calls.length;

    await open_email("a");

    expect(listed_ids()).toEqual(["a", "b"]);
    expect(on_email_list_change.mock.calls.length).toBe(reported);
  });
});
