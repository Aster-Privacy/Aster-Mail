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

const NO_PLURAL_ONE_FORM = new Set(["zh-CN", "ja", "ko"]);

const UNSHIPPED_NAMESPACES = new Set(["calendar"]);

const SHIPPED_CALENDAR_PREFIX = "invite_";

function flat(source: unknown): Set<string> {
  const out = new Set<string>();

  for (const [ns, entries] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (!entries || typeof entries !== "object") continue;

    for (const [key, value] of Object.entries(
      entries as Record<string, unknown>,
    )) {
      if (typeof value !== "string") continue;
      if (
        UNSHIPPED_NAMESPACES.has(ns) &&
        !key.startsWith(SHIPPED_CALENDAR_PREFIX)
      ) {
        continue;
      }
      out.add(`${ns}.${key}`);
    }
  }

  return out;
}

describe("locale coverage", () => {
  it.each(LOCALES)("%s carries every shipping english key", async (code) => {
    const module_exports = await import(`./translations/${code}.ts`);
    const locale = Object.values(module_exports)[0];
    const present = flat(locale);

    const missing = [...flat(en)].filter(
      (key) =>
        !present.has(key) &&
        !(NO_PLURAL_ONE_FORM.has(code) && key.endsWith("_one")),
    );

    expect(missing).toEqual([]);
  });
});
