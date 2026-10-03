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
  update_existing_folder: vi.fn(async () => true),
  folders: [] as unknown[],
}));

vi.mock("@/hooks/use_folders", async (importOriginal) => {
  const original = await importOriginal<object>();

  return {
    ...original,
    use_folders: () => ({
      update_existing_folder: hoisted.update_existing_folder,
      toggle_folder_lock: vi.fn(async () => true),
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

import { FolderManagementModal } from "./folder_management_modal";

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

function find_button(text: string): HTMLButtonElement {
  const matches = Array.from(document.querySelectorAll("button")).filter(
    (b) => b.textContent?.trim() === text,
  );

  if (matches.length === 0) throw new Error(`button not found: ${text}`);

  return matches[matches.length - 1];
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function render_modal(
  target: DecryptedFolder,
  action: "move" | "rename",
): void {
  act(() => {
    root!.render(
      createElement(FolderManagementModal, {
        is_open: true,
        on_close: () => {},
        folder_id: target.id,
        folder_name: target.name,
        folder_color: "#3b82f6",
        is_locked: false,
        action,
      }),
    );
  });
}

function type_name(value: string) {
  const input = document.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const work = folder("work", "Work", { sort_order: 0 });
const work_receipts = folder("work_receipts", "receipts", {
  parent_token: "work",
});
const personal = folder("personal", "Personal", { sort_order: 1 });
const receipts = folder("receipts", "Receipts", { sort_order: 2 });
const nested_personal = folder("nested_personal", "personal", {
  parent_token: "receipts",
});
const travel = folder("travel", "Travel", {
  parent_token: "personal",
});

describe("FolderManagementModal move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.folders = [
      work,
      work_receipts,
      personal,
      receipts,
      nested_personal,
      travel,
    ];
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

  it("refuses to move a folder next to a sibling with the same name", async () => {
    render_modal(receipts, "move");

    await click(find_button("Work"));
    await click(find_button("common.move_folder"));

    expect(hoisted.update_existing_folder).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("common.folder_already_exists");
  });

  it("refuses to move a folder to the top level when a top-level folder has its name", async () => {
    render_modal(nested_personal, "move");

    await click(find_button("common.top_level_no_parent"));
    await click(find_button("common.move_folder"));

    expect(hoisted.update_existing_folder).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("common.folder_already_exists");
  });

  it("moves a folder when no sibling at the destination shares its name", async () => {
    render_modal(travel, "move");

    await click(find_button("Work"));

    expect(document.body.textContent).not.toContain(
      "common.folder_already_exists",
    );

    await click(find_button("common.move_folder"));

    expect(hoisted.update_existing_folder).toHaveBeenCalledWith(
      travel.id,
      undefined,
      undefined,
      undefined,
      "work",
    );
  });

  it("still renames a folder to a different case of its own name", async () => {
    render_modal(receipts, "rename");

    type_name("RECEIPTS");
    await click(find_button("common.rename"));

    expect(hoisted.update_existing_folder).toHaveBeenCalledWith(
      receipts.id,
      "RECEIPTS",
    );
  });

  it("still rejects renaming a folder to a sibling's name", async () => {
    render_modal(receipts, "rename");

    type_name("work");
    await click(find_button("common.rename"));

    expect(hoisted.update_existing_folder).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("common.folder_already_exists");
  });
});
