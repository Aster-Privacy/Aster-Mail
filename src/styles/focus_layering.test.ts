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
);

interface css_rule {
  selector: string;
  parents: string[];
  body: string;
}

function collect_rules(source: string): css_rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: css_rule[] = [];
  const stack: { selector: string; start: number }[] = [];
  let segment_start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "{") {
      stack.push({
        selector: text.slice(segment_start, index).trim(),
        start: index + 1,
      });
      segment_start = index + 1;
    } else if (char === "}") {
      const open = stack.pop();

      if (open) {
        rules.push({
          selector: open.selector.split(";").pop()?.trim() ?? "",
          parents: stack.map((entry) => entry.selector),
          body: text.slice(open.start, index),
        });
      }
      segment_start = index + 1;
    } else if (char === ";" && stack.length === 0) {
      segment_start = index + 1;
    }
  }

  return rules;
}

const rules = collect_rules(globals_css);

const generic_keyboard_rings = rules.filter(
  (rule) =>
    rule.selector === 'html[data-input-modality="keyboard"] :focus-visible' &&
    /outline\s*:/.test(rule.body),
);

describe("global focus ring layering", () => {
  it("keeps the generic keyboard ring in the base layer", () => {
    expect(generic_keyboard_rings.length).toBeGreaterThan(0);

    for (const rule of generic_keyboard_rings) {
      expect(rule.parents).toContain("@layer base");
    }
  });

  it("never draws an unlayered outline on every focus-visible element", () => {
    const unlayered = rules.filter(
      (rule) =>
        rule.parents.every((parent) => !parent.startsWith("@layer")) &&
        /^html(\[[^\]]+\])?\s+:focus-visible$/.test(rule.selector) &&
        /outline\s*:\s*\d/.test(rule.body),
    );

    expect(unlayered).toEqual([]);
  });

  it("removes the browser tap highlight square", () => {
    const html_rules = rules.filter(
      (rule) =>
        rule.selector === "html" &&
        /-webkit-tap-highlight-color\s*:\s*transparent/.test(rule.body),
    );

    expect(html_rules.length).toBeGreaterThan(0);
  });
});
