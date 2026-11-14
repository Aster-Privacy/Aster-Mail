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
  row_ids: ["e0", "e1", "e2"],
  categories_preference: true as boolean | undefined,
  inbox_tabs_active: false,
  list_categories_enabled: undefined as boolean | undefined,
}));

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

vi.mock("@/components/email/inbox/inbox_email_list", () => ({
  EmailList: ({
    categories_enabled,
  }: {
    categories_enabled?: boolean;
  }): React.ReactElement => {
    hoisted.list_categories_enabled = categories_enabled;

    return <div data-testid="list" />;
  },
  LoadingState: () => null,
  EmptyState: () => null,
  FolderNotFoundState: () => null,
  TagNotFoundState: () => null,
  LockedFolderState: () => null,
}));

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
      const view_mode = "split";
      const reading_pane_position = "right";
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
          inbox_categories_enabled: hoisted.categories_preference,
        },
        mail_stats: { trash: 0 },
        folders_state: { folders: [] },
        tags_state: { tags: [] },
        current_page: 0,
        page_size: 100,
        categories: { enabled: hoisted.inbox_tabs_active, restored: true },
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
        total_pages: 1,
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

let root: Root;
let host: HTMLDivElement;

function render_view(current_view: string): void {
  act(() => {
    root.render(
      <EmailInbox
        active_email_id={null}
        current_view={current_view}
        on_settings_click={() => {}}
        split_email_id={null}
      />,
    );
  });
}

beforeEach(() => {
  hoisted.categories_preference = true;
  hoisted.inbox_tabs_active = false;
  hoisted.list_categories_enabled = undefined;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("EmailInbox category moves outside the inbox tabs", () => {
  it("offers category moves in All Mail when categories are on", () => {
    render_view("all");

    expect(hoisted.list_categories_enabled).toBe(true);
  });

  it("hides category moves in All Mail when categories are off", () => {
    hoisted.categories_preference = false;
    render_view("all");

    expect(hoisted.list_categories_enabled).toBe(false);
  });

  it("keeps category moves off in folder views", () => {
    render_view("sent");

    expect(hoisted.list_categories_enabled).toBe(false);
  });

  it("follows the inbox tabs in the inbox", () => {
    hoisted.inbox_tabs_active = true;
    render_view("inbox");

    expect(hoisted.list_categories_enabled).toBe(true);
  });
});
