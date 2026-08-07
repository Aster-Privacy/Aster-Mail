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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const { menu_props } = vi.hoisted(() => ({
  menu_props: { current: null as Record<string, unknown> | null },
}));

vi.mock("@/components/email/email_context_menu", () => ({
  EmailContextMenuContent: (props: Record<string, unknown>) => {
    menu_props.current = props;

    return null;
  },
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({ children }: { children?: unknown }) => (
    <button>{children as never}</button>
  ),
  Checkbox: () => null,
  Tooltip: ({ children }: { children?: unknown }) => children as never,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@example.com" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: true } }),
}));

vi.mock("@/hooks/use_attachment_previews", () => ({
  use_attachment_previews: () => new Map(),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: () => null,
  resolve_alias_delivery: () => null,
  subscribe_aliases: () => () => {},
}));

vi.mock("@/utils/email_crypto", () => ({
  RATCHET_UNDECRYPTABLE_SENTINEL: "ratchet-sentinel",
  PGP_UNDECRYPTABLE_SENTINEL: "pgp-sentinel",
}));

vi.mock("@/components/email/hooks/use_email_detail", () => ({
  preload_email_detail: async () => {},
}));

vi.mock("@/components/folders/folder_password_modal", () => ({
  FolderPasswordModal: () => null,
}));

vi.mock("@/components/ui/context_menu", () => ({
  ContextMenu: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ContextMenuTrigger: ({ children }: { children?: unknown }) =>
    children as never,
}));

const { EmailList } = await import("./inbox_email_list");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function make_email(id: string, overrides: Partial<InboxEmail> = {}) {
  return {
    id,
    sender_name: `Sender ${id}`,
    sender_email: `${id}@example.com`,
    subject: `Subject ${id}`,
    preview: "preview",
    timestamp: "10:00",
    is_read: true,
    is_starred: false,
    is_selected: false,
    has_attachment: false,
    folders: [],
    tags: [],
    ...overrides,
  } as unknown as InboxEmail;
}

const noop = () => {};
const async_noop = async () => {};

