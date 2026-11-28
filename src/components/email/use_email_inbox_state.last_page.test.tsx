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

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/email/use_inbox_view_state", () => ({
  use_inbox_view_state: () => {
    const [active_filter, set_active_filter] = useState<InboxFilterType>(
      harness.filter,
    );
    const [current_page, set_current_page] = useState(harness.start_page);

    harness.current_page = current_page;

    return {
      ...view_state,
      email_state: harness.email_state,
      active_filter,
      set_active_filter,
      current_page,
      set_current_page,
      read_filter:
        active_filter === "unread" || active_filter === "read"
          ? active_filter
          : "all",
    };
  },
}));

vi.mock("@/services/category_index", () => ({
  is_fully_built: () => true,
  is_index_reconciled: () => true,
  is_index_settled: () => true,
  is_serving_previous_build: () => false,
  is_index_capped: () => false,
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
  filter: InboxFilterType;
  start_page: number;
  current_page: number;
  server_total: number;
  initial_emails: InboxEmail[];
  email_state: EmailState | null;
  set_emails: Dispatch<SetStateAction<InboxEmail[]>> | null;
} = {
  filter: "all",
  start_page: 0,
  current_page: 0,
  server_total: 0,
  initial_emails: [],
  email_state: null,
  set_emails: null,
};

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
  update_email: noop,
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

function Probe(): null {
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
      total_messages: harness.server_total,
    }),
    [emails],
  );
  use_email_inbox_state({
    current_view: "inbox",
    on_settings_click: noop,
    active_email_id: null,
    split_email_id: null,
    on_navigate_to: noop,
    on_email_list_change: noop,
  });

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(options: {
  emails: InboxEmail[];
  page: number;
  server_total: number;
  filter?: InboxFilterType;
}): Promise<void> {
  harness.initial_emails = options.emails;
  harness.start_page = options.page;
  harness.server_total = options.server_total;
  harness.filter = options.filter ?? "all";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MemoryRouter, null, createElement(Probe)));
  });
}

describe("use_email_inbox_state on a last page past the server total", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    harness.email_state = null;
    harness.set_emails = null;
  });

  it("stays on a third page that loaded rows when the total counts two", async () => {
    await mount({
      emails: [email("a"), email("b"), email("c")],
      page: 2,
      server_total: 97,
    });

    expect(harness.current_page).toBe(2);
  });

  it("steps back once every row on that page has left the unread filter", async () => {
    await mount({
      emails: [email("a"), email("b"), email("c")],
      page: 2,
      server_total: 97,
      filter: "unread",
    });

    expect(harness.current_page).toBe(2);

    await act(async () => {
      harness.set_emails?.((prev) =>
        prev.map((e) => ({ ...e, is_read: true })),
      );
    });

    expect(harness.current_page).toBe(1);
  });
});
