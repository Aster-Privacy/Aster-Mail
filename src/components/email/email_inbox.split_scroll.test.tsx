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
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  row_ids: Array.from({ length: 100 }, (_, index) => `e${index}`),
  layout: {
    view_mode: "split" as "split" | "fullpage",
    reading_pane_position: "right" as "right" | "bottom",
  },
  list_mounts: 0,
}));

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

vi.mock("@/components/email/inbox/inbox_email_list", async () => {
  const { useEffect } = await import("react");

  function EmailList({
    primary_emails,
  }: {
    primary_emails: InboxEmail[];
  }): React.ReactElement {
    useEffect(() => {
      hoisted.list_mounts += 1;
    }, []);

    return (
      <div>
        {primary_emails.map((email) => (
          <div key={email.id} data-row-email-id={email.id}>
            {email.id}
          </div>
        ))}
      </div>
    );
  }

  return {
    EmailList,
    LoadingState: () => null,
    EmptyState: () => null,
    FolderNotFoundState: () => null,
    TagNotFoundState: () => null,
    LockedFolderState: () => null,
  };
});

vi.mock("@/components/email/email_list_header", () => ({
  EmailListHeader: () => null,
}));
vi.mock("@/components/email/inbox/category_tabs", () => ({
  CategoryTabs: () => null,
}));
vi.mock("@/components/email/inbox/mail_filter_chips", () => ({
  MailFilterChips: () => null,
}));
vi.mock("@/components/email/inbox/alias_indexing_notice", () => ({
  AliasIndexingNotice: () => null,
}));
vi.mock("@/hooks/use_sender_alias_backfill", () => ({
  use_sender_alias_backfill: () => "idle",
}));
vi.mock("@/components/email/inbox/category_empty_state", () => ({
  CategoryEmptyState: () => null,
}));
vi.mock("@/components/email/split_email_viewer", () => ({
  SplitEmailViewer: () => <div data-testid="split-viewer" />,
}));
vi.mock("@/components/scheduled/split_scheduled_viewer", () => ({
  SplitScheduledViewer: () => null,
}));
vi.mock("@/components/email/full_email_viewer", () => ({
  FullEmailViewer: () => <div data-testid="full-viewer" />,
}));
vi.mock("@/components/email/inbox/inbox_dialogs", () => ({
  InboxDialogs: () => null,
}));
vi.mock("@/components/email/inbox/inbox_confirmation_dialog", () => ({
  ConfirmModal: () => null,
}));
vi.mock("@/components/email/inbox/inbox_bottom_pagination", () => ({
  BottomPagination: ({
    on_page_change,
  }: {
    on_page_change: (page: number) => void;
  }) => (
    <button
      data-testid="next-page"
      type="button"
      onClick={() => on_page_change(1)}
    >
      next
    </button>
  ),
}));
vi.mock("@/components/email/inbox/inbox_storage_banner", () => ({
  StorageBanner: () => null,
}));
vi.mock("@/components/email/inbox/inbox_trash_banner", () => ({
  TrashBanner: () => null,
}));
vi.mock("@/components/email/inbox/inbox_view_helpers", () => ({
  get_view_title: () => "Inbox",
  get_search_context: () => undefined,
}));

