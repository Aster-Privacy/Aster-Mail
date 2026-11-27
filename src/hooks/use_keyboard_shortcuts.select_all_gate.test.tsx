//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_keyboard_shortcuts } from "@/hooks/use_keyboard_shortcuts";
import { start_multi_click_selection_guard } from "@/lib/multi_click_selection";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ has_viewed_email }: { has_viewed_email: boolean }) {
  use_keyboard_shortcuts({
    is_any_modal_open: false,
    has_focused_email: true,
    has_viewed_email,
    handlers: {},
  });

  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let stop_guard: () => void = () => {};
let list_select_all_count = 0;

const count_list_select_all = () => {
  list_select_all_count += 1;
};

function mount(has_viewed_email: boolean) {
  stop_guard = start_multi_click_selection_guard();
  window.addEventListener(
    "astermail:keyboard-select-all",
    count_list_select_all,
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Harness has_viewed_email={has_viewed_email} />);
  });
}

function build_list(): HTMLElement {
  const list = document.createElement("div");

  list.setAttribute("data-list-column", "");
  list.innerHTML = `<div id="row" tabindex="0">Row</div>`;
  document.body.appendChild(list);

  return list.querySelector<HTMLElement>("#row")!;
}

function build_reader(): { header: HTMLElement; frame: HTMLIFrameElement } {
  const pane = document.createElement("div");

  pane.setAttribute("data-reading-pane", "");
  pane.innerHTML = `<header id="reader_header" tabindex="-1">Subject</header>`;
  document.body.appendChild(pane);

  const frame = document.createElement("iframe");

  frame.setAttribute("data-message-frame", "");
  pane.appendChild(frame);
  frame.contentDocument!.body.innerHTML = "<p>Message body</p>";

  return { header: pane.querySelector<HTMLElement>("#reader_header")!, frame };
}

function press_select_all(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "a",
    code: "KeyA",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

afterEach(() => {
  act(() => root?.unmount());
  stop_guard();
  window.removeEventListener(
    "astermail:keyboard-select-all",
    count_list_select_all,
  );
  host?.remove();
  document.body.innerHTML = "";
  root = null;
  host = null;
  list_select_all_count = 0;
});

describe("select all gate between list and reader", () => {
  it("keeps the list selection empty when the full page reader is open", () => {
    mount(true);
    const { header, frame } = build_reader();

    header.focus();
    const event = press_select_all(header);

    expect(event.defaultPrevented).toBe(true);
    expect(list_select_all_count).toBe(0);
    expect(frame.contentDocument!.getSelection()?.toString()).toContain(
      "Message body",
    );
  });

  it("keeps the list selection empty when focus is on the page body", () => {
    mount(true);
    build_reader();

    press_select_all(document.body);

    expect(list_select_all_count).toBe(0);
  });

  it("does not select the list while a message is open without a reader marker", () => {
    mount(true);

    press_select_all(document.body);

    expect(list_select_all_count).toBe(0);
  });

  it("selects every row when the list is the focused surface", () => {
    mount(false);
    const row = build_list();

    row.focus();
    const event = press_select_all(row);

    expect(event.defaultPrevented).toBe(true);
    expect(list_select_all_count).toBe(1);
  });

  it("selects every row from the list in split view", () => {
    mount(true);
    build_reader();
    const row = build_list();

    row.focus();
    press_select_all(row);

    expect(list_select_all_count).toBe(1);
  });

  it("selects every row when nothing is focused and no message is open", () => {
    mount(false);
    build_list();

    press_select_all(document.body);

    expect(list_select_all_count).toBe(1);
  });
});
