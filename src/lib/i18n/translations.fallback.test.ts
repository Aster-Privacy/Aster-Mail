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
];

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

const english = flat_keys(en as unknown as Translations);

describe("locale loading falls back to English", () => {
  it.each(LOCALES)("%s resolves every English key", async (code) => {
    const loaded = flat_keys(await get_translations_async(code));

    const missing = [...english.keys()].filter((key) => !loaded.has(key));

    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s keeps its own translated strings", async (code) => {
    const loaded = flat_keys(await get_translations_async(code));

    const translated = [...loaded.entries()].filter(
      ([key, value]) => english.has(key) && english.get(key) !== value,
    );

    expect(translated.length).toBeGreaterThan(100);
  });

  it("returns English for an unsupported code", async () => {
    const loaded = await get_translations_async("xx" as LanguageCode);

    expect(loaded).toBe(en);
  });
});
