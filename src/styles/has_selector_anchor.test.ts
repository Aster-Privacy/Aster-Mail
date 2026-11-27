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

const STYLESHEETS = ["src/styles/globals.css", "src/styles/mobile.css"];

function split_top_level(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of input) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (depth === 0 && char === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts;
}

function rightmost_compound(selector: string): string {
  const normalized = selector.replace(/\s*([>+~])\s*/g, " ").trim();
  const compounds = split_top_level(normalized, " ").filter(Boolean);

  return compounds.at(-1) ?? "";
}

function rule_selectors(css: string): string[] {
  const without_comments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  const prelude_pattern = /([^{};]+)\{/g;
  let match: RegExpExecArray | null;

  while ((match = prelude_pattern.exec(without_comments)) !== null) {
    const prelude = match[1].trim();

    if (!prelude || prelude.startsWith("@")) continue;
    if (/^(from|to|\d+%)/.test(prelude)) continue;
    for (const selector of split_top_level(prelude, ",")) {
      selectors.push(selector.trim());
    }
  }

  return selectors;
}

function find_unanchored_has(css: string): string[] {
  return rule_selectors(css).filter((selector) => {
    if (!selector.includes(":has(")) return false;
    const subject = rightmost_compound(selector);

    return subject.startsWith(":has(") || subject === "*";
  });
}

describe("has selector anchoring", () => {
  it("flags a :has selector whose subject is any element", () => {
    expect(find_unanchored_has(".dark :has(+ .x) { color: red; }")).toEqual([
      ".dark :has(+ .x)",
    ]);
    expect(
      find_unanchored_has("[data-a]:has(+ [data-a] > .x) > * { color: red; }"),
    ).toEqual(["[data-a]:has(+ [data-a] > .x) > *"]);
    expect(find_unanchored_has(".row:has(+ .x) { color: red; }")).toEqual([]);
  });

  it("keeps every :has selector in the app stylesheets anchored to a class, tag, or attribute", () => {
    for (const path of STYLESHEETS) {
      const css = readFileSync(resolve(process.cwd(), path), "utf8");

      expect(find_unanchored_has(css), path).toEqual([]);
    }
  });
});
