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
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LONG_LABEL = "Forward as attachment";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_open_menu(): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <DropdownMenu open>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem>
            <svg />
            {LONG_LABEL}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <>
              <svg />
              {LONG_LABEL}
            </>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
  });

  const content = document.body.querySelector<HTMLElement>('[role="menu"]');

  expect(content).not.toBeNull();

  return content!;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("menu items stay on one line", () => {
  it("sizes the menu to its content and caps it at the viewport", async () => {
    const content = await render_open_menu();

    expect(content.className).toContain("min-w-52");
    expect(content.className).not.toMatch(/(^|\s)w-\d+/);
    expect(content.className).toContain(
      "max-w-[min(var(--radix-dropdown-menu-content-available-width,100vw),calc(100vw_-_1rem))]",
    );
  });

  it("keeps each label on one line with an ellipsis", async () => {
    const content = await render_open_menu();
    const items = content.querySelectorAll('[role="menuitem"]');

    expect(items).toHaveLength(2);
    for (const item of items) {
      const label = item.querySelector("span");

      expect(label?.textContent).toBe(LONG_LABEL);
      expect(label?.classList.contains("truncate")).toBe(true);
      expect(label?.classList.contains("min-w-0")).toBe(true);
      expect(item.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    }
  });

  it("shows the full label as a title only when it is cut off", async () => {
    const content = await render_open_menu();
    const label = content.querySelector<HTMLElement>('[role="menuitem"] span')!;

    Object.defineProperty(label, "clientWidth", { value: 80 });
    Object.defineProperty(label, "scrollWidth", {
      configurable: true,
      value: 160,
    });
    act(() => {
      label.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    expect(label.getAttribute("title")).toBe(LONG_LABEL);

    Object.defineProperty(label, "scrollWidth", { value: 80 });
    act(() => {
      label.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
      label.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    expect(label.hasAttribute("title")).toBe(false);
  });
});
