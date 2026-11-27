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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { start_multi_click_selection_guard } from "./multi_click_selection";

const globals_css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf-8",
);

function selector_list_before(declaration: RegExp): string {
  const index = globals_css.search(declaration);

  expect(index).toBeGreaterThan(-1);

  const open = globals_css.lastIndexOf("{", index);
  const previous_close = globals_css.lastIndexOf("}", open);

  return globals_css.slice(previous_close + 1, open).trim();
}

const none_selector = selector_list_before(
  /-webkit-user-select: none;\r?\n {4}user-select: none;/,
);
const text_selector = selector_list_before(
  /-webkit-user-select: auto;\r?\n {4}user-select: text;/,
);

function user_select_of(element: Element): "none" | "text" | "inherit" {
  if (element.matches(text_selector)) return "text";
  if (element.matches(none_selector)) return "none";

  return "inherit";
}

function build_settings_panel(): HTMLElement {
  const dialog = document.createElement("div");

  dialog.setAttribute("role", "dialog");
  dialog.innerHTML = `
    <nav>
      <button id="nav_account">Account</button>
      <div role="tab" id="nav_tab">Appearance</div>
    </nav>
    <section>
      <h2 id="panel_heading">Account</h2>
      <p id="panel_text">Manage your account.</p>
      <button role="switch" id="toggle"><span id="toggle_label">On</span></button>
      <div role="radiogroup"><div role="radio" id="segment">Compact</div></div>
      <div role="menuitem" id="menu_item">Sign out</div>
      <label id="label_wrap"><input type="checkbox" id="label_checkbox" /> Notify me</label>
      <input id="display_name" value="Ada" />
      <textarea id="signature">Thanks</textarea>
      <span data-selectable id="address">ada@astermail.org</span>
    </section>
  `;
  document.body.appendChild(dialog);

  return dialog;
}

function mouse_down(target: Element, detail: number): MouseEvent {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail,
  });

  target.dispatchEvent(event);

  return event;
}

describe("settings selection styles", () => {
  let dialog: HTMLElement;

  beforeEach(() => {
    dialog = build_settings_panel();
  });

  afterEach(() => {
    dialog.remove();
  });

  it("marks settings nav items and controls as not selectable", () => {
    for (const id of [
      "nav_account",
      "nav_tab",
      "toggle",
      "segment",
      "menu_item",
      "label_wrap",
    ]) {
      expect(user_select_of(document.getElementById(id)!)).toBe("none");
    }
  });

  it("keeps inputs, textareas, and copyable values selectable", () => {
    for (const id of ["display_name", "signature", "address"]) {
      expect(user_select_of(document.getElementById(id)!)).toBe("text");
    }
  });
});

describe("multi-click selection guard", () => {
  let dialog: HTMLElement;
  let stop: () => void;

  beforeEach(() => {
    dialog = build_settings_panel();
    stop = start_multi_click_selection_guard();
  });

  afterEach(() => {
    stop();
    dialog.remove();
  });

  it("blocks a double or triple click from starting a selection in the panel", () => {
    for (const id of ["nav_account", "toggle_label", "panel_text", "segment"]) {
      const target = document.getElementById(id)!;

      expect(mouse_down(target, 2).defaultPrevented).toBe(true);
      expect(mouse_down(target, 3).defaultPrevented).toBe(true);
    }
  });

  it("leaves single clicks alone so focus still moves", () => {
    expect(
      mouse_down(document.getElementById("nav_account")!, 1).defaultPrevented,
    ).toBe(false);
  });

  it("lets inputs and copyable values use double-click selection", () => {
    for (const id of ["display_name", "signature", "address"]) {
      expect(
        mouse_down(document.getElementById(id)!, 2).defaultPrevented,
      ).toBe(false);
    }
  });

  it("ignores text outside app chrome", () => {
    const body_text = document.createElement("p");

    body_text.textContent = "Message body";
    document.body.appendChild(body_text);

    expect(mouse_down(body_text, 2).defaultPrevented).toBe(false);

    body_text.remove();
  });
});
