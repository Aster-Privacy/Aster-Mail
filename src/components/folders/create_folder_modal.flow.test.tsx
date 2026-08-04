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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  create_new_folder: vi.fn(async () => ({
    folder: { id: "new_id" },
    error: undefined,
    code: undefined,
  })),
  folders: [] as unknown[],
}));

vi.mock("@/hooks/use_folders", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    use_folders: () => ({
      create_new_folder: hoisted.create_new_folder,
      state: { folders: hoisted.folders, is_loading: false },
    }),
  };
});

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

import { CreateFolderModal } from "./create_folder_modal";

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

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function open_menu(el: Element) {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function find_menu_item(text: string): HTMLElement {
  const match = Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((item) => item.textContent?.includes(text));

  if (!match) throw new Error(`menu item not found: ${text}`);

  return match;
}

function select_menu_item(text: string) {
  const item = find_menu_item(text);

  act(() => {
    item.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    item.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function find_button(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );

  if (!match) throw new Error(`button not found: ${text}`);

  return match;
}

describe("CreateFolderModal parent dropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.folders = [
      folder("work", "Work", { sort_order: 0 }),
      folder("invoices", "Invoices", {
        sort_order: 0,
        parent_token: "work",
      }),
      folder("personal", "Personal", { sort_order: 1 }),
    ];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        createElement(CreateFolderModal, {
          is_open: true,
          on_close: () => {},
        }),
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

  it("lists the folder tree in the dropdown and creates under the picked parent", async () => {
    const trigger = find_button("common.top_level_no_parent");

    open_menu(trigger);

    expect(find_menu_item("Work")).toBeTruthy();
    expect(find_menu_item("Personal")).toBeTruthy();

    select_menu_item("Invoices");

    expect(document.body.textContent).toContain("common.create_subfolder");

    const input = document.querySelector(
      "input#create-folder-name",
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      setter.call(input, "Receipts");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    click(find_button("common.create_folder"));

    await act(async () => {});

    expect(hoisted.create_new_folder).toHaveBeenCalledTimes(1);

    const [name, , parent_token] = hoisted.create_new_folder.mock
      .calls[0] as unknown as [string, string, string];

    expect(name).toBe("Receipts");
    expect(parent_token).toBe("invoices");
  });

  it("creates a top-level folder when no parent is picked", async () => {
    const input = document.querySelector(
      "input#create-folder-name",
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      setter.call(input, "Travel");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const create_buttons = Array.from(
      document.querySelectorAll("button"),
    ).filter((b) => b.textContent?.trim() === "common.create_folder");

    click(create_buttons[create_buttons.length - 1]);

    await act(async () => {});

    expect(hoisted.create_new_folder).toHaveBeenCalledTimes(1);

    const [name, , parent_token] = hoisted.create_new_folder.mock
      .calls[0] as unknown as [string, string, string | undefined];

    expect(name).toBe("Travel");
    expect(parent_token).toBeUndefined();
  });

  it("clears the parent again via the none option", () => {
    open_menu(find_button("common.top_level_no_parent"));
    select_menu_item("Work");

    expect(document.body.textContent).toContain("common.create_subfolder");

    const trigger = Array.from(document.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("Work") &&
        b.querySelector("svg") &&
        !b.textContent.includes("common"),
    );

    if (!trigger) throw new Error("parent trigger not found");
    open_menu(trigger);
    select_menu_item("common.top_level_no_parent");

    expect(document.body.textContent).not.toContain("common.create_subfolder");
  });
});
