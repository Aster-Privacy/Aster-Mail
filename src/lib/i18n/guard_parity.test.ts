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
import { describe, expect, it } from "vitest";

import { en } from "./translations/en";

const LOCALES = [
  "ar",
  "de",
  "es",
  "fr",
  "hi",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "pt-BR",
  "ru",
  "tr",
  "zh-CN",
];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function guard_keys(source: unknown): Set<string> {
  const block = (source as { guard?: Record<string, unknown> }).guard ?? {};

  return new Set(
    Object.entries(block)
      .filter(([, value]) => typeof value === "string")
      .map(([key]) => key.replace(PLURAL_SUFFIX, "")),
  );
}

describe("guard translations", () => {
  it.each(LOCALES)("%s has the same guard keys as English", async (code) => {
    const module_exports = await import(`./translations/${code}.ts`);
    const locale = Object.values(module_exports)[0];
    const expected = [...guard_keys(en)].sort();
    const actual = [...guard_keys(locale)].sort();

    expect(actual).toEqual(expected);
  });
});
