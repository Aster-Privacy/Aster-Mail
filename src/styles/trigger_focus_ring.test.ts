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

interface css_rule {
  selectors: string[];
  body: string;
}

function collect_rules(source: string): css_rule[] {
  const rules: css_rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null = pattern.exec(source);

  while (match) {
    const selectors = match[1]
      .split(";")
      .pop()!
      .split(/,(?![^(]*\))/)
      .map((selector) => selector.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    rules.push({ selectors, body: match[2] });
    match = pattern.exec(source);
  }

  return rules;
}

const rules = collect_rules(globals_css);
const pointer_prefix = 'html:not([data-input-modality="keyboard"])';

describe("dropdown trigger focus ring", () => {
  it("only draws the pointer focus outline on fields you type into", () => {
    const pointer_outline_selectors = rules
      .filter((rule) => /outline\s*:\s*2px/.test(rule.body))
      .flatMap((rule) => rule.selectors)
      .filter(
        (selector) =>
          selector.startsWith(pointer_prefix) &&
          selector.includes(".aster_input") &&
          selector.endsWith(":focus"),
      );

    expect(pointer_outline_selectors.length).toBeGreaterThan(0);

    for (const selector of pointer_outline_selectors) {
      expect(selector).toContain(":is(input, textarea, [contenteditable])");
    }
  });

  it("clears the field focus look from button and select triggers after pointer use", () => {
    const reset = rules.find((rule) =>
      rule.selectors.includes(
        `${pointer_prefix} .aster_input:not(input, textarea, [contenteditable]):focus`,
      ),
    );

    expect(reset).toBeDefined();
    expect(reset!.body).toMatch(/box-shadow\s*:\s*none/);
    expect(reset!.body).toMatch(/outline\s*:\s*none/);
  });

  it("keeps the keyboard focus ring on every field", () => {
    const keyboard_rule = rules.find((rule) =>
      rule.selectors.includes(
        'html[data-input-modality="keyboard"] .aster_input:focus-visible',
      ),
    );

    expect(keyboard_rule).toBeDefined();
    expect(keyboard_rule!.body).toMatch(/outline\s*:\s*2px solid/);
  });

  it("hides the select trigger ring after pointer use", () => {
    const reset = rules.find((rule) =>
      rule.selectors.includes(
        `${pointer_prefix} .aster_select_trigger:focus-visible`,
      ),
    );

    expect(reset).toBeDefined();
    expect(reset!.body).toMatch(/box-shadow\s*:\s*none/);
  });
});
