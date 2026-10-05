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

import { describe, it, expect, vi } from "vitest";

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
const NO_PLURAL_ONE_FORM = new Set<LanguageCode>(["zh-CN", "ja", "ko"]);

describe("locale loading", () => {
  it.each(LOCALES)("%s resolves every English key by itself", async (code) => {
    const loaded = flat_keys(await get_translations_async(code));

    const missing = [...english.keys()].filter(
      (key) =>
        !loaded.has(key) &&
        !(
          NO_PLURAL_ONE_FORM.has(code) &&
          key.endsWith("_one") &&
          loaded.has(key.slice(0, -"_one".length))
        ),
    );

    expect(missing).toEqual([]);
  });

  it("does not load English for a user of another language", async () => {
    vi.resetModules();

    const fresh = await import("./translations");
    const german = await fresh.get_translations_async("de");

    expect(fresh.get_cached_translations("en")).toBeUndefined();
    expect(fresh.get_translations("en")).toBe(german);
    expect(fresh.get_translations("de")).toBe(german);
  });

  it("returns empty strings before any language has loaded", async () => {
    vi.resetModules();

    const fresh = await import("./translations");

    expect(fresh.get_translations("en").common.loading).toBe("");
    expect(fresh.get_cached_translations("en")).toBeUndefined();
  });

  it("loads English on request", async () => {
    vi.resetModules();

    const fresh = await import("./translations");
    const english_table = await fresh.get_translations_async("en");

    expect(english_table.common.loading).toBe(en.common.loading);
    expect(fresh.get_translations("fr")).toBe(english_table);
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
