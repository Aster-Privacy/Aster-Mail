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

import { describe, it, expect } from "vitest";

const flat_css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

function rule_bodies(selector: string): string[] {
  const bodies: string[] = [];

  for (const ending of [" {", ","]) {
    let at = flat_css.indexOf(`${selector}${ending}`);

    while (at !== -1) {
      const open_brace = flat_css.indexOf("{", at);
      const close_brace = flat_css.indexOf("}", open_brace);

      bodies.push(flat_css.slice(open_brace + 1, close_brace));
      at = flat_css.indexOf(`${selector}${ending}`, close_brace);
    }
  }

  return bodies;
}

const TRAILING_ACTIONS = [
  ".aster_menu_row_action",
  ".search_result_action",
  ".quick_contacts_action",
  ".row_icon_action",
  "[data-ripple-row] .contact_group_icon_button",
  '[data-sidebar-root] .sidebar-nav-btn [role="button"]',
];

describe("row surfaces", () => {
  it.each(TRAILING_ACTIONS)(
    "%s never paints its own box inside the row",
    (selector) => {
      const bodies = rule_bodies(selector);

      expect(bodies.length).toBeGreaterThan(0);
      expect(
        bodies.some((body) => /background: none !important/.test(body)),
      ).toBe(true);
    },
  );

  it.each([
    ".aster_menu_row_action:hover",
    ".search_result_action:hover",
    ".quick_contacts_action:hover",
    ".row_icon_action:hover",
  ])("%s changes color only", (selector) => {
    const at = flat_css.indexOf(selector);

    expect(at).toBeGreaterThan(-1);
    const open_brace = flat_css.indexOf("{", at);
    const body = flat_css.slice(
      open_brace + 1,
      flat_css.indexOf("}", open_brace),
    );

    expect(body).not.toMatch(/background/);
  });

  it("fills the whole row on hover, selection and keyboard focus", () => {
    expect(flat_css).toMatch(
      /\.aster_menu_row\[data-selected="true"\][^{]*\{[^}]*background-color: var\(--aster-selected/,
    );
    expect(flat_css).toMatch(
      /\.aster_menu_row\[data-disabled\][^{]*\{[^}]*cursor: not-allowed/,
    );
    expect(flat_css).toMatch(
      /\[data-ripple-row\]:has\(\.aster_row_stretch:focus-visible\)/,
    );
    expect(flat_css).toMatch(/\.aster_row_stretch::after \{[^}]*inset: 0/);
  });

  it.each([
    ".aster_checkbox_input:focus-visible + .aster_checkbox_box",
    ".aster_radio_input:focus-visible + .aster_radio_circle",
    ".aster_switch_input:focus-visible + .aster_switch_track",
    ".aster_seg_input:focus-visible + .aster_seg_label",
  ])("rings %s from the keyboard", (selector) => {
    const at = flat_css.indexOf(
      `html[data-input-modality="keyboard"] ${selector}`,
    );

    expect(at).toBeGreaterThan(-1);
    const open_brace = flat_css.indexOf("{", at);
    const body = flat_css.slice(
      open_brace + 1,
      flat_css.indexOf("}", open_brace),
    );

    expect(body).toMatch(/outline: 2px solid var\(--accent-color\)/);
  });

  it("keeps checkbox, radio and switch labels free of a fill", () => {
    expect(flat_css).toMatch(
      /\.aster_checkbox:hover, \.aster_checkbox:active, \.aster_radio:hover, \.aster_radio:active, \.aster_switch:hover, \.aster_switch:active \{ background: none; \}/,
    );
  });
});
