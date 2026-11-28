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
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const globals_css = readFileSync(
  resolve(here, "../../../styles/globals.css"),
  "utf8",
).replace(/\r\n/g, "\n");
const list_source = readFileSync(
  resolve(here, "../inbox/inbox_email_list.tsx"),
  "utf8",
);
const helpers_source = readFileSync(resolve(here, "helpers.tsx"), "utf8");

function rule_body(selector_start: string): string {
  const start = globals_css.indexOf(selector_start);

  expect(start).toBeGreaterThanOrEqual(0);
  const open = globals_css.indexOf("{", start);
  const close = globals_css.indexOf("}", open);

  return globals_css.slice(start, close + 1);
}

function theme_block(class_name: string): string {
  const start = globals_css.indexOf(`\n${class_name} {`);

  expect(start).toBeGreaterThanOrEqual(0);

  return globals_css.slice(start, globals_css.indexOf("\n}", start));
}

function mix_percent(block: string, token: string): number {
  const match = block.match(new RegExp(`${token}:\\s*(\\d+)%`));

  expect(match).not.toBeNull();

  return Number(match![1]);
}

describe("selected mail row edges", () => {
  it("rows draw a top divider, so the band edges are top borders", () => {
    expect(helpers_source).toMatch(/row:\s*"[^"]*\bborder-t\b[^"]*"/);
  });

  it("paints the band top and the row below it with the same edge token", () => {
    const rule = rule_body(
      ".mail_row_selected,\n.mail_row_selected + .mail_row,",
    );

    expect(rule).toContain(
      "[data-row-email-id]:has(> .mail_row_selected) + [data-row-email-id] > .mail_row",
    );
    expect(rule).toContain("border-top-color: var(--mail_row_selected_edge)");
  });

  it("paints the last row bottom edge with the same token", () => {
    const rule = rule_body(".mail_row_selected {\n  border-bottom-color");

    expect(rule).toContain(
      "border-bottom-color: var(--mail_row_selected_edge)",
    );
  });

  it("drops the bottom border rules that only reached the last row", () => {
    expect(globals_css).not.toContain(".mail_row:has(+ .mail_row_selected)");
    expect(globals_css).not.toContain(
      ":has(+ [data-row-email-id] > .mail_row_selected)",
    );
  });

  it("keeps a transparent top border on the first row so it can carry the edge", () => {
    expect(list_source).toContain(
      'email.id === first_row_id && "border-t-transparent"',
    );
    expect(list_source).not.toContain('"border-t-0"');
  });

  it("draws the keyboard focus ring inside the row", () => {
    const rule = rule_body(
      'html[data-input-modality="keyboard"] .mail_row:focus-visible',
    );

    expect(rule).toContain("outline-offset: -2px");
  });

  it("keeps the black theme band subdued with an edge above the hover fill", () => {
    const block = theme_block(".theme-black");
    const fill = mix_percent(block, "--mail_row_selected_mix");
    const hover = mix_percent(block, "--mail_row_selected_hover_mix");
    const edge = mix_percent(block, "--mail_row_selected_edge_mix");

    expect(fill).toBeLessThanOrEqual(24);
    expect(hover).toBeGreaterThan(fill);
    expect(edge).toBeGreaterThan(hover);
  });
});
