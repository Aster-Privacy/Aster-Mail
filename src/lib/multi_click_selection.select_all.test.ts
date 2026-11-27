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

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  find_active_message_frame,
  note_message_frame_activity,
  start_multi_click_selection_guard,
} from "./multi_click_selection";

let stop_guard: () => void = () => {};

function add_frame(parent: Element, text: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");

  frame.setAttribute("data-message-frame", "");
  parent.appendChild(frame);

  const frame_doc = frame.contentDocument!;

  frame_doc.body.innerHTML = `<p>${text}</p>`;

  return frame;
}

function build_reader(): {
  pane: HTMLElement;
  first: HTMLIFrameElement;
  second: HTMLIFrameElement;
  first_header: HTMLElement;
  second_header: HTMLElement;
} {
  const pane = document.createElement("div");

  pane.setAttribute("data-reading-pane", "");
  pane.innerHTML = `
    <input id="reader_search" />
    <div data-compose-editor contenteditable="true" id="inline_reply">Draft</div>
    <article id="msg_one"><header id="header_one" tabindex="-1">Ada</header></article>
    <article id="msg_two"><header id="header_two" tabindex="-1">Grace</header></article>
  `;
  document.body.appendChild(pane);

  const first = add_frame(pane.querySelector("#msg_one")!, "First body");
  const second = add_frame(pane.querySelector("#msg_two")!, "Second body");

  return {
    pane,
    first,
    second,
    first_header: pane.querySelector("#header_one")!,
    second_header: pane.querySelector("#header_two")!,
  };
}

function press_select_all(target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "a",
    code: "KeyA",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });

  target.dispatchEvent(event);

  return event;
}

function selected_text(frame: HTMLIFrameElement): string {
  return frame.contentDocument!.getSelection()?.toString() ?? "";
}

beforeEach(() => {
  stop_guard = start_multi_click_selection_guard();
});

afterEach(() => {
  stop_guard();
  document.body.innerHTML = "";
});

describe("reading pane select all", () => {
  it("selects the body of the message that was clicked last", () => {
    const { first, second, second_header } = build_reader();

    second_header.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const event = press_select_all(second_header);

    expect(event.defaultPrevented).toBe(true);
    expect(selected_text(second)).toContain("Second body");
    expect(selected_text(first)).toBe("");
  });

  it("follows focus to another message", () => {
    const { first, first_header } = build_reader();

    first_header.focus();
    press_select_all(first_header);

    expect(selected_text(first)).toContain("First body");
  });

  it("uses the frame that saw activity inside it", () => {
    const { first, second } = build_reader();

    note_message_frame_activity(first);
    press_select_all();

    expect(find_active_message_frame()).toBe(first);
    expect(selected_text(first)).toContain("First body");
    expect(selected_text(second)).toBe("");
  });

  it("selects the only message when nothing was focused", () => {
    const pane = document.createElement("div");

    pane.setAttribute("data-reading-pane", "");
    document.body.appendChild(pane);
    const only = add_frame(pane, "Only body");

    const event = press_select_all();

    expect(event.defaultPrevented).toBe(true);
    expect(selected_text(only)).toContain("Only body");
  });

  it("never selects the whole page", () => {
    const { first_header } = build_reader();

    first_header.focus();
    press_select_all(first_header);

    expect(document.getSelection()?.toString() ?? "").toBe("");
  });

  it("leaves inputs to native select all", () => {
    const { pane, first, second } = build_reader();
    const input = pane.querySelector<HTMLInputElement>("#reader_search")!;

    input.focus();
    const event = press_select_all(input);

    expect(event.defaultPrevented).toBe(false);
    expect(selected_text(first)).toBe("");
    expect(selected_text(second)).toBe("");
  });

  it("leaves compose editors to native select all", () => {
    const { pane, second } = build_reader();
    const editor = pane.querySelector<HTMLElement>("#inline_reply")!;

    editor.focus();
    const event = press_select_all(editor);

    expect(event.defaultPrevented).toBe(false);
    expect(selected_text(second)).toBe("");
  });

  it("leaves settings fields in a dialog alone", () => {
    build_reader();
    const dialog = document.createElement("div");

    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `<textarea id="signature">Thanks</textarea>`;
    document.body.appendChild(dialog);
    const field = dialog.querySelector<HTMLTextAreaElement>("#signature")!;

    field.focus();

    expect(press_select_all(field).defaultPrevented).toBe(false);
  });

  it("leaves the message list to its own select all", () => {
    build_reader();
    const list = document.createElement("div");

    list.setAttribute("data-list-column", "");
    list.innerHTML = `<div id="row" tabindex="0">Row</div>`;
    document.body.appendChild(list);
    const row = list.querySelector<HTMLElement>("#row")!;

    row.focus();

    expect(press_select_all(row).defaultPrevented).toBe(false);
  });

  it("does nothing when no message is open", () => {
    const event = press_select_all();

    expect(event.defaultPrevented).toBe(false);
  });
});