// Stands in for the inbox state hook with the parts the layout depends on,
// derived the same way the real hook does, and the real split pane and list
// scroll hooks.
vi.mock("@/components/email/use_email_inbox_state", async () => {
  const { use_split_pane } =
    await import("@/components/email/inbox/use_split_pane");
  const { use_inbox_list_scroll } =
    await import("@/components/email/inbox/use_inbox_list_scroll");
  const noop = () => {};
  const is_page_cached = () => true;
  const t = (key: string) => key;
  const emails = hoisted.row_ids.map(
    (id) => ({ id, is_spam: false }) as unknown as InboxEmail,
  );

  return {
    use_email_inbox_state: (props: EmailInboxProps) => {
      const { view_mode, reading_pane_position } = hoisted.layout;
      const split_email_id = props.split_email_id ?? null;
      const is_split_view = !!split_email_id;
      const is_full_view_mode = view_mode === "fullpage";
      const show_full_email_viewer = is_full_view_mode && !!split_email_id;
      const is_bottom_pane = reading_pane_position === "bottom";
      const split_pane = use_split_pane({
        is_split_view,
        is_bottom_pane,
        split_pane_width: 400,
        split_pane_height: 300,
        update_preference: noop,
      });
      const list_scroll = use_inbox_list_scroll({
        show_full_email_viewer,
        split_pane,
        current_page: 0,
        page_size: 100,
        is_page_cached,
        set_is_paginating: noop,
        set_current_page: noop,
        set_active_filter: noop,
      });

      return {
        t,
        user: null,
        preferences: {
          email_view_mode: view_mode,
          reading_pane_position,
          show_email_preview: true,
        },
        mail_stats: { trash: 0 },
        folders_state: { folders: [] },
        tags_state: { tags: [] },
        current_page: 0,
        page_size: 100,
        categories: { enabled: false, restored: true },
        is_drafts_view: false,
        is_scheduled_view: false,
        is_archive_view: false,
        folder_not_found: false,
        tag_not_found: false,
        locked_folder: null,
        refresh_current_view: noop,
        manual_refresh_active: false,
        handle_snooze: noop,
        handle_category_change: noop,
        email_state: {
          emails,
          is_loading_more: false,
          has_load_error: false,
        },
        handle_edit_thread_draft: noop,
        toolbar: {},
        context_menu_actions: {},
        active_filter: "all",
        custom_snooze_email: null,
        set_custom_snooze_email: noop,
        show_toolbar_custom_snooze: false,
        set_show_toolbar_custom_snooze: noop,
        filtered_emails: emails,
        pinned_emails: [],
        primary_emails: emails,
        handle_category_drop: noop,
        empty_state_visible: false,
        skeleton_visible: false,
        effective_total_for_pages: emails.length,
        header_display_count: emails.length,
        total_pages: 2,
        selection: { excluded_ids: [] },
        scope_for_view: null,
        active_category_title: undefined,
        pending_select_all_action: null,
        set_pending_select_all_action: noop,
        selection_menu: {},
        nav: {
          visible_ids: hoisted.row_ids,
          local_email_index: -1,
          effective_email_id: split_email_id,
          handle_email_click: noop,
        },
        is_split_view,
        is_full_view_mode,
        show_full_email_viewer,
        list_tags: [],
        viewer_folders: [],
        is_bottom_pane,
        split_pane,
        ...list_scroll,
      };
    },
  };
});

const { EmailInbox } = await import("@/components/email/email_inbox");

const ROW_HEIGHT = 40;
const LIST_TOP = 100;
const FULL_LIST_HEIGHT = 900;

let root: Root;
let host: HTMLDivElement;

// happy-dom has no layout, so place rows the way a browser would: one after
// another inside the list, moved up by how far the list is scrolled, and the
// list as tall as its inline height, or the full height when it has none.
function stub_layout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const row_id = this.dataset["rowEmailId"];

      if (row_id) {
        const list = this.closest(".overflow-y-auto") as HTMLElement;
        const top =
          LIST_TOP +
          hoisted.row_ids.indexOf(row_id) * ROW_HEIGHT -
          list.scrollTop;

        return new DOMRect(0, top, 400, ROW_HEIGHT);
      }

      if (this.classList.contains("overflow-y-auto")) {
        const height = parseFloat(this.style.height) || FULL_LIST_HEIGHT;

        return new DOMRect(0, LIST_TOP, 400, height);
      }

      return new DOMRect(0, 0, 0, 0);
    },
  );
}

