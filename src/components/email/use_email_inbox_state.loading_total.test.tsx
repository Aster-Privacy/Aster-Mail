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

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
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

interface EmailState {
  emails: InboxEmail[];
  is_loading: boolean;
  is_loading_more: boolean;
  has_initial_load: boolean;
  has_more: boolean;
  has_load_error: boolean;
  total_messages: number;
}

const noop = (): void => {};

const harness: { email_state: EmailState; state: InboxState | null } = {
  email_state: loading_state(),
  state: null,
};

const view_state = {
  t: (key: string): string => key,
  user: { id: "user-1", email: "me@example.com" },
  preferences: { conversation_grouping: true, custom_categories: [] },
  update_preference: noop,
  mail_stats: { inbox: 51, sent: 38, archived: 18926, unread: 0 },
  folders_state: { folders: [] },
  tags_state: { tags: [] },
  current_page: 0,
  set_current_page: noop,
  page_size: 50,
  categories: { enabled: false, active_category: "primary", counts: {} },
  is_drafts_view: false,
  is_scheduled_view: false,
  is_snoozed_view: false,
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

function loading_state(): EmailState {
  return {
    emails: [],
    is_loading: true,
    is_loading_more: false,
    has_initial_load: false,
    has_more: false,
    has_load_error: false,
    total_messages: 0,
  };
}

function sent_email(id: string): InboxEmail {
  return {
    id,
    item_type: "sent",
    sender_name: "Me",
    sender_email: "me@example.com",
    subject: `subject ${id}`,
    preview: "",
    timestamp: "2026-09-30T10:00:00.000Z",
    is_read: true,
    is_starred: false,
    is_pinned: false,
    is_selected: false,
    has_attachment: false,
  } as unknown as InboxEmail;
}

function rows(count: number): InboxEmail[] {
  return Array.from({ length: count }, (_, i) => sent_email(`m${i}`));
}

function Probe({ current_view }: { current_view: string }): null {
  harness.state = use_email_inbox_state({
    current_view,
    on_settings_click: noop,
  });

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(current_view: string, email_state: EmailState) {
  harness.email_state = email_state;
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(
      createElement(MemoryRouter, null, createElement(Probe, { current_view })),
    );
  });
}

function state(): InboxState {
  if (!harness.state) throw new Error("inbox state not rendered");

  return harness.state;
}

describe("use_email_inbox_state list total before the first page arrives", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    harness.state = null;
  });

  it("does not show the Sent stats count as the list total while loading", async () => {
    await render("sent", loading_state());

    expect(state().effective_total_for_pages).toBe(0);
    expect(state().header_display_count).toBeUndefined();

    await render("sent", {
      ...loading_state(),
      emails: rows(50),
      is_loading: false,
      has_initial_load: true,
      has_more: true,
      total_messages: 2500,
    });

    expect(state().effective_total_for_pages).toBe(2500);
    expect(state().header_display_count).toBe(2500);
  });

  it("does not show the restored snapshot row count as the list total", async () => {
    await render("sent", {
      ...loading_state(),
      emails: rows(100),
      total_messages: 100,
    });

    expect(state().effective_total_for_pages).toBe(0);
  });

  it("treats Inbox and Archive the same way while loading", async () => {
    await render("inbox", loading_state());
    expect(state().effective_total_for_pages).toBe(0);

    await render("archive", loading_state());
    expect(state().effective_total_for_pages).toBe(0);
  });

  it("keeps the last loaded total while a cached view revalidates", async () => {
    await render("sent", {
      ...loading_state(),
      emails: rows(50),
      has_initial_load: true,
      total_messages: 2500,
    });

    expect(state().effective_total_for_pages).toBe(2500);
  });

  it("still falls back to the stats count when the list load fails", async () => {
    await render("sent", {
      ...loading_state(),
      is_loading: false,
      has_initial_load: true,
      has_load_error: true,
    });

    expect(state().effective_total_for_pages).toBe(38);
  });
});
