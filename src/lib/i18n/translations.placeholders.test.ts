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
import type { LanguageCode, Translations } from "./types";

import { describe, it, expect } from "vitest";

import { get_translations_async } from "./translations";
import { en } from "./translations/en";

const LOCALES: LanguageCode[] = [
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "pt-BR",
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

const PLACEHOLDER = /\{\{\s*([a-z_0-9]+)\s*\}\}/gi;

function flat_keys(source: Translations): Map<string, string> {
  const out = new Map<string, string>();

  for (const [namespace, entries] of Object.entries(source)) {
    if (!entries || typeof entries !== "object") continue;

    for (const [key, value] of Object.entries(
      entries as Record<string, unknown>,
    )) {
      if (typeof value === "string") out.set(`${namespace}.${key}`, value);
    }
  }

  return out;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

function is_grammatical_singular(key: string): boolean {
  return key.endsWith("_one") || key.endsWith("_zero");
}

const english = flat_keys(en as unknown as Translations);

describe("locale strings keep their English placeholders", () => {
  it.each(LOCALES)(
    "%s never introduces an unknown placeholder",
    async (code) => {
      const loaded = flat_keys(await get_translations_async(code));
      const unknown: string[] = [];

      for (const [key, value] of loaded) {
        const source = english.get(key);

        if (!source) continue;

        const expected = new Set(placeholders(source));

        for (const name of placeholders(value)) {
          if (!expected.has(name)) unknown.push(`${key}: {{${name}}}`);
        }
      }

      expect(unknown).toEqual([]);
    },
  );

  it.each(LOCALES)("%s never drops a placeholder it needs", async (code) => {
    const loaded = flat_keys(await get_translations_async(code));
    const dropped: string[] = [];

    for (const [key, value] of loaded) {
      const source = english.get(key);

      if (!source) continue;

      const present = new Set(placeholders(value));

      for (const name of placeholders(source)) {
        if (present.has(name)) continue;
        if (name === "count" && is_grammatical_singular(key)) continue;
        dropped.push(`${key}: {{${name}}}`);
      }
    }

    expect(dropped).toEqual([]);
  });
});
