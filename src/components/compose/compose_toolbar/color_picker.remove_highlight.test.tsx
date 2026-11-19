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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ColorPickerPopover } from "./color_picker";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

describe("color picker highlight removal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 136,
      left: 100,
      right: 136,
      width: 36,
      height: 36,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function find_button(label: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label,
    );
  }

  function open_highlight_mode(): void {
    const trigger = container.querySelector(
      "button[aria-haspopup='dialog']",
    ) as HTMLButtonElement;

    act(() => trigger.click());
    act(() => find_button("mail.highlight_color")!.click());
  }

  it("lets you remove a highlight", () => {
    const on_bg_color_remove = vi.fn();
    const on_bg_color_change = vi.fn();

    act(() =>
      root.render(
        <ColorPickerPopover
          bg_color="#ffff00"
          font_color="#000000"
          on_bg_color_change={on_bg_color_change}
          on_bg_color_remove={on_bg_color_remove}
          on_font_color_change={vi.fn()}
        />,
      ),
    );
    open_highlight_mode();

    const remove = find_button("mail.remove_highlight");

    expect(remove).toBeDefined();
    act(() => remove!.click());

    expect(on_bg_color_remove).toHaveBeenCalledTimes(1);
    expect(on_bg_color_change).not.toHaveBeenCalled();
    expect(find_button("mail.remove_highlight")).toBeUndefined();
  });

  it("does not offer removal for the text color", () => {
    act(() =>
      root.render(
        <ColorPickerPopover
          bg_color=""
          font_color="#000000"
          on_bg_color_change={vi.fn()}
          on_bg_color_remove={vi.fn()}
          on_font_color_change={vi.fn()}
        />,
      ),
    );
    const trigger = container.querySelector(
      "button[aria-haspopup='dialog']",
    ) as HTMLButtonElement;

    act(() => trigger.click());

    expect(find_button("mail.font_color")).toBeDefined();
    expect(find_button("mail.remove_highlight")).toBeUndefined();
  });
});
