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
import { describe, it, expect } from "vitest";

import { en } from "./translations/en";

const LOCALES = [
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "zh-CN",
  "ja",
  "ko",
  "ar",
  "ru",
  "nl",
  "pl",
  "tr",
  "hi",
];

const EXPLICIT_COUNT_SUFFIXES = ["_zero", "_one", "_two"];

type LocaleShape = Record<string, Record<string, unknown>>;

const base = en as unknown as LocaleShape;

function placeholders(value: string): string[] {
  const found = value.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];

  return [
    ...new Set(found.map((token) => token.replace(/[{}\s]/g, ""))),
  ].sort();
}

function spells_out_the_count(key: string): boolean {
  return EXPLICIT_COUNT_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

describe("placeholder integrity", () => {
  it.each(LOCALES)("%s substitutes the same variables", async (code) => {
    const module_exports = await import(`./translations/${code}.ts`);
    const locale = Object.values(module_exports)[0] as LocaleShape;
    const broken: string[] = [];

    for (const namespace of Object.keys(base)) {
      for (const key of Object.keys(base[namespace])) {
        const source = base[namespace][key];
        const translated = locale[namespace]?.[key];

        if (typeof source !== "string" || typeof translated !== "string") {
          continue;
        }

        const expected = placeholders(source);
        const actual = placeholders(translated);
        const unknown = actual.filter((name) => !expected.includes(name));
        const dropped = expected.filter((name) => !actual.includes(name));

        if (unknown.length > 0) {
          broken.push(`${namespace}.${key} adds ${unknown.join(", ")}`);
        }
        if (dropped.length > 0 && !spells_out_the_count(key)) {
          broken.push(`${namespace}.${key} drops ${dropped.join(", ")}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
