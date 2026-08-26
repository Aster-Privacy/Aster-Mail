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

const { avatar_renders } = vi.hoisted(() => ({
  avatar_renders: new Map<string, number>(),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: ({ email }: { email?: string }) => {
    const key = email ?? "";

    avatar_renders.set(key, (avatar_renders.get(key) ?? 0) + 1);

    return null;
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({ children }: { children?: unknown }) => (
    <button>{children as never}</button>
  ),
  Tooltip: ({ children }: { children?: unknown }) => children as never,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@example.com" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
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

vi.mock("@/components/email/email_context_menu", () => ({
  EmailContextMenuContent: () => null,
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
    folders: [{ folder_token: `folder-${id}`, name: `Folder ${id}` }],
    tags: [],
    ...overrides,
  } as unknown as InboxEmail;
}

const noop = () => {};
const async_noop = async () => {};

function list_props(emails: InboxEmail[]) {
  return {
    pinned_emails: [] as InboxEmail[],
    primary_emails: emails,
    density: "Default",
    show_profile_pictures: true,
    show_email_preview: true,
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
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(emails: InboxEmail[]): void {
  act(() => {
    root!.render(<EmailList {...list_props(emails)} />);
  });
}

beforeEach(() => {
  avatar_renders.clear();
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

describe("EmailList row render churn", () => {
  it("re-renders only the rows whose email changed when selection changes", () => {
    const a = make_email("a");
    const b = make_email("b");
    const c = make_email("c");

    render([a, b, c]);

    expect(avatar_renders.get("a@example.com")).toBe(1);
    expect(avatar_renders.get("b@example.com")).toBe(1);
    expect(avatar_renders.get("c@example.com")).toBe(1);

    render([a, { ...b, is_selected: true } as InboxEmail, c]);

    expect(avatar_renders.get("a@example.com")).toBe(1);
    expect(avatar_renders.get("b@example.com")).toBe(2);
    expect(avatar_renders.get("c@example.com")).toBe(1);
  });

  it("keeps rows stable when an unrelated list re-render happens", () => {
    const emails = ["a", "b", "c"].map((id) => make_email(id));

    render(emails);
    render([...emails]);

    for (const id of ["a", "b", "c"]) {
      expect(avatar_renders.get(`${id}@example.com`)).toBe(1);
    }
  });
});

describe("EmailList drag payload", () => {
  function drag_row(index: number) {
    const rows = container!.querySelectorAll('div[role="button"][draggable]');
    const data: Record<string, string> = {};
    const event = new Event("dragstart", { bubbles: true });

    Object.defineProperty(event, "dataTransfer", {
      value: {
        setData: (type: string, value: string) => {
          data[type] = value;
        },
        setDragImage: () => {},
        effectAllowed: "",
      },
    });

    act(() => {
      rows[index].dispatchEvent(event);
    });

    return data;
  }

  it("drags the whole selection from a selected row", () => {
    const emails = [
      make_email("a", { is_selected: true }),
      make_email("b", { is_selected: true }),
      make_email("c"),
    ];

    render(emails);

    const data = drag_row(0);

    expect(JSON.parse(data["application/x-astermail-emails"])).toEqual([
      "a",
      "b",
    ]);
    expect(JSON.parse(data["application/x-astermail-folders"])).toEqual([]);
  });

  it("reports only the folders every selected row shares", () => {
    const emails = [
      make_email("a", {
        is_selected: true,
        folders: [
          { folder_token: "folder-shared", name: "Shared" },
          { folder_token: "folder-a", name: "Folder a" },
        ],
      } as Partial<InboxEmail>),
      make_email("b", {
        is_selected: true,
        folders: [
          { folder_token: "folder-shared", name: "Shared" },
          { folder_token: "folder-b", name: "Folder b" },
        ],
      } as Partial<InboxEmail>),
    ];

    render(emails);

    const data = drag_row(0);

    expect(JSON.parse(data["application/x-astermail-folders"])).toEqual([
      "folder-shared",
    ]);
  });

  it("drags only the row under the cursor when it is not selected", () => {
    const emails = [
      make_email("a", { is_selected: true }),
      make_email("b", { is_selected: true }),
      make_email("c"),
    ];

    render(emails);

    const data = drag_row(2);

    expect(JSON.parse(data["application/x-astermail-emails"])).toEqual(["c"]);
    expect(JSON.parse(data["application/x-astermail-folders"])).toEqual([
      "folder-c",
    ]);
  });

  it("expands grouped conversations for a single-row drag", () => {
    const emails = [
      make_email("a", {
        grouped_email_ids: ["a", "a2", "a3"],
      } as Partial<InboxEmail>),
    ];

    render(emails);

    const data = drag_row(0);

    expect(JSON.parse(data["application/x-astermail-emails"])).toEqual([
      "a",
      "a2",
      "a3",
    ]);
  });

  it("expands grouped conversations across a multi-row drag", () => {
    const emails = [
      make_email("a", {
        is_selected: true,
        grouped_email_ids: ["a", "a2"],
      } as Partial<InboxEmail>),
      make_email("b", { is_selected: true }),
    ];

    render(emails);

    const data = drag_row(0);

    expect(JSON.parse(data["application/x-astermail-emails"])).toEqual([
      "a",
      "a2",
      "b",
    ]);
  });

  it("sees a selection made after the last row render", () => {
    const a = make_email("a", { is_selected: true });
    const b = make_email("b");

    render([a, b]);
    render([a, { ...b, is_selected: true } as InboxEmail]);

    const data = drag_row(0);

    expect(JSON.parse(data["application/x-astermail-emails"])).toEqual([
      "a",
      "b",
    ]);
  });
});