function make_selection_menu(overrides: Record<string, unknown> = {}) {
  return {
    count: 3,
    is_all_mode: false,
    has_unread: true,
    has_read: true,
    get_folder_status: () => "none" as const,
    get_tag_status: () => "none" as const,
    on_archive: vi.fn(),
    on_delete: vi.fn(),
    on_spam: vi.fn(),
    on_mark_read: vi.fn(),
    on_mark_unread: vi.fn(),
    on_restore: vi.fn(),
    on_mark_not_spam: vi.fn(),
    on_move_to_inbox: vi.fn(),
    on_snooze: vi.fn(async () => {}),
    on_custom_snooze: vi.fn(),
    on_folder_toggle: vi.fn(),
    on_tag_toggle: vi.fn(),
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type ListProps = React.ComponentProps<typeof EmailList>;

function render(props: Record<string, unknown>): void {
  act(() => {
    root!.render(
      <EmailList
        {...({
          pinned_emails: [],
          density: "Default",
          show_profile_pictures: false,
          show_email_preview: false,
          on_toggle_select: noop,
          on_email_click: noop,
          current_view: "inbox",
          folders: [],
          tags: [],
          on_reply: noop,
          on_forward: noop,
          on_toggle_read: noop,
          on_toggle_star: noop,
          on_toggle_pin: noop,
          on_snooze: async_noop,
          on_custom_snooze: noop,
          on_unsnooze: async_noop,
          on_archive: noop,
          on_spam: noop,
          on_delete: noop,
          on_folder_toggle: noop,
          on_tag_toggle: noop,
          on_restore: noop,
          on_mark_not_spam: noop,
          on_move_to_inbox: noop,
          ...props,
        } as unknown as ListProps)}
      />,
    );
  });
}

function right_click_row(index: number): void {
  const rows = container!.querySelectorAll('div[role="button"][draggable]');

  act(() => {
    rows[index].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
  });
}

beforeEach(() => {
  menu_props.current = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("EmailList context menu selection scope", () => {
  it("routes actions on a selected row through the selection handlers", () => {
    const selection_menu = make_selection_menu();
    const on_archive = vi.fn();
    const emails = [
      make_email("a", { is_selected: true }),
      make_email("b", { is_selected: true }),
      make_email("c"),
    ];

    render({ primary_emails: emails, selection_menu, on_archive });
    right_click_row(0);

    act(() => {
      (menu_props.current!.on_archive as () => void)();
      (menu_props.current!.on_delete as () => void)();
      (menu_props.current!.on_mark_read as () => void)();
    });

    expect(selection_menu.on_archive).toHaveBeenCalledTimes(1);
    expect(selection_menu.on_delete).toHaveBeenCalledTimes(1);
    expect(selection_menu.on_mark_read).toHaveBeenCalledTimes(1);
    expect(on_archive).not.toHaveBeenCalled();
    expect(menu_props.current!.selection).toEqual({
      count: 3,
      is_all_mode: false,
      has_unread: true,
      has_read: true,
    });
  });

  it("routes tag and folder toggles through the selection handlers", () => {
    const selection_menu = make_selection_menu();
    const on_tag_toggle = vi.fn();
    const on_folder_toggle = vi.fn();

    render({
      primary_emails: [make_email("a", { is_selected: true })],
      selection_menu,
      on_tag_toggle,
      on_folder_toggle,
    });
    right_click_row(0);

    act(() => {
      (menu_props.current!.on_tag_toggle as (token: string) => void)("tag-1");
      (menu_props.current!.on_folder_toggle as (id: string) => void)("f-1");
    });

    expect(selection_menu.on_tag_toggle).toHaveBeenCalledWith("tag-1");
    expect(selection_menu.on_folder_toggle).toHaveBeenCalledWith("f-1");
    expect(on_tag_toggle).not.toHaveBeenCalled();
    expect(on_folder_toggle).not.toHaveBeenCalled();
  });

  it("leaves the selection untouched and acts on one row when the target is unselected", () => {
    const selection_menu = make_selection_menu();
    const on_select_only = vi.fn();
    const on_toggle_select = vi.fn();
    const on_archive = vi.fn();
    const emails = [
      make_email("a", { is_selected: true }),
      make_email("b", { is_selected: true }),
      make_email("c"),
    ];

    render({
      primary_emails: emails,
      selection_menu,
      on_select_only,
      on_toggle_select,
      on_archive,
    });
    right_click_row(2);

    expect(on_select_only).not.toHaveBeenCalled();
    expect(on_toggle_select).not.toHaveBeenCalled();
    expect(menu_props.current!.selection).toBeUndefined();

    act(() => {
      (menu_props.current!.on_archive as () => void)();
    });

    expect(selection_menu.on_archive).not.toHaveBeenCalled();
    expect(on_archive).toHaveBeenCalledTimes(1);
    expect((on_archive.mock.calls[0][0] as InboxEmail).id).toBe("c");
  });

  it("still auto-selects a row when no multi-selection is active", () => {
    const on_select_only = vi.fn();

    render({
      primary_emails: [make_email("a")],
      selection_menu: null,
      on_select_only,
    });
    right_click_row(0);

    expect(on_select_only).toHaveBeenCalledWith("a");
  });

  it("marks folders and tags as assigned from the selection status", () => {
    const selection_menu = make_selection_menu({
      get_folder_status: (id: string) => (id === "f-1" ? "all" : "some"),
      get_tag_status: (token: string) => (token === "t-1" ? "all" : "none"),
    });

    render({
      primary_emails: [make_email("a", { is_selected: true })],
      selection_menu,
      folders: [
        { id: "f-1", name: "One", color: "#111111" },
        { id: "f-2", name: "Two", color: "#222222" },
      ],
      tags: [
        { tag_token: "t-1", name: "Alpha", color: "#111111" },
        { tag_token: "t-2", name: "Beta", color: "#222222" },
      ],
    });
    right_click_row(0);

    expect(menu_props.current!.folders).toEqual([
      { id: "f-1", name: "One", color: "#111111", is_assigned: true },
      { id: "f-2", name: "Two", color: "#222222", is_assigned: false },
    ]);
    expect(
      (menu_props.current!.tags as { is_assigned: boolean }[]).map(
        (tag) => tag.is_assigned,
      ),
    ).toEqual([true, false]);
  });

  it("reports select-all mode to the menu", () => {
    const selection_menu = make_selection_menu({
      count: 20000,
      is_all_mode: true,
    });

    render({
      primary_emails: [make_email("a", { is_selected: true })],
      selection_menu,
    });
    right_click_row(0);

    expect(menu_props.current!.selection).toEqual({
      count: 20000,
      is_all_mode: true,
      has_unread: true,
      has_read: true,
    });
  });
});
