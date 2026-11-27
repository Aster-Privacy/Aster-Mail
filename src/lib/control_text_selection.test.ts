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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  should_block_select_start,
  start_multi_click_selection_guard,
} from "./multi_click_selection";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const globals_css = source("src/styles/globals.css");

function selector_list_before(declaration: RegExp): string {
  const index = globals_css.search(declaration);

  expect(index).toBeGreaterThan(-1);

  const open = globals_css.lastIndexOf("{", index);
  const previous_close = globals_css.lastIndexOf("}", open);

  return globals_css.slice(previous_close + 1, open).trim();
}

const none_selector = selector_list_before(
  /-webkit-user-select: none;\r?\n {4}user-select: none;\r?\n {4}-webkit-touch-callout: none;/,
);
const text_selector = selector_list_before(
  /-webkit-user-select: auto;\r?\n {4}user-select: text;/,
);

function css_user_select(element: Element): "none" | "text" | "inherit" {
  if (element.matches(text_selector)) return "text";
  if (element.matches(none_selector)) return "none";

  return "inherit";
}

function line_with(text: string, fragment: string): string {
  const line = text.split(/\r?\n/).find((entry) => entry.includes(fragment));

  expect(line, fragment).toBeDefined();

  return line!;
}

function mouse_down(
  target: Element,
  detail: number,
  init: MouseEventInit = {},
): MouseEvent {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail,
    ...init,
  });

  target.dispatchEvent(event);

  return event;
}

function select_start(target: Node): Event {
  const event = new Event("selectstart", { bubbles: true, cancelable: true });

  target.dispatchEvent(event);

  return event;
}

function build_surface(): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = `
    <div class="select-none" data-compose-mode-header="">
      <button type="button" id="mode_button" aria-haspopup="menu">
        <svg id="mode_icon"></svg><svg id="mode_chevron"></svg>
      </button>
      <span id="avatar">F</span>
      <span class="truncate" id="mode_title">Reply: findley@aster.cx</span>
    </div>
    <div role="menu" id="menu">
      <div role="menuitem" id="menu_reply"><span id="menu_reply_label">Reply</span></div>
      <div role="separator" id="menu_separator"></div>
      <div id="menu_heading">Move to</div>
      <input id="menu_filter" />
    </div>
    <div role="tablist" id="tabs"><div role="tab" id="tab_primary">Primary</div></div>
    <div role="toolbar" id="toolbar"><button id="bold">B</button></div>
    <div role="listbox" id="palette"><div role="option" id="palette_item">Open settings</div></div>
    <div data-list-column="">
      <div role="button" id="row"><span id="row_subject">Quarterly report</span></div>
    </div>
    <div class="select-none" id="chip"><span id="chip_address">ada@astermail.org</span></div>
    <div class="select-none" id="sender_header">
      <span data-selectable id="sender_address">ada@astermail.org</span>
    </div>
    <div role="dialog" id="dialog">
      <p class="font-mono" id="fingerprint">88B0 A8A6 1C2D</p>
      <p role="alert" id="error_text">Could not save.</p>
      <p class="select-text" id="key_value">age1qyqszqgpqyqszqgp</p>
    </div>
    <div contenteditable="true" id="editor"><p id="editor_line">Draft text</p></div>
    <div contenteditable="" id="bare_editor">Bare</div>
    <div contenteditable="plaintext-only" id="plain_editor">Plain</div>
    <textarea id="notes">Notes</textarea>
    <input id="search" value="invoice" />
    <p id="body_text">Message body</p>
  `;
  document.body.appendChild(root);

  return root;
}

function by_id(id: string): HTMLElement {
  return document.getElementById(id)!;
}

describe("control text selection styles", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = build_surface();
  });

  afterEach(() => {
    root.remove();
  });

  it("keeps menus, tabs, toolbars, listboxes and their items unselectable", () => {
    for (const id of [
      "mode_button",
      "menu",
      "menu_reply",
      "menu_separator",
      "tabs",
      "tab_primary",
      "toolbar",
      "bold",
      "palette",
      "palette_item",
      "row",
    ]) {
      expect(css_user_select(by_id(id)), id).toBe("none");
    }
  });

  it("keeps editors, inputs and copyable values selectable", () => {
    for (const id of [
      "menu_filter",
      "editor",
      "editor_line",
      "bare_editor",
      "plain_editor",
      "notes",
      "search",
      "sender_address",
    ]) {
      expect(css_user_select(by_id(id)), id).toBe("text");
    }
  });

  it("turns off the long-press callout on menus and toolbars", () => {
    expect(none_selector).toContain('[role="menu"]');
    expect(none_selector).toContain('[role="toolbar"]');
  });
});

