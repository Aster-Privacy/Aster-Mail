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

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  categories_enabled: true,
  category_calls: vi.fn(),
  default_calls: vi.fn(),
  refresh_category: vi.fn(),
  refresh_default: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, args?: { count?: number }) =>
      args?.count === undefined ? key : `${key}:${args.count}`,
  }),
}));
vi.mock("@/hooks/use_platform", () => ({
  use_platform: () => ({ safe_area_insets: { top: 0, bottom: 0 } }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      enabled_categories: ["promotions", "social", "updates"],
      custom_categories: [],
    },
  }),
}));
vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ user: { email: "test@example.com" } }),
}));
vi.mock("@/hooks/use_inbox_categories", () => ({
  use_inbox_categories: function useInboxCategories(view: string) {
    const [active_category, set_active_category] = useState("primary");

    return {
      enabled: fixtures.categories_enabled && view === "inbox",
      restored: true,
      active_category,
      set_active_category,
      counts: {},
    };
  },
}));

function email(id: string, is_read = false): InboxEmail {
  return { id, subject: id, is_read, is_pinned: false } as InboxEmail;
}
function list(emails: InboxEmail[], has_more = false) {
  return {
    state: { emails, has_more, has_initial_load: true, is_loading: false },
    refresh: fixtures.refresh_default,
    load_more: vi.fn(),
    update_email: vi.fn(),
    remove_email: vi.fn(),
  };
}
vi.mock("@/hooks/use_email_list", () => ({
  use_email_list: (view: string, enabled: boolean) => {
    fixtures.default_calls(view, enabled);

    return list([email("default")]);
  },
}));
vi.mock("@/hooks/use_category_inbox", () => ({
  use_category_inbox: (category: string, page: number, enabled: boolean) => {
    fixtures.category_calls(category, page, enabled);

    return {
      ...list(
        [
          email(`${category}-${page}-unread`),
          email(`${category}-${page}-read`, true),
        ],
        page === 0,
      ),
      refresh: fixtures.refresh_category,
    };
  },
}));
vi.mock("@/hooks/use_drafts_list", () => ({
  use_drafts_list: () => ({
    state: { drafts: [], is_loading: false },
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/use_scheduled_emails", () => ({
  use_scheduled_emails: () => ({
    state: { emails: [], is_loading: false },
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/use_email_actions", () => ({ use_email_actions: () => ({}) }));
vi.mock("@/hooks/use_snooze", () => ({ use_snooze: () => ({}) }));
vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({ get_tag_by_token: vi.fn(), state: { tags: [] } }),
}));
vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({ get_folder_by_token: vi.fn(), state: { folders: [] } }),
}));
vi.mock("@/hooks/use_sender_alias_backfill", () => ({
  use_sender_alias_backfill: () => "idle",
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: null }),
}));
vi.mock("@/hooks/use_category_previews", () => ({
  use_category_previews: () => ({}),
}));
vi.mock("@/components/email/use_spam_confirm", () => ({
  use_spam_confirm: () => ({
    request_spam: vi.fn(),
    spam_confirm_dialog: null,
  }),
}));
vi.mock("@/components/email/inbox/inbox_confirmation_dialog", () => ({
  ConfirmModal: () => null,
  EmptyTrashModal: () => null,
}));
vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: () => null,
}));
vi.mock("@/components/compose/schedule_picker", () => ({
  SchedulePicker: () => null,
}));
vi.mock("@/components/mobile/mobile_header", () => ({
  MobileHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
vi.mock("@/components/mobile/mobile_email_list", () => ({
  MobileEmailList: (props: {
    emails: InboxEmail[];
    selected_ids: Set<string>;
    on_email_press: (id: string) => void;
    on_long_press: (id: string) => void;
    on_refresh: () => void;
    has_more: boolean;
  }) => (
    <div data-list-has-more={String(props.has_more)}>
      {props.emails.map((e) => (
        <button
          key={e.id}
          data-email-id={e.id}
          data-selected={String(props.selected_ids.has(e.id))}
          onClick={() => props.on_email_press(e.id)}
          onContextMenu={() => props.on_long_press(e.id)}
        >
          {e.subject}
        </button>
      ))}
      <button onClick={props.on_refresh}>Refresh</button>
    </div>
  ),
}));

import MobileInbox from "./mobile_inbox";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;

function mount(mailbox: "inbox" | "sent" = "inbox") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter>
        <MobileInbox mailbox={mailbox} on_open_drawer={() => {}} />
      </MemoryRouter>,
    ),
  );
}
function button(label: string) {
  const match = Array.from(host.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === label || b.textContent === label,
  );

  expect(match, label).toBeTruthy();

  return match!;
}
function checkbox() {
  return host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}
