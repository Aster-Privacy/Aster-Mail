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
import type { DecryptedFolder } from "@/hooks/use_folders";

import { act, createElement } from "react";
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

vi.mock("@/hooks/use_protected_folder", () => ({
  is_folder_unlocked: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { muted_folder_tokens: [] },
    update_preference: () => {},
  }),
}));

vi.mock("@/components/ui/context_menu", async () => {
  const { createElement: h } = await import("react");

  return {
    ContextMenu: ({ children }: { children?: unknown }) =>
      h("div", { "data-folder-menu": "" }, children as never),
    ContextMenuTrigger: ({ children }: { children?: unknown }) => children,
    ContextMenuContent: ({ children }: { children?: unknown }) =>
      h("div", { "data-menu-content": "" }, children as never),
    ContextMenuItem: ({
      children,
      onClick,
      disabled,
      ...rest
    }: {
      children?: unknown;
      onClick?: () => void;
      disabled?: boolean;
    }) =>
      h(
        "button",
        { ...rest, type: "button", disabled, onClick },
        children as never,
      ),
    ContextMenuSeparator: () => h("hr"),
  };
});

import { SidebarFolders } from "./sidebar_folders";

import {
  clear_expanded_folders,
  get_expanded_folders,
  set_expanded_folders,
} from "@/services/expanded_folders_store";

function folder(
  token: string,
  name: string,
  overrides: Partial<DecryptedFolder> = {},
): DecryptedFolder {
  return {
    id: `id_${token}`,
    folder_token: token,
    name,
    is_system: false,
    is_locked: false,
    folder_type: "custom",
    is_password_protected: false,
    password_set: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const TREE = [
  folder("news", "Newsletters"),
  folder("tech", "Tech", { parent_token: "news" }),
  folder("rust", "Rust", { parent_token: "tech" }),
  folder("work", "Work", { sort_order: 1 }),
];

const STORAGE_KEY = "aster:expanded_folders:acct_a";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_sidebar_folders(account_id: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      createElement(SidebarFolders, {
        account_id,
        is_collapsed: false,
        effective_selected: null,
        folders: TREE,
        folders_expanded: true,
        set_folders_expanded: () => {},
        is_loading: false,
        handle_nav_click: (cb: () => void) => cb(),
        set_selected_item: () => {},
        navigate: () => {},
        set_is_create_folder_open: () => {},
        handle_folder_modal: () => {},
        handle_folder_lock: () => {},
        set_password_modal_folder: () => {},
        folder_refs: { current: {} } as never,
      }),
    );
  });
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
}

function row_for(name: string): Element {
  const row = Array.from(document.querySelectorAll("[data-folder-menu]")).find(
    (el) =>
      Array.from(el.children)
        .find((c) => !c.hasAttribute("data-menu-content"))
        ?.textContent?.includes(name),
  );

  if (!row) throw new Error(`row not found for ${name}`);

  return row;
}

function is_visible(name: string): boolean {
  return Array.from(document.querySelectorAll("[data-folder-menu]")).some(
    (el) =>
      Array.from(el.children)
        .find((c) => !c.hasAttribute("data-menu-content"))
        ?.textContent?.includes(name),
  );
}

function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not found");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function toggle_chevron(name: string) {
  click(row_for(name).querySelector("span[role='button']"));
}

function menu_item(name: string, test_id: string): Element | null {
  return row_for(name).querySelector(
    `[data-menu-content] [data-testid='${test_id}']`,
  );
}

describe("sidebar folder expansion state", () => {
  beforeEach(() => {
    localStorage.clear();
    clear_expanded_folders("acct_a");
    clear_expanded_folders("acct_b");
  });

  afterEach(() => {
    unmount();
  });

  it("restores expanded folders saved from an earlier session", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["news"]));
    render_sidebar_folders("acct_a");

    expect(is_visible("Tech")).toBe(true);
    expect(is_visible("Rust")).toBe(false);
  });

  it("keeps an expanded folder open after the sidebar remounts", () => {
    render_sidebar_folders("acct_a");
    expect(is_visible("Tech")).toBe(false);

    toggle_chevron("Newsletters");
    expect(is_visible("Tech")).toBe(true);
    unmount();

    render_sidebar_folders("acct_a");
    expect(is_visible("Tech")).toBe(true);
  });

  it("stores only opaque folder tokens, never folder names", () => {
    render_sidebar_folders("acct_a");
    toggle_chevron("Newsletters");

    const stored = localStorage.getItem(STORAGE_KEY);

    expect(stored).toBe(JSON.stringify(["news"]));
    expect(stored).not.toContain("Newsletters");
  });

  it("keeps expansion separate for each account", () => {
    render_sidebar_folders("acct_a");
    toggle_chevron("Newsletters");
    unmount();

    render_sidebar_folders("acct_b");

    expect(is_visible("Tech")).toBe(false);
  });

  it("expands and collapses a whole subtree from the folder menu", () => {
    render_sidebar_folders("acct_a");

    click(menu_item("Newsletters", "folder-menu-expand-all"));
    expect(is_visible("Tech")).toBe(true);
    expect(is_visible("Rust")).toBe(true);
    expect([...get_expanded_folders("acct_a")].sort()).toEqual([
      "news",
      "tech",
    ]);

    click(menu_item("Newsletters", "folder-menu-collapse-all"));
    expect(is_visible("Tech")).toBe(false);
    expect(get_expanded_folders("acct_a").size).toBe(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("reopens nested folders when their parent is expanded again", () => {
    render_sidebar_folders("acct_a");
    click(menu_item("Newsletters", "folder-menu-expand-all"));

    toggle_chevron("Newsletters");
    expect(is_visible("Tech")).toBe(false);

    toggle_chevron("Newsletters");
    expect(is_visible("Rust")).toBe(true);
  });

  it("shows expand and collapse all only on folders with subfolders", () => {
    render_sidebar_folders("acct_a");

    expect(menu_item("Work", "folder-menu-expand-all")).toBeNull();
    expect(menu_item("Work", "folder-menu-collapse-all")).toBeNull();
    expect(menu_item("Newsletters", "folder-menu-expand-all")).not.toBeNull();
    expect(menu_item("Newsletters", "folder-menu-collapse-all")).not.toBeNull();
  });

  it("ignores corrupted or hostile stored values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["news", { x: 1 }, "<img src=x>", 7]),
    );

    expect([...get_expanded_folders("acct_a")]).toEqual(["news"]);

    clear_expanded_folders("acct_a");
    localStorage.setItem(STORAGE_KEY, "not json");

    expect(get_expanded_folders("acct_a").size).toBe(0);
  });

  it("caps the number of stored folders", () => {
    set_expanded_folders(
      "acct_a",
      new Set(Array.from({ length: 600 }, (_, i) => `t${i}`)),
    );

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");

    expect(stored).toHaveLength(500);
    expect(stored).toContain("t599");
  });

  it("forgets expansion when the account is removed", () => {
    render_sidebar_folders("acct_a");
    toggle_chevron("Newsletters");

    act(() => {
      clear_expanded_folders("acct_a");
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(is_visible("Tech")).toBe(false);
  });
});
