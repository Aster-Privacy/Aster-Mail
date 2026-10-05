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
import type { ReactNode } from "react";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n", () => ({
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/context_menu", () => {
  const pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    ContextMenu: pass,
    ContextMenuContent: pass,
    ContextMenuTrigger: pass,
    ContextMenuSeparator: () => null,
    ContextMenuItem: ({
      children,
      onClick,
    }: {
      children?: ReactNode;
      onClick?: () => void;
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  };
});

import { TagContextMenu } from "@/components/tags/tag_context_menu";

describe("TagContextMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  function item(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === label,
    );
  }

  async function render_menu(on_rename?: () => void): Promise<void> {
    await act(async () => {
      root.render(
        <TagContextMenu
          on_delete={() => {}}
          on_move={() => {}}
          on_recolor={() => {}}
          on_reicon={() => {}}
          on_rename={on_rename}
          tag_color="#3b82f6"
        >
          <span>label</span>
        </TagContextMenu>,
      );
    });
  }

  beforeEach(async () => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers rename when a rename action is given", async () => {
    const on_rename = vi.fn();

    await render_menu(on_rename);
    await act(async () => {
      item("common.rename")?.click();
    });

    expect(on_rename).toHaveBeenCalledTimes(1);
  });

  it("hides rename and keeps the other actions when no rename action is given", async () => {
    await render_menu();

    expect(item("common.rename")).toBeUndefined();
    expect(item("common.change_color")).toBeDefined();
    expect(item("common.change_icon")).toBeDefined();
    expect(item("common.move_label")).toBeDefined();
    expect(item("common.delete")).toBeDefined();
  });
});
