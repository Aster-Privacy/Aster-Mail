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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Handlers = Parameters<typeof use_keyboard_shortcuts>[0]["handlers"];

function Harness({ handlers }: { handlers: Handlers }) {
  use_keyboard_shortcuts({
    is_any_modal_open: false,
    has_focused_email: true,
    has_viewed_email: true,
    handlers,
  });

  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(handlers: Handlers) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Harness handlers={handlers} />);
  });
}

function press(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  root = null;
  host = null;
});

describe("use_keyboard_shortcuts menus and layouts", () => {
  it("leaves keys to an open menu", () => {
    const on_toggle_star = vi.fn();
    const on_archive = vi.fn();

    mount({ on_toggle_star, on_archive });

    const menu = document.createElement("div");
    const item = document.createElement("div");

    menu.setAttribute("role", "menu");
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    menu.appendChild(item);
    document.body.appendChild(menu);
    item.focus();

    press({ key: "s", code: "KeyS" });
    press({ key: "e", code: "KeyE" });

    expect(on_toggle_star).not.toHaveBeenCalled();
    expect(on_archive).not.toHaveBeenCalled();
  });

  it("opens search for a slash typed with Shift", () => {
    const on_search = vi.fn();
    const on_show_shortcuts = vi.fn();

    mount({ on_search, on_show_shortcuts });
    press({ key: "/", code: "Digit7", shiftKey: true });

    expect(on_search).toHaveBeenCalledTimes(1);
    expect(on_show_shortcuts).not.toHaveBeenCalled();
  });

  it("does not open search for a hyphen on the slash key", () => {
    const on_search = vi.fn();

    mount({ on_search });
    press({ key: "-", code: "Slash" });

    expect(on_search).not.toHaveBeenCalled();
  });

  it("marks spam for an exclamation mark on the slash key", () => {
    const on_spam = vi.fn();
    const on_search = vi.fn();

    mount({ on_spam, on_search });
    press({ key: "!", code: "Slash" });

    expect(on_spam).toHaveBeenCalledTimes(1);
    expect(on_search).not.toHaveBeenCalled();
  });

  it("ignores a shifted digit that types a digit", () => {
    const on_delete = vi.fn();
    const on_spam = vi.fn();

    mount({ on_delete, on_spam });
    press({ key: "3", code: "Digit3", shiftKey: true });
    press({ key: "1", code: "Digit1", shiftKey: true });

    expect(on_delete).not.toHaveBeenCalled();
    expect(on_spam).not.toHaveBeenCalled();
  });

  it("keeps the standard shortcuts working", () => {
    const on_show_shortcuts = vi.fn();
    const on_delete = vi.fn();
    const on_search = vi.fn();

    mount({ on_show_shortcuts, on_delete, on_search });
    press({ key: "?", code: "Slash", shiftKey: true });
    press({ key: "#", code: "Digit3", shiftKey: true });
    press({ key: "/", code: "Slash" });

    expect(on_show_shortcuts).toHaveBeenCalledTimes(1);
    expect(on_delete).toHaveBeenCalledTimes(1);
    expect(on_search).toHaveBeenCalledTimes(1);
  });
});
