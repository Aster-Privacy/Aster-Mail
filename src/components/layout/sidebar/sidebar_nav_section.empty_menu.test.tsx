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
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

const request_empty_folder = vi.fn();

vi.mock("@/components/email/inbox/empty_folder_request", () => ({
  request_empty_folder: (folder: string) => request_empty_folder(folder),
}));

import { SidebarNavSection } from "./sidebar_nav_section";

const BASE_STATS = {
  inbox: 4,
  unread: 2,
  drafts: 0,
  scheduled: 0,
  snoozed: 0,
  total_items: 20,
  archived: 3,
  spam: 5,
  trash: 7,
  contacts: 0,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let navigate: ReturnType<typeof vi.fn>;
let set_selected_item: ReturnType<typeof vi.fn>;

function render_nav(stats: Partial<typeof BASE_STATS> = {}) {
  act(() => {
    root!.render(
      createElement(SidebarNavSection, {
        is_collapsed: false,
        effective_selected: "inbox",
        stats: { ...BASE_STATS, ...stats },
        section_collapsed: false,
        on_toggle_section: () => {},
        handle_nav_click: (cb: () => void) => cb(),
        set_selected_item,
        navigate,
        inbox_ref: createRef(),
        sent_ref: createRef(),
        scheduled_ref: createRef(),
        snoozed_ref: createRef(),
        drafts_ref: createRef(),
        starred_ref: createRef(),
        all_mail_ref: createRef(),
        archive_ref: createRef(),
        spam_ref: createRef(),
        trash_ref: createRef(),
        contacts_ref: createRef(),
        subscriptions_ref: createRef(),
      } as unknown as Parameters<typeof SidebarNavSection>[0]),
    );
  });
}

function row(label: string): HTMLButtonElement {
  const match = Array.from(
    container!.querySelectorAll<HTMLButtonElement>("button.sidebar-nav-btn"),
  ).find((button) => button.textContent?.includes(label));

  if (!match) throw new Error(`row ${label} not found`);

  return match;
}

function right_click(label: string): void {
  act(() => {
    row(label).dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      }),
    );
  });
}

function menu_item(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '[data-testid="sidebar-empty-folder"]',
  );
}

beforeEach(() => {
  request_empty_folder.mockReset();
  navigate = vi.fn();
  set_selected_item = vi.fn();
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
  document.body.innerHTML = "";
});

describe("SidebarNavSection empty folder menu", () => {
  it("offers Empty Trash when Trash is right-clicked", () => {
    render_nav();
    right_click("mail.trash");

    const item = menu_item();

    expect(item).not.toBeNull();
    expect(item!.textContent).toContain("mail.empty_trash_button");
    expect(item!.hasAttribute("data-disabled")).toBe(false);
  });

  it("offers Empty Spam when Spam is right-clicked", () => {
    render_nav();
    right_click("mail.spam");

    expect(menu_item()?.textContent).toContain("mail.empty_spam_button");
  });

  it("keeps the browser menu on Inbox", () => {
    render_nav();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      row("mail.inbox").dispatchEvent(event);
    });

    expect(menu_item()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it("opens Trash and hands the request to the existing empty flow", () => {
    render_nav();
    right_click("mail.trash");

    act(() => {
      menu_item()!.click();
    });

    expect(set_selected_item).toHaveBeenCalledWith("trash");
    expect(navigate).toHaveBeenCalledWith("/trash");
    expect(request_empty_folder).toHaveBeenCalledWith("trash");
    expect(menu_item()).toBeNull();
  });

  it("asks to empty Spam, not Trash, from the Spam row", () => {
    render_nav();
    right_click("mail.spam");

    act(() => {
      menu_item()!.click();
    });

    expect(navigate).toHaveBeenCalledWith("/spam");
    expect(request_empty_folder).toHaveBeenCalledWith("spam");
    expect(request_empty_folder).not.toHaveBeenCalledWith("trash");
  });

  it("disables the item when the folder is already empty", () => {
    render_nav({ trash: 0 });
    right_click("mail.trash");

    const item = menu_item();

    expect(item).not.toBeNull();
    expect(item!.hasAttribute("data-disabled")).toBe(true);

    act(() => {
      item!.click();
    });

    expect(request_empty_folder).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
