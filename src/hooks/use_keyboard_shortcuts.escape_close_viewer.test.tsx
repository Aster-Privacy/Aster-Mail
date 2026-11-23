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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_keyboard_shortcuts } from "@/hooks/use_keyboard_shortcuts";
import { KEYBOARD_SHORTCUTS } from "@/constants/keyboard_shortcuts";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ on_close_viewer }: { on_close_viewer: () => void }) {
  use_keyboard_shortcuts({
    is_any_modal_open: false,
    has_focused_email: true,
    has_viewed_email: true,
    handlers: { on_close_viewer },
  });

  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(on_close_viewer: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Harness on_close_viewer={on_close_viewer} />);
  });
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("escape keeps the opened email open", () => {
  it("does not close the viewer on Escape", () => {
    const on_close_viewer = vi.fn();

    mount(on_close_viewer);

    press("Escape");

    expect(on_close_viewer).not.toHaveBeenCalled();
  });

  it("still closes the viewer on u", () => {
    const on_close_viewer = vi.fn();

    mount(on_close_viewer);

    press("u");

    expect(on_close_viewer).toHaveBeenCalledTimes(1);
  });

  it("no longer advertises Escape as a way to close the viewer", () => {
    const escape_entries = KEYBOARD_SHORTCUTS.filter(
      (shortcut) => shortcut.key === "Escape",
    );

    expect(escape_entries).toEqual([]);
  });
});
