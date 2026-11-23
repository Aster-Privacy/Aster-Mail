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

interface HarnessProps {
  on_close_viewer: () => void;
  has_viewed_email?: boolean;
  is_any_modal_open?: boolean;
}

function Harness({
  on_close_viewer,
  has_viewed_email = true,
  is_any_modal_open = false,
}: HarnessProps) {
  use_keyboard_shortcuts({
    is_any_modal_open,
    has_focused_email: has_viewed_email,
    has_viewed_email,
    handlers: { on_close_viewer },
  });

  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const extra_nodes: Element[] = [];

function mount(props: HarnessProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Harness {...props} />);
  });
}

function press(key: string, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

function add_node(node: Element) {
  document.body.appendChild(node);
  extra_nodes.push(node);
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  for (const node of extra_nodes.splice(0)) node.remove();
});

describe("Escape returns to the list from an open email", () => {
  it("closes the viewer on Escape", () => {
    const on_close_viewer = vi.fn();

    mount({ on_close_viewer });

    const event = press("Escape");

    expect(on_close_viewer).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("closes the viewer on u", () => {
    const on_close_viewer = vi.fn();

    mount({ on_close_viewer });

    press("u");

    expect(on_close_viewer).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no email is open", () => {
    const on_close_viewer = vi.fn();

    mount({ on_close_viewer, has_viewed_email: false });

    const event = press("Escape");

    expect(on_close_viewer).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Escape to an open composer or modal", () => {
    const on_close_viewer = vi.fn();

    mount({ on_close_viewer, is_any_modal_open: true });

    press("Escape");

    expect(on_close_viewer).not.toHaveBeenCalled();
  });

  it("leaves Escape to an open dialog", () => {
    const on_close_viewer = vi.fn();
    const dialog = document.createElement("div");

    dialog.setAttribute("role", "alertdialog");
    add_node(dialog);
    mount({ on_close_viewer });

    const event = press("Escape");

    expect(on_close_viewer).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Escape to an open menu", () => {
    const on_close_viewer = vi.fn();
    const menu = document.createElement("div");
    const item = document.createElement("button");

    menu.setAttribute("role", "menu");
    menu.appendChild(item);
    add_node(menu);
    mount({ on_close_viewer });
    item.focus();

    press("Escape", item);

    expect(on_close_viewer).not.toHaveBeenCalled();
  });

  it("leaves Escape to a focused text field", () => {
    const on_close_viewer = vi.fn();
    const input = document.createElement("input");

    add_node(input);
    mount({ on_close_viewer });
    input.focus();

    press("Escape", input);

    expect(on_close_viewer).not.toHaveBeenCalled();
  });

  it("leaves Escape alone once another layer has handled it", () => {
    const on_close_viewer = vi.fn();
    const claim = (e: KeyboardEvent) => e.preventDefault();

    document.addEventListener("keydown", claim);
    mount({ on_close_viewer });

    press("Escape");
    document.removeEventListener("keydown", claim);

    expect(on_close_viewer).not.toHaveBeenCalled();
  });
});
