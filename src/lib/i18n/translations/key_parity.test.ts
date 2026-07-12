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

import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";
import { it as it_locale } from "./it";
import { pt } from "./pt";
import { nl } from "./nl";
import { pl } from "./pl";
import { tr } from "./tr";
import { ru } from "./ru";
import { ja } from "./ja";
import { ko } from "./ko";
import { zh_CN } from "./zh-CN";
import { ar } from "./ar";

function flatten_keys(
  obj: Record<string, unknown>,
  prefix: string,
  out: Set<string>,
): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const full = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten_keys(value as Record<string, unknown>, full, out);
    } else {
      out.add(full);
    }
  }
}

const en_keys = new Set<string>();

flatten_keys(en as unknown as Record<string, unknown>, "", en_keys);

const locales: Record<string, Record<string, unknown>> = {
  es,
  fr,
  de,
  it: it_locale,
  pt,
  nl,
  pl,
  tr,
  ru,
  ja,
  ko,
  "zh-CN": zh_CN,
  ar,
};

describe("i18n key parity", () => {
  for (const [code, locale] of Object.entries(locales)) {
    it(`${code} has every en key with no extras`, () => {
      const locale_keys = new Set<string>();

      flatten_keys(locale, "", locale_keys);

      const missing = [...en_keys].filter((k) => !locale_keys.has(k));
      const extra = [...locale_keys].filter((k) => !en_keys.has(k));

      expect({ code, missing, extra }).toEqual({
        code,
        missing: [],
        extra: [],
      });
    });
  }
});
