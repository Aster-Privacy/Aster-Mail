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

const hoisted = vi.hoisted(() => ({
  show_toast: vi.fn(),
}));

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

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => hoisted.show_toast(...args),
}));

import { SidebarFolders } from "./sidebar_folders";

function folder(
  token: string,
  name: string,
  sort_order: number,
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
    sort_order,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_sidebar_folders(
  folders: DecryptedFolder[],
  sort_folders_a_z?: () => Promise<boolean>,
) {
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
        sort_folders_a_z,
      }),
    );
  });
}

function sort_button() {
  return document.querySelector("[data-testid='folders-sort-a-to-z']");
}

describe("sidebar folders sort A to Z", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    hoisted.show_toast.mockClear();
  });

  it("offers the sort button when folders are out of order", async () => {
    const sort = vi.fn(async () => true);

    render_sidebar_folders(
      [folder("b", "Bravo", 0), folder("a", "Alpha", 1)],
      sort,
    );

    expect(sort_button()).not.toBeNull();
    expect(sort_button()?.getAttribute("aria-label")).toBe(
      "common.sort_a_to_z",
    );

    await act(async () => {
      sort_button()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(sort).toHaveBeenCalledTimes(1);
    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.folders_sorted_a_to_z",
      "success",
    );
  });

  it("shows an error when sorting fails", async () => {
    render_sidebar_folders(
      [folder("b", "Bravo", 0), folder("a", "Alpha", 1)],
      async () => false,
    );

    await act(async () => {
      sort_button()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong_try_again",
      "error",
    );
  });

  it("hides the sort button when folders are already A to Z", () => {
    render_sidebar_folders(
      [folder("a", "Alpha", 0), folder("b", "Bravo", 1)],
      async () => true,
    );

    expect(sort_button()).toBeNull();
  });

  it("hides the sort button for a single folder", () => {
    render_sidebar_folders([folder("a", "Alpha", 0)], async () => true);

    expect(sort_button()).toBeNull();
  });
});