describe("composer and chrome source", () => {
  it("keeps the inline reply header, mode button and title unselectable", () => {
    const composer = source("src/components/email/inline_reply_composer.tsx");

    expect(
      line_with(
        composer,
        "items-center justify-between px-4 py-2 flex-shrink-0",
      ),
    ).toContain("select-none");
    expect(line_with(composer, "text-sm text-txt-secondary min-w-0")).toContain(
      "select-none",
    );
    expect(composer).toContain('data-compose-mode-header=""');
  });

  it("keeps the popup, full and mobile compose headers unselectable", () => {
    expect(
      line_with(
        source("src/components/compose/compose_window.tsx"),
        "ps-4 pe-2 py-2 border-b",
      ),
    ).toContain("select-none");
    for (const path of [
      "src/components/compose/compose_modal.tsx",
      "src/components/modals/reply/reply_header.tsx",
      "src/components/modals/forward/forward_header.tsx",
    ]) {
      expect(line_with(source(path), "sm:cursor-move"), path).toContain(
        "select-none",
      );
    }
    expect(source("src/components/mobile/mobile_header.tsx")).toContain(
      'className="contents select-none"',
    );
  });

  it("marks shared menu content unselectable", () => {
    const dropdown = source("src/components/ui/dropdown_menu.tsx");
    const context = source("src/components/ui/context_menu.tsx");

    expect(line_with(dropdown, "cn(MENU_MAX_HEIGHT")).toContain("select-none");
    expect(line_with(dropdown, "overflow-y-auto overflow-x-hidden")).toContain(
      "select-none",
    );
    expect(context.match(/"select-none"/g)?.length).toBe(2);
  });

  it("marks the sidebar, chips and attachments unselectable", () => {
    expect(source("src/components/layout/sidebar.tsx")).toContain(
      '<div className="contents select-none" data-sidebar-chrome="">',
    );
    expect(
      line_with(
        source("src/components/compose/compose_recipients.tsx"),
        "bg-surf-tertiary rounded-full px-2 py-1 border border-transparent",
      ),
    ).toContain("select-none");
    expect(
      line_with(
        source("src/components/email/attachment_list/card.tsx"),
        "message_attachment_card relative",
      ),
    ).toContain("select-none");
    expect(
      line_with(
        source("src/components/email/attachment_chip.tsx"),
        "inline-flex items-center gap-1 px-1.5",
      ),
    ).toContain("select-none");
    expect(
      line_with(
        source("src/components/compose/compose_attachments.tsx"),
        "rounded group hover:bg-[var(--aster-hover)]",
      ),
    ).toContain("select-none");
  });
});

describe("control selection guard", () => {
  let root: HTMLElement;
  let stop: () => void;

  beforeEach(() => {
    root = build_surface();
    stop = start_multi_click_selection_guard();
  });

  afterEach(() => {
    stop();
    root.remove();
    document.body.style.pointerEvents = "";
  });

  it("blocks a quick double click on the composer mode button and title", () => {
    for (const id of [
      "mode_button",
      "mode_icon",
      "mode_chevron",
      "avatar",
      "mode_title",
    ]) {
      expect(mouse_down(by_id(id), 2).defaultPrevented, id).toBe(true);
      expect(mouse_down(by_id(id), 3).defaultPrevented, id).toBe(true);
    }
  });

  it("blocks a double click on menu items, tabs, rows and chips", () => {
    for (const id of [
      "menu_reply_label",
      "menu_heading",
      "tab_primary",
      "palette_item",
      "row_subject",
      "chip_address",
    ]) {
      expect(mouse_down(by_id(id), 2).defaultPrevented, id).toBe(true);
    }
  });

  it("blocks a double click that lands on the page root behind an open menu", () => {
    expect(mouse_down(document.documentElement, 2).defaultPrevented).toBe(true);
    expect(mouse_down(document.body, 2).defaultPrevented).toBe(true);
  });

  it("blocks a root press while a menu locks the page so the editor keeps its selection", () => {
    expect(mouse_down(document.documentElement, 1).defaultPrevented).toBe(
      false,
    );

    document.body.style.pointerEvents = "none";

    expect(mouse_down(document.documentElement, 1).defaultPrevented).toBe(true);
  });

  it("leaves single clicks on controls alone so focus and menus still work", () => {
    for (const id of ["mode_button", "menu_reply", "row", "tab_primary"]) {
      expect(mouse_down(by_id(id), 1).defaultPrevented, id).toBe(false);
    }
  });

  it("stops shift click range selection from highlighting row text", () => {
    expect(
      mouse_down(by_id("row_subject"), 1, { shiftKey: true }).defaultPrevented,
    ).toBe(true);
    for (const id of ["search", "editor_line", "body_text"]) {
      expect(
        mouse_down(by_id(id), 1, { shiftKey: true }).defaultPrevented,
        id,
      ).toBe(false);
    }
  });

  it("stops a drag or long press that starts on a control from selecting text", () => {
    for (const id of [
      "mode_title",
      "menu_reply_label",
      "row_subject",
      "bold",
    ]) {
      const text = by_id(id).firstChild ?? by_id(id);

      expect(select_start(text).defaultPrevented, id).toBe(true);
    }
  });

  it("lets selection start in body text, editors, inputs and copyable values", () => {
    for (const id of [
      "body_text",
      "editor_line",
      "notes",
      "search",
      "sender_address",
      "fingerprint",
      "error_text",
      "key_value",
    ]) {
      const text = by_id(id).firstChild ?? by_id(id);

      expect(select_start(text).defaultPrevented, id).toBe(false);
      expect(
        should_block_select_start({ target: text } as unknown as Event),
        id,
      ).toBe(false);
    }
  });

  it("keeps double click word selection on copyable values in dialogs", () => {
    for (const id of [
      "sender_address",
      "fingerprint",
      "error_text",
      "key_value",
      "editor_line",
      "search",
    ]) {
      expect(mouse_down(by_id(id), 2).defaultPrevented, id).toBe(false);
    }
  });
});
