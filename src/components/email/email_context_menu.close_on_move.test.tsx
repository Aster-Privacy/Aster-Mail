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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

const { EmailContextMenu } =
  await import("@/components/email/email_context_menu");

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
  folders: [],
  tags: [],
} as unknown as InboxEmail;

const on_folder_toggle = vi.fn();
const on_tag_toggle = vi.fn();
const on_category_change = vi.fn();

const props = {
  email,
  categories_enabled: true,
  current_view: "inbox",
  folders: [{ id: "f-1", name: "Receipts", color: "#111111" }],
  tags: [
    { tag_token: "t-1", name: "Alpha", color: "#111111", is_assigned: false },
  ],
  on_reply: () => {},
  on_archive: () => {},
  on_delete: () => {},
  on_folder_toggle,
  on_tag_toggle,
  on_category_change,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type MenuProps = Omit<
  React.ComponentProps<typeof EmailContextMenu>,
  "children"
>;

function menu_open(): boolean {
  return document.querySelector('[role="menu"]') !== null;
}

function find_item(label: string): HTMLElement {
  const item = Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((el) => el.textContent?.includes(label));

  if (!item) throw new Error(`menu item not found: ${label}`);

  return item;
}

function open_menu(): void {
  const row = container!.querySelector("[data-row]")!;

  act(() => {
    row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      }),
    );
  });
}

function open_submenu(label: string): void {
  const trigger = find_item(label);

  act(() => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
}

function choose(label: string): void {
  const item = find_item(label);

  act(() => {
    item.focus();
    item.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

beforeEach(() => {
  on_folder_toggle.mockClear();
  on_tag_toggle.mockClear();
  on_category_change.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <EmailContextMenu {...(props as unknown as MenuProps)}>
        <div data-row="">row</div>
      </EmailContextMenu>,
    );
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("EmailContextMenu closing after a move", () => {
  it("closes the whole menu after moving to a folder", () => {
    open_menu();
    expect(menu_open()).toBe(true);

    open_submenu("mail.folder");
    choose("Receipts");

    expect(on_folder_toggle).toHaveBeenCalledWith("f-1");
    expect(menu_open()).toBe(false);
  });

  it("closes the whole menu after moving to a category", () => {
    open_menu();
    open_submenu("mail.move_to_category");

    const submenu = document.querySelectorAll('[role="menu"]');
    const target = Array.from(
      submenu[submenu.length - 1].querySelectorAll<HTMLElement>(
        '[role="menuitem"]',
      ),
    )[1];

    act(() => {
      target.focus();
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(on_category_change).toHaveBeenCalledTimes(1);
    expect(menu_open()).toBe(false);
  });

  it("keeps the menu open while toggling labels", () => {
    open_menu();
    open_submenu("common.labels");
    choose("Alpha");

    expect(on_tag_toggle).toHaveBeenCalledWith("t-1");
    expect(menu_open()).toBe(true);
  });
});
