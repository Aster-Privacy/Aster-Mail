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

const globals_css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\r\n/g, "\n");

const flat_css = globals_css
  .replace(/\s+/g, " ")
  .replace(/\( /g, "(")
  .replace(/ \)/g, ")");

const open_state =
  ':is([aria-haspopup]:not([aria-haspopup="false"], [role="combobox"]):is([aria-expanded="true"], [data-state="open"]))';

function find_open_rule(selector: string): string | null {
  const needle = `${selector}${open_state}`;
  const at = flat_css.indexOf(needle);

  if (at === -1) return null;
  const open_brace = flat_css.indexOf("{", at);
  const close_brace = flat_css.indexOf("}", open_brace);

  return flat_css.slice(open_brace + 1, close_brace);
}

function collect_hover_body(selector: string): string | null {
  const needle = `${selector}:hover`;
  let at = flat_css.indexOf(needle);

  while (at !== -1) {
    const before = flat_css.slice(Math.max(0, at - 2), at).trim();
    const after = flat_css.charAt(at + needle.length);
    const starts_selector = before === "" || before === "}" || before === ",";
    const ends_selector = after === " " || after === "," || after === ":";

    if (starts_selector && ends_selector) {
      const open_brace = flat_css.indexOf("{", at);
      const close_brace = flat_css.indexOf("}", open_brace);

      return flat_css.slice(open_brace + 1, close_brace);
    }
    at = flat_css.indexOf(needle, at + 1);
  }

  return null;
}

function declarations(body: string): string[] {
  return body
    .split(";")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort();
}

describe("open menu trigger state", () => {
  it("makes the hover variant also match an open popup trigger", () => {
    const variant_start = flat_css.indexOf("@custom-variant hover {");
    const variant = flat_css.slice(
      variant_start,
      flat_css.indexOf("@config", variant_start),
    );

    expect(variant_start).toBeGreaterThan(-1);
    expect(variant).toContain("@media (hover: hover) { &:hover { @slot; } }");
    expect(variant).toContain(`&${open_state} { @slot; }`);
  });

  it("keys the open state on popup triggers, not disclosures or comboboxes", () => {
    expect(open_state).toContain("[aria-haspopup]");
    expect(open_state).toContain('[aria-haspopup="false"]');
    expect(open_state).toContain('[role="combobox"]');
  });

  it.each([
    ".app_rail_btn",
    ".contact_list_icon_button",
    ".search_icon_btn",
    ".search_ghost_btn",
    ".hover_bg",
    ".hover_bg_secondary",
    ".search_filter_btn",
    ".search_result_action",
    ".quick_settings_row",
  ])("gives %s the same background open as on hover", (selector) => {
    const open_body = find_open_rule(selector);
    const hover_body = collect_hover_body(selector);

    expect(open_body).not.toBeNull();
    expect(hover_body).not.toBeNull();
    expect(declarations(open_body!)).toEqual(declarations(hover_body!));
  });

  it.each([
    [".aster_btn_ghost", "rgba(0, 0, 0, 0.04)"],
    [".aster_btn_secondary", "rgba(0, 0, 0, 0.08)"],
    [".aster_btn_outline", "rgba(0, 0, 0, 0.08)"],
    [".dark .aster_btn_ghost", "rgba(255, 255, 255, 0.06)"],
    [".dark .aster_btn_secondary", "rgba(255, 255, 255, 0.1)"],
    [".dark .aster_btn_outline", "rgba(255, 255, 255, 0.1)"],
    [".dark.theme-black .aster_btn_secondary", "#262626"],
    ["[data-inbox-toolbar] .aster_btn_ghost.aster_btn_icon", "var(--bg-hover)"],
    [
      ".dark [data-inbox-toolbar] .aster_btn_ghost.aster_btn_icon",
      "var(--bg-hover)",
    ],
    [".aster_compose_tool:not(:disabled)", "rgba(0, 0, 0, 0.05)"],
    [".dark .aster_compose_tool:not(:disabled)", "rgba(255, 255, 255, 0.1)"],
  ])("keeps %s filled while its menu is open", (selector, background) => {
    const open_body = find_open_rule(selector);

    expect(open_body).not.toBeNull();
    expect(
      declarations(open_body!).some(
        (declaration) =>
          declaration === `background: ${background}` ||
          declaration === `background-color: ${background}`,
      ),
    ).toBe(true);
  });

  it("does not add any open-state outline or ring", () => {
    const open_rules = flat_css
      .split("}")
      .filter((chunk) => chunk.includes(open_state));

    expect(open_rules.length).toBeGreaterThan(0);
    for (const chunk of open_rules) {
      const body = chunk.slice(chunk.indexOf("{") + 1);

      expect(body).not.toMatch(/outline|box-shadow/);
    }
  });
});
