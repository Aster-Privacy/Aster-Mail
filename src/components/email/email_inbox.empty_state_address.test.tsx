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
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT_EMAIL = "nikola@astermail.org";

const hoisted = vi.hoisted(() => ({
  sender_options: [] as SenderOption[],
}));

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: hoisted.sender_options }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { sender_id: null } })),
    put: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/email/inbox/inbox_email_list", () => ({
  EmailList: () => null,
  LoadingState: () => null,
  EmptyState: ({ user_email }: { user_email?: string }) => (
    <div data-testid="empty-state">{user_email}</div>
  ),
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
  SplitEmailViewer: () => null,
}));
vi.mock("@/components/scheduled/split_scheduled_viewer", () => ({
  SplitScheduledViewer: () => null,
}));
vi.mock("@/components/email/full_email_viewer", () => ({
  FullEmailViewer: () => null,
}));
vi.mock("@/components/email/inbox/inbox_dialogs", () => ({
  InboxDialogs: () => null,
}));
vi.mock("@/components/email/inbox/inbox_confirmation_dialog", () => ({
  ConfirmModal: () => null,
}));
vi.mock("@/components/email/inbox/inbox_bottom_pagination", () => ({
  BottomPagination: () => null,
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

  return {
    use_email_inbox_state: (_props: EmailInboxProps) => {
      const split_pane = use_split_pane({
        is_split_view: false,
        is_bottom_pane: false,
        split_pane_width: 400,
        split_pane_height: 300,
        update_preference: noop,
      });
      const list_scroll = use_inbox_list_scroll({
        show_full_email_viewer: false,
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
        user: { email: ACCOUNT_EMAIL },
        preferences: {
          email_view_mode: "split",
          reading_pane_position: "right",
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
          emails: [],
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
        filtered_emails: [],
        pinned_emails: [],
        primary_emails: [],
        handle_category_drop: noop,
        empty_state_visible: true,
        skeleton_visible: false,
        effective_total_for_pages: 0,
        header_display_count: 0,
        total_pages: 1,
        selection: { excluded_ids: [] },
        scope_for_view: null,
        active_category_title: undefined,
        pending_select_all_action: null,
        set_pending_select_all_action: noop,
        selection_menu: {},
        nav: {
          visible_ids: [],
          local_email_index: -1,
          effective_email_id: null,
          handle_email_click: noop,
        },
        is_split_view: false,
        is_full_view_mode: false,
        show_full_email_viewer: false,
        list_tags: [],
        viewer_folders: [],
        is_bottom_pane: false,
        split_pane,
        ...list_scroll,
      };
    },
  };
});

const { EmailInbox } = await import("@/components/email/email_inbox");
const { set_preferred_sender_id, clear_preferred_sender_local } =
  await import("@/lib/preferred_sender");

const OPTIONS: SenderOption[] = [
  { id: "primary", email: ACCOUNT_EMAIL, type: "primary", is_enabled: true },
  {
    id: "domain-abc",
    email: "info@example.com",
    type: "domain",
    is_enabled: true,
  },
  {
    id: "alias-1",
    email: "shop@astermail.org",
    type: "alias",
    is_enabled: true,
  },
  {
    id: "alias-2",
    email: "old@astermail.org",
    type: "alias",
    is_enabled: false,
  },
  {
    id: "ghost-1",
    email: "ghost@astermail.org",
    type: "ghost",
    is_enabled: true,
  },
];

let root: Root;
let host: HTMLDivElement;

function empty_inbox_address(): string {
  act(() => {
    root.render(
      <EmailInbox current_view="inbox" on_settings_click={() => {}} />,
    );
  });

  return host.querySelector('[data-testid="empty-state"]')?.textContent ?? "";
}

beforeEach(() => {
  hoisted.sender_options = OPTIONS;
  clear_preferred_sender_local();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  clear_preferred_sender_local();
});

describe("EmailInbox empty Inbox address", () => {
  it("shows a custom domain default sender instead of the sign-in address", () => {
    act(() => set_preferred_sender_id("domain-abc"));

    expect(empty_inbox_address()).toBe("info@example.com");
  });

  it("shows an alias default sender", () => {
    act(() => set_preferred_sender_id("alias-1"));

    expect(empty_inbox_address()).toBe("shop@astermail.org");
  });

  it("shows the sign-in address when no default sender is set", () => {
    expect(empty_inbox_address()).toBe(ACCOUNT_EMAIL);
  });

  it("shows the sign-in address when the default sender is disabled", () => {
    act(() => set_preferred_sender_id("alias-2"));

    expect(empty_inbox_address()).toBe(ACCOUNT_EMAIL);
  });

  it("shows the sign-in address when the default sender was deleted", () => {
    act(() => set_preferred_sender_id("alias-deleted"));

    expect(empty_inbox_address()).toBe(ACCOUNT_EMAIL);
  });

  it("shows the sign-in address when the default sender is a ghost alias", () => {
    act(() => set_preferred_sender_id("ghost-1"));

    expect(empty_inbox_address()).toBe(ACCOUNT_EMAIL);
  });

  it("shows the sign-in address before sender options load", () => {
    hoisted.sender_options = [];
    act(() => set_preferred_sender_id("domain-abc"));

    expect(empty_inbox_address()).toBe(ACCOUNT_EMAIL);
  });

  it("follows a default sender change while the Inbox is open", () => {
    expect(empty_inbox_address()).toBe(ACCOUNT_EMAIL);

    act(() => set_preferred_sender_id("domain-abc"));

    expect(host.querySelector('[data-testid="empty-state"]')?.textContent).toBe(
      "info@example.com",
    );
  });
});
