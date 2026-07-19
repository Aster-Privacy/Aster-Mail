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
import { describe, it, expect, afterEach, vi } from "vitest";

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

import { SidebarFolders } from "./sidebar_folders";

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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_sidebar_folders(folders: DecryptedFolder[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      createElement(SidebarFolders, {
        is_collapsed: false,
        effective_selected: null,
        folders,
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

function expand(folder_name: string) {
  const chevron = Array.from(
    document.querySelectorAll("span[role='button']"),
  ).find((el) => el.getAttribute("aria-label") === folder_name);

  if (!chevron) throw new Error(`chevron not found for ${folder_name}`);
  act(() => {
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("sidebar folder tree guides", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders no guides for root folders", () => {
    render_sidebar_folders([folder("a", "Alpha"), folder("b", "Beta")]);

    expect(document.querySelectorAll("[data-tree-guide]").length).toBe(0);
  });

  it("renders a vertical guide and elbow per depth level once expanded", () => {
    render_sidebar_folders([
      folder("root", "Root"),
      folder("child", "Child", { parent_token: "root" }),
      folder("grandchild", "Grandchild", { parent_token: "child" }),
    ]);

    expect(document.querySelectorAll("[data-tree-guide]").length).toBe(0);

    expand("Root");

    expect(
      document.querySelectorAll("[data-tree-guide='vertical']").length,
    ).toBe(1);
    expect(document.querySelectorAll("[data-tree-guide='elbow']").length).toBe(
      1,
    );

    expand("Child");

    expect(
      document.querySelectorAll("[data-tree-guide='vertical']").length,
    ).toBe(3);
    expect(document.querySelectorAll("[data-tree-guide='elbow']").length).toBe(
      2,
    );

    const grandchild_verticals = Array.from(
      document.querySelectorAll("[data-tree-guide='vertical']"),
    ).map((el) => (el as HTMLElement).style.left);

    expect(grandchild_verticals).toContain("8px");
    expect(grandchild_verticals).toContain("24px");
  });
});
