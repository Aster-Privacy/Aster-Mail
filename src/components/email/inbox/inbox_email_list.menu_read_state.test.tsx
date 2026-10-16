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

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
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
const { emit_mail_item_updated } = await import("@/hooks/mail_events");

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

describe("EmailList context menu read state", () => {
  it("shows the read state the row has now, not the one it had at right-click", () => {
    render({ primary_emails: [make_email("a", { is_read: false })] });
    right_click_row(0);

    expect((menu_props.current!.email as InboxEmail).is_read).toBe(false);

    render({ primary_emails: [make_email("a", { is_read: true })] });

    expect((menu_props.current!.email as InboxEmail).is_read).toBe(true);
  });

  it("keeps the latest read state after the row leaves the list", () => {
    render({ primary_emails: [make_email("a", { is_read: false })] });
    right_click_row(0);
    render({ primary_emails: [make_email("a", { is_read: true })] });
    render({ primary_emails: [] });

    expect((menu_props.current!.email as InboxEmail).is_read).toBe(true);
  });

  it("follows read changes made elsewhere while the row is not listed", () => {
    render({ primary_emails: [make_email("a", { is_read: false })] });
    right_click_row(0);
    render({ primary_emails: [] });

    act(() => {
      emit_mail_item_updated({ id: "a", is_read: true, is_starred: true });
    });

    const email = menu_props.current!.email as InboxEmail;

    expect(email.is_read).toBe(true);
    expect(email.is_starred).toBe(true);

    act(() => {
      emit_mail_item_updated({ id: "b", is_read: false });
    });

    expect((menu_props.current!.email as InboxEmail).is_read).toBe(true);
  });
});
