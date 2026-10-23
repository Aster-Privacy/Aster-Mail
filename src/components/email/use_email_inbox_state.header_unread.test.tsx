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
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/email/use_inbox_view_state", () => ({
  use_inbox_view_state: ({ current_view }: { current_view: string }) => {
    const [list_view, set_list_view] = useState(current_view);
    const last_list = useRef(harness.email_state);

    if (list_view !== current_view) {
      set_list_view(current_view);

      return {
        ...view_state,
        ...harness.overrides,
        email_state: last_list.current,
      };
    }

    last_list.current = harness.email_state;

    return {
      ...view_state,
      ...harness.overrides,
      email_state: harness.email_state,
    };
  },
}));

vi.mock("@/services/category_index", () => ({
  is_fully_built: () => harness.index_built,
  is_index_reconciled: () => harness.index_built,
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

const harness: {
  email_state: EmailState;
  state: InboxState | null;
  overrides: Record<string, unknown>;
  index_built: boolean;
} = {
  email_state: loading_state(),
  state: null,
  overrides: {},
  index_built: true,
};

const view_state = {
  active_filter: "all",
  set_active_filter: noop,
  read_filter: "all",
  t: (key: string): string => key,
  user: { id: "user-1", email: "me@example.com" },
  preferences: { conversation_grouping: true, custom_categories: [] },
  update_preference: noop,
  mail_stats: {
    inbox: 26,
    sent: 2514,
    archived: 18926,
    spam: 12,
    trash: 40,
    drafts: 4,
    scheduled: 2,
    snoozed: 1,
    unread: 0,
  },
  folders_state: { folders: [] },
  folder_unread_counts: {},
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

function mail(id: string, extra: Partial<InboxEmail> = {}): InboxEmail {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: `subject ${id}`,
    preview: "",
    timestamp: "2026-09-30T10:00:00.000Z",
    is_read: true,
    is_starred: false,
    is_pinned: false,
    is_selected: false,
    has_attachment: false,
    ...extra,
  } as unknown as InboxEmail;
}

function rows(count: number, unread = 0): InboxEmail[] {
  return Array.from({ length: count }, (_, i) =>
    mail(`m${i}`, { is_read: i >= unread }),
  );
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

function loaded(count: number, total: number, unread = 0): EmailState {
  return {
    ...loading_state(),
    emails: rows(count, unread),
    is_loading: false,
    has_initial_load: true,
    has_more: total > count,
    total_messages: total,
  };
}

function folder_view(token: string, unread_counts: Record<string, number>) {
  return {
    is_folder_view: true,
    folder_view_token: token,
    folder_unread_counts: unread_counts,
  };
}

describe("use_email_inbox_state header count follows the mail-client convention", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    harness.state = null;
    harness.overrides = {};
    harness.index_built = true;
  });

  it("shows nothing for Sent", async () => {
    await render("sent", loaded(50, 2514));

    expect(state().effective_total_for_pages).toBe(2514);
    expect(state().header_display_count).toBeUndefined();
  });

  it("shows nothing for Trash", async () => {
    await render("trash", loaded(40, 40, 6));

    expect(state().header_display_count).toBeUndefined();
  });

  it("shows nothing for views without a server unread count", async () => {
    for (const view of ["archive", "spam", "starred", "all", "tag-t1"]) {
      await render(view, loaded(50, 300, 4));

      expect(state().header_display_count).toBeUndefined();
    }
  });

  it("shows a custom folder's unread count", async () => {
    harness.overrides = folder_view("f1", { f1: 7, f2: 1 });
    await render("folder-f1", loaded(50, 900, 7));

    expect(state().effective_total_for_pages).toBe(900);
    expect(state().header_display_count).toBe(7);
  });

  it("hides a custom folder's count when nothing is unread", async () => {
    harness.overrides = folder_view("f1", { f1: 0 });
    await render("folder-f1", loaded(50, 900));

    expect(state().header_display_count).toBe(0);
  });

  it("follows a custom folder's unread count as it changes", async () => {
    harness.overrides = folder_view("f1", { f1: 7 });
    await render("folder-f1", loaded(50, 900, 7));
    expect(state().header_display_count).toBe(7);

    harness.overrides = folder_view("f1", { f1: 6 });
    await render("folder-f1", loaded(50, 900, 6));
    expect(state().header_display_count).toBe(6);
  });

  it("hides a custom folder's count until its counts load", async () => {
    harness.overrides = folder_view("f1", {});
    await render("folder-f1", loaded(50, 900, 7));
    expect(state().header_display_count).toBeUndefined();

    harness.overrides = folder_view("f1", { f1: 7 });
    await render("folder-f1", loaded(50, 900, 7));
    expect(state().header_display_count).toBe(7);
  });

  it("hides a locked folder's count", async () => {
    harness.overrides = {
      ...folder_view("f1", { f1: 7 }),
      locked_folder: { id: "f1-id", name: "Private" },
    };
    await render("folder-f1", loaded(0, 0));

    expect(state().header_display_count).toBeUndefined();
  });

  it("keeps the inbox unread count", async () => {
    harness.overrides = {
      mail_stats: { ...view_state.mail_stats, inbox: 120, unread: 3 },
    };
    await render("inbox", loaded(50, 120, 3));

    expect(state().header_display_count).toBe(3);
  });

  it("keeps the active category's unread count", async () => {
    harness.overrides = {
      categories: {
        enabled: true,
        active_category: "primary",
        counts: { primary: { total: 40, unread: 5 } },
      },
    };
    await render("inbox", loaded(40, 40, 5));

    expect(state().header_display_count).toBe(5);
  });

  it("keeps the queue counts for Drafts, Scheduled and Snoozed", async () => {
    await render("drafts", loaded(4, 4));
    expect(state().header_display_count).toBe(4);

    await render("scheduled", loaded(2, 2));
    expect(state().header_display_count).toBe(2);

    await render("snoozed", loaded(1, 1));
    expect(state().header_display_count).toBe(1);
  });

  it("does not carry the inbox count into a folder whose counts are loading", async () => {
    harness.overrides = {
      mail_stats: { ...view_state.mail_stats, unread: 9 },
    };
    await render("inbox", loaded(26, 26, 9));
    expect(state().header_display_count).toBe(9);

    harness.overrides = {
      mail_stats: { ...view_state.mail_stats, unread: 9 },
      ...folder_view("f1", {}),
    };
    await render("folder-f1", loading_state());
    expect(state().header_display_count).toBeUndefined();

    await render("sent", loading_state());
    expect(state().header_display_count).toBeUndefined();
  });

  it("does not carry one folder's count into another", async () => {
    harness.overrides = folder_view("f1", { f1: 5 });
    await render("folder-f1", loaded(50, 200, 5));
    expect(state().header_display_count).toBe(5);

    harness.overrides = folder_view("f2", { f1: 5 });
    await render("folder-f2", loading_state());
    expect(state().header_display_count).toBeUndefined();

    harness.overrides = folder_view("f2", { f1: 5, f2: 2 });
    await render("folder-f2", loaded(10, 10, 2));
    expect(state().header_display_count).toBe(2);
  });
});
