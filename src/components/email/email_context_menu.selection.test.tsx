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
import type { ContextMenuSelectionScope } from "@/components/email/email_context_menu";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@/components/ui/context_menu", () => {
  const passthrough = () =>
    function Passthrough({ children }: { children?: unknown }) {
      return <div>{children as never}</div>;
    };

  return {
    ContextMenu: passthrough(),
    ContextMenuTrigger: passthrough(),
    ContextMenuContent: passthrough(),
    ContextMenuLabel: passthrough(),
    ContextMenuSeparator: () => <hr />,
    ContextMenuSub: passthrough(),
    ContextMenuSubContent: passthrough(),
    ContextMenuSubTrigger: passthrough(),
    ContextMenuItem: ({
      children,
      onClick,
      onSelect,
    }: {
      children?: unknown;
      onClick?: () => void;
      onSelect?: (e: { preventDefault: () => void }) => void;
    }) => (
      <button
        onClick={() => {
          onClick?.();
          onSelect?.({ preventDefault: () => {} });
        }}
      >
        {children as never}
      </button>
    ),
  };
});

const { EmailContextMenuContent } = await import(
  "@/components/email/email_context_menu"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const email = {
  id: "a",
  sender_name: "Sender",
  sender_email: "a@example.com",
  subject: "Subject",
  preview: "preview",
  timestamp: "10:00",
  is_read: true,
  is_selected: true,
  folders: [],
  tags: [],
} as unknown as InboxEmail;

const base_props = {
  email,
  categories_enabled: true,
  current_view: "inbox",
  folders: [{ id: "f-1", name: "One", color: "#111111" }],
  tags: [
    { tag_token: "t-1", name: "Alpha", color: "#111111", is_assigned: false },
  ],
  on_reply: () => {},
  on_reply_all: () => {},
  on_forward: () => {},
  on_toggle_read: () => {},
  on_toggle_pin: () => {},
  on_snooze: async () => {},
  on_custom_snooze: () => {},
  on_archive: () => {},
  on_spam: () => {},
  on_delete: () => {},
  on_folder_toggle: () => {},
  on_tag_toggle: () => {},
  on_move_to_inbox: () => {},
  on_restore: () => {},
  on_mark_not_spam: () => {},
  on_category_change: () => {},
  on_find_from_sender: () => {},
  on_open_in_new_window: () => {},
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type MenuProps = React.ComponentProps<typeof EmailContextMenuContent>;

function render(props: Record<string, unknown>): void {
  act(() => {
    root!.render(
      <EmailContextMenuContent
        {...({ ...base_props, ...props } as unknown as MenuProps)}
      />,
    );
  });
}

function text(): string {
  return container!.textContent ?? "";
}

beforeEach(() => {
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

describe("EmailContextMenuContent selection scope", () => {
  const selection: ContextMenuSelectionScope = {
    count: 3,
    is_all_mode: false,
    has_unread: true,
    has_read: true,
  };

  it("keeps single-message items when there is no selection", () => {
    render({});

    expect(text()).toContain("mail.reply");
    expect(text()).toContain("mail.forward");
    expect(text()).toContain("mail.pin_to_top");
    expect(text()).not.toContain("mail.menu_applies_to");
  });

  it("shows the scope header and hides single-message items", () => {
    render({
      selection,
      on_mark_read: () => {},
      on_mark_unread: () => {},
    });

    expect(text()).toContain("mail.menu_applies_to_selection:3");
    expect(text()).not.toContain("mail.reply");
    expect(text()).not.toContain("mail.forward");
    expect(text()).not.toContain("mail.pin_to_top");
    expect(text()).not.toContain("mail.find_emails_from");
    expect(text()).toContain("mail.mark_as_read");
    expect(text()).toContain("mail.mark_as_unread");
    expect(text()).toContain("mail.archive");
    expect(text()).toContain("mail.snooze");
    expect(text()).toContain("mail.folder");
    expect(text()).toContain("mail.move_to_category");
  });

  it("offers only the read state the selection actually has", () => {
    render({
      selection: { ...selection, has_read: false },
      on_mark_read: () => {},
      on_mark_unread: () => {},
    });

    expect(text()).toContain("mail.mark_as_read");
    expect(text()).not.toContain("mail.mark_as_unread");
  });

  it("hides actions without a server scope when select-all mode is active", () => {
    render({
      selection: { ...selection, count: 20000, is_all_mode: true },
      on_mark_read: () => {},
      on_mark_unread: () => {},
    });

    expect(text()).toContain("mail.menu_applies_to_all:20,000");
    expect(text()).not.toContain("mail.snooze");
    expect(text()).not.toContain("mail.folder");
    expect(text()).not.toContain("common.labels");
    expect(text()).not.toContain("mail.move_to_category");
    expect(text()).toContain("mail.archive");
    expect(text()).toContain("mail.mark_as_read");
  });

  it("checks folders that every selected message already has", () => {
    render({
      selection,
      folders: [
        { id: "f-1", name: "One", color: "#111111", is_assigned: true },
        { id: "f-2", name: "Two", color: "#222222", is_assigned: false },
      ],
    });

    const rows = Array.from(container!.querySelectorAll("button")).filter(
      (button) => button.textContent?.includes("One"),
    );

    expect(rows[0].querySelector("svg")).not.toBeNull();

    const other = Array.from(container!.querySelectorAll("button")).filter(
      (button) => button.textContent?.includes("Two"),
    );

    expect(other[0].querySelector("svg")).toBeNull();
  });

  it("routes a selection action to its handler", async () => {
    const on_archive = vi.fn();

    render({ selection, on_archive });

    const archive = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent === "mail.archive",
    );

    await act(async () => {
      archive!.click();
    });

    expect(on_archive).toHaveBeenCalledTimes(1);
  });
});
