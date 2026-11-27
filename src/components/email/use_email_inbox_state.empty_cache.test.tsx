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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/email/use_inbox_view_state", () => ({
  use_inbox_view_state: () => ({
    ...view_state,
    email_state: harness.email_state,
    active_filter: "all",
    set_active_filter: () => {},
    read_filter: "all",
  }),
}));

vi.mock("@/services/category_index", () => ({
  is_fully_built: () => true,
  is_index_reconciled: () => true,
  is_index_settled: () => true,
  is_serving_previous_build: () => false,
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
const { BLANK_LIST_SKELETON_DELAY_MS } =
  await import("@/hooks/use_delayed_flag");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface EmailState {
  emails: InboxEmail[];
  is_loading: boolean;
  is_loading_more: boolean;
  has_initial_load: boolean;
  has_more: boolean;
  has_load_error: boolean;
  total_messages: number;
}

interface Frame {
  skeleton_visible: boolean;
  empty_state_visible: boolean;
  row_count: number;
}

const noop = (): void => {};
const t = (key: string): string => key;

function settled_empty(): EmailState {
  return {
    emails: [],
    is_loading: false,
    is_loading_more: false,
    has_initial_load: true,
    has_more: false,
    has_load_error: false,
    total_messages: 0,
  };
}

function first_load(): EmailState {
  return {
    ...settled_empty(),
    is_loading: true,
    has_initial_load: false,
  };
}

const harness: {
  initial: EmailState;
  email_state: EmailState | null;
  set_email_state: Dispatch<SetStateAction<EmailState>> | null;
  frames: Frame[];
} = {
  initial: settled_empty(),
  email_state: null,
  set_email_state: null,
  frames: [],
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
  current_page: 0,
  set_current_page: noop,
  page_size: 50,
  categories: { enabled: false, active_category: "primary", counts: {} },
  is_drafts_view: false,
  is_scheduled_view: false,
  is_snoozed_view: false,
  is_archive_view: false,
  is_folder_view: true,
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

function email(id: string): InboxEmail {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "subject " + id,
    preview: "",
    timestamp: "2026-11-20T10:00:00.000Z",
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_selected: false,
    has_attachment: false,
  } as unknown as InboxEmail;
}

function Probe(): null {
  const [email_state, set_email_state] = useState(harness.initial);

  harness.set_email_state = set_email_state;
  harness.email_state = email_state;
  const state = use_email_inbox_state({
    current_view: "folder-receipts",
    on_settings_click: noop,
    active_email_id: null,
    split_email_id: null,
    on_navigate_to: noop,
    on_email_list_change: noop,
  });

  harness.frames.push({
    skeleton_visible: state.skeleton_visible,
    empty_state_visible: state.empty_state_visible,
    row_count: state.filtered_emails.length,
  });

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(initial: EmailState): Promise<void> {
  harness.initial = initial;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MemoryRouter, null, createElement(Probe)));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function last_frame(): Frame {
  const frame = harness.frames[harness.frames.length - 1];

  if (!frame) throw new Error("inbox state not rendered");

  return frame;
}

describe("an empty folder revisit renders steadily from cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.frames = [];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    harness.email_state = null;
    harness.set_email_state = null;
    vi.useRealTimers();
  });

  it("shows the empty state on the first frame and never the skeleton", async () => {
    await mount(settled_empty());

    expect(harness.frames[0]?.empty_state_visible).toBe(true);

    await advance(1000);

    expect(harness.frames.some((f) => f.skeleton_visible)).toBe(false);
    expect(harness.frames.every((f) => f.empty_state_visible)).toBe(true);
  });

  it("swaps in mail found by a background revalidate without a skeleton", async () => {
    await mount(settled_empty());
    await advance(500);

    await act(async () => {
      harness.set_email_state?.((prev) => ({
        ...prev,
        emails: [email("a")],
        total_messages: 1,
      }));
    });
    await advance(1000);

    expect(harness.frames.some((f) => f.skeleton_visible)).toBe(false);
    expect(last_frame().row_count).toBe(1);
    expect(last_frame().empty_state_visible).toBe(false);
  });

  it("delays the skeleton on a true first load with no cache", async () => {
    await mount(first_load());

    expect(last_frame().skeleton_visible).toBe(false);

    await advance(BLANK_LIST_SKELETON_DELAY_MS - 30);
    expect(last_frame().skeleton_visible).toBe(false);

    await advance(30);
    expect(last_frame().skeleton_visible).toBe(true);
    expect(last_frame().empty_state_visible).toBe(false);
  });

  it("goes straight from a fast first load to the empty state", async () => {
    await mount(first_load());
    await advance(BLANK_LIST_SKELETON_DELAY_MS - 60);

    await act(async () => {
      harness.set_email_state?.(settled_empty());
    });
    await advance(1000);

    expect(harness.frames.some((f) => f.skeleton_visible)).toBe(false);
    expect(last_frame().empty_state_visible).toBe(true);
  });
});