function click(el: HTMLElement) {
  act(() => el.click());
}
function selected_ids() {
  return Array.from(host.querySelectorAll('[data-selected="true"]')).map((e) =>
    e.getAttribute("data-email-id"),
  );
}

beforeEach(() => {
  fixtures.categories_enabled = true;
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("mobile inbox categories and selection", () => {
  it("renders the four categories and loads the selected category, not the default inbox", () => {
    mount();
    const labels = [
      "category_primary",
      "category_promotions",
      "category_social",
      "category_updates",
    ];

    for (const label of labels)
      expect(button(`mail_rules.${label}`)).toBeTruthy();
    expect(fixtures.default_calls).toHaveBeenLastCalledWith("inbox", false);
    click(button("mail_rules.category_promotions"));
    expect(fixtures.category_calls).toHaveBeenLastCalledWith(
      "promotions",
      0,
      true,
    );
    expect(host.textContent).toContain("promotions-0-unread");
    expect(host.textContent).not.toContain("primary-0-unread");
    expect(
      button("mail_rules.category_promotions").getAttribute("aria-current"),
    ).toBe("page");
  });

  it("selects visible emails, reflects partial selection, and clears selection when switching categories", () => {
    mount();
    click(checkbox());
    expect(selected_ids()).toEqual(["primary-0-unread", "primary-0-read"]);
    expect(checkbox().checked).toBe(true);
    click(button("common.deselect_all"));
    expect(selected_ids()).toEqual([]);
    expect(checkbox().checked).toBe(false);
    expect(host.querySelector("header")?.textContent).toBe("mail.inbox");
    click(checkbox());
    click(host.querySelector<HTMLElement>('[data-email-id="primary-0-read"]')!);
    expect(checkbox().checked).toBe(false);
    expect(checkbox().indeterminate).toBe(true);
    click(button("common.select_all"));
    expect(selected_ids()).toEqual(["primary-0-unread", "primary-0-read"]);
    expect(button("common.deselect_all")).toBeTruthy();
    click(button("mail_rules.category_social"));
    expect(selected_ids()).toEqual([]);
    expect(checkbox().checked).toBe(false);
    expect(checkbox().indeterminate).toBe(false);
  });

  it("selects only filtered visible emails and uses category refresh", () => {
    mount();
    click(button("mail.filter_unread"));
    click(checkbox());
    expect(selected_ids()).toEqual(["primary-0-unread"]);
    click(checkbox());
    expect(selected_ids()).toEqual([]);
    click(button("Refresh"));
    expect(fixtures.refresh_category).toHaveBeenCalledOnce();
    expect(fixtures.refresh_default).not.toHaveBeenCalled();
  });

  it("paginates categories, clears selections, and resets the page on category change", () => {
    mount();
    expect(button("common.previous").disabled).toBe(true);
    expect(host.querySelector('[data-list-has-more="false"]')).toBeTruthy();
    click(checkbox());
    click(button("common.next"));
    expect(fixtures.category_calls).toHaveBeenLastCalledWith(
      "primary",
      1,
      true,
    );
    expect(selected_ids()).toEqual([]);
    expect(button("common.next").disabled).toBe(true);
    expect(button("common.previous").disabled).toBe(false);
    click(button("mail_rules.category_updates"));
    expect(fixtures.category_calls).toHaveBeenLastCalledWith(
      "updates",
      0,
      true,
    );
  });

  it("keeps the ordinary list when categories are disabled or viewing another mailbox", () => {
    fixtures.categories_enabled = false;
    mount("sent");
    expect(fixtures.default_calls).toHaveBeenLastCalledWith("sent", true);
    expect(host.querySelector('[role="navigation"]')).toBeNull();
    expect(host.textContent).toContain("default");
    click(checkbox());
    expect(selected_ids()).toEqual(["default"]);
  });
});
