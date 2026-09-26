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

const muted_state = vi.hoisted(() => ({ tokens: [] as string[] }));

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
    preferences: { muted_folder_tokens: muted_state.tokens },
    update_preference: () => {},
  }),
}));

import { SidebarFolders } from "./sidebar_folders";

function folder(token: string, name: string): DecryptedFolder {
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
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_sidebar_folders(
  folders: DecryptedFolder[],
  is_collapsed = false,
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      createElement(SidebarFolders, {
        is_collapsed,
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

function row_for(name: string): HTMLButtonElement {
  const label = Array.from(document.querySelectorAll("button span")).find(
    (el) => el.textContent === name,
  );
  const row = label?.closest("button");

  if (!row) throw new Error(`row not found for ${name}`);

  return row;
}

describe("sidebar folder muted indicator", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    muted_state.tokens = [];
  });

  it("shows the muted icon only on folders with muted notifications", () => {
    muted_state.tokens = ["work"];
    render_sidebar_folders([folder("work", "Work"), folder("home", "Home")]);

    const indicator = row_for("Work").querySelector(
      "[data-testid='folder-muted-indicator']",
    );

    expect(indicator).not.toBeNull();
    expect(indicator!.getAttribute("aria-label")).toBe(
      "common.notifications_muted",
    );
    expect(indicator!.getAttribute("aria-hidden")).toBe("false");
    expect(
      row_for("Home").querySelector("[data-testid='folder-muted-indicator']"),
    ).toBeNull();
  });

  it("shows no muted icon when nothing is muted", () => {
    render_sidebar_folders([folder("work", "Work")]);

    expect(
      document.querySelectorAll("[data-testid='folder-muted-indicator']")
        .length,
    ).toBe(0);
  });

  it("hides the muted icon in the collapsed rail", () => {
    muted_state.tokens = ["work"];
    render_sidebar_folders([folder("work", "Work")], true);

    expect(
      document.querySelectorAll("[data-testid='folder-muted-indicator']")
        .length,
    ).toBe(0);
  });
});