function render_inbox(open_email_id: string | null): void {
  act(() => {
    root.render(
      <EmailInbox
        active_email_id={open_email_id}
        current_view="inbox"
        on_settings_click={() => {}}
        split_email_id={open_email_id}
      />,
    );
  });
}

function row(id: string): HTMLElement | null {
  return host.querySelector(`[data-row-email-id="${id}"]`);
}

function list_holding(id: string): HTMLElement {
  return row(id)!.closest(".overflow-y-auto") as HTMLElement;
}

function scroll_list(list: HTMLElement, top: number): void {
  act(() => {
    list.scrollTop = top;
    list.dispatchEvent(new Event("scroll"));
  });
}

function expect_row_in_view(id: string): void {
  const list_rect = list_holding(id).getBoundingClientRect();
  const row_rect = row(id)!.getBoundingClientRect();

  expect(row_rect.top).toBeGreaterThanOrEqual(list_rect.top);
  expect(row_rect.bottom).toBeLessThanOrEqual(list_rect.bottom);
}

beforeEach(() => {
  hoisted.layout.view_mode = "split";
  hoisted.layout.reading_pane_position = "right";
  hoisted.list_mounts = 0;
  stub_layout();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("EmailInbox list scroll across the reading pane", () => {
  it("keeps the list mounted and scrolled when an email opens beside it", () => {
    render_inbox(null);
    const list = list_holding("e0");

    scroll_list(list, 1800);
    expect_row_in_view("e50");

    render_inbox("e50");

    expect(host.querySelector('[data-testid="split-viewer"]')).not.toBeNull();
    expect(list_holding("e50")).toBe(list);
    expect(list.scrollTop).toBe(1800);
    expect(hoisted.list_mounts).toBe(1);
    expect_row_in_view("e50");
  });

  it("keeps the list mounted and scrolled when the open email closes", () => {
    render_inbox(null);
    render_inbox("e10");
    const list = list_holding("e0");
    const mounts_while_open = hoisted.list_mounts;

    scroll_list(list, 2200);
    render_inbox(null);

    expect(host.querySelector('[data-testid="split-viewer"]')).toBeNull();
    expect(list_holding("e0")).toBe(list);
    expect(list.scrollTop).toBe(2200);
    expect(hoisted.list_mounts).toBe(mounts_while_open);
  });

  it("scrolls the clicked row back into view when the pane opens below the list", () => {
    hoisted.layout.reading_pane_position = "bottom";
    render_inbox(null);
    const list = list_holding("e0");

    scroll_list(list, 1800);
    expect_row_in_view("e65");

    render_inbox("e65");

    expect(list_holding("e65")).toBe(list);
    expect(hoisted.list_mounts).toBe(1);
    expect_row_in_view("e65");
    // The list is now 300px tall, so the row's bottom edge (940) is below the
    // list's (400): the smallest scroll that shows it lines the two up.
    expect(list.scrollTop).toBe(1800 + 940 - 400);
  });

  it("restores the list position after the full-page viewer closes", () => {
    hoisted.layout.view_mode = "fullpage";
    render_inbox(null);

    scroll_list(list_holding("e0"), 1800);
    render_inbox("e50");

    expect(host.querySelector('[data-testid="full-viewer"]')).not.toBeNull();
    expect(row("e50")).toBeNull();

    render_inbox(null);

    expect(list_holding("e50").scrollTop).toBe(1800);
  });

  it("returns the list to the top on a page change with or without the pane", () => {
    render_inbox(null);
    const list = list_holding("e0");

    scroll_list(list, 1800);
    act(() => {
      host.querySelector<HTMLElement>('[data-testid="next-page"]')!.click();
    });
    expect(list.scrollTop).toBe(0);

    render_inbox("e5");
    const open_list = list_holding("e0");

    scroll_list(open_list, 1800);
    act(() => {
      host.querySelector<HTMLElement>('[data-testid="next-page"]')!.click();
    });
    expect(open_list.scrollTop).toBe(0);
  });
});
