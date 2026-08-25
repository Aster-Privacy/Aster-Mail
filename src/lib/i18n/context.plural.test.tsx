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
import type { LanguageCode, TranslationKey } from "./types";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "./context";
import { en } from "./translations/en";
import { es } from "./translations/es";
import { fr } from "./translations/fr";
import { de } from "./translations/de";
import { it as it_locale } from "./translations/it";
import { pt } from "./translations/pt";
import { nl } from "./translations/nl";
import { tr } from "./translations/tr";
import { ru } from "./translations/ru";
import { pl } from "./translations/pl";
import { ar } from "./translations/ar";
import { ja } from "./translations/ja";
import { ko } from "./translations/ko";
import { zh_CN } from "./translations/zh-CN";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const plural_bases: Array<[string, string]> = Object.entries(
  en as unknown as Record<string, Record<string, string>>,
).flatMap(([namespace, entries]) =>
  Object.keys(entries)
    .filter(
      (key) =>
        key.endsWith("_other") &&
        typeof entries[`${key.slice(0, key.length - "_other".length)}_one`] ===
          "string",
    )
    .map(
      (key) =>
        [namespace, key.slice(0, key.length - "_other".length)] as [
          string,
          string,
        ],
    ),
);

const locales: Array<[LanguageCode, Record<string, unknown>]> = [
  ["es", es],
  ["fr", fr],
  ["de", de],
  ["it", it_locale],
  ["pt", pt],
  ["nl", nl],
  ["tr", tr],
  ["ru", ru],
  ["pl", pl],
  ["ar", ar],
  ["ja", ja],
  ["ko", ko],
  ["zh-CN", zh_CN],
];

let translate: TranslateFn;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  translate = use_i18n().t;

  return null;
}

beforeAll(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root.render(
      <I18nProvider default_language="en">
        <Probe />
      </I18nProvider>,
    );
  });
});

afterAll(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("plural selection", () => {
  it("uses the singular form for a count of one", () => {
    expect(translate("common.more_folders", { count: 1 })).toBe(
      "1 more folder",
    );
    expect(translate("common.more_labels", { count: 1 })).toBe("1 more label");
    expect(translate("common.more_aliases", { count: 1 })).toBe("1 more alias");
    expect(translate("mail.more_folders_count", { count: 1 })).toBe(
      "+1 more folder",
    );
  });

  it("uses the plural form for other counts", () => {
    expect(translate("common.more_folders", { count: 4 })).toBe(
      "4 more folders",
    );
    expect(translate("common.more_folders", { count: 0 })).toBe(
      "0 more folders",
    );
  });

  it("leaves keys without plural variants untouched", () => {
    expect(translate("settings.fam_org_stat_pending", { count: 1 })).toBe(
      "1 pending",
    );
  });

  it("falls back to the base key for a non numeric count", () => {
    expect(translate("common.more_folders", { count: "many" })).toBe(
      "many more folders",
    );
  });
});

describe("plural coverage per locale", () => {
  it("defines the other form and the one form every locale can select", () => {
    const missing: string[] = [];

    for (const [language, bundle] of locales) {
      const categories = new Set<string>();
      const rules = new Intl.PluralRules(language);

      for (let count = 0; count <= 120; count += 1) {
        categories.add(rules.select(count));
      }

      const required = ["other"];

      if (categories.has("one")) required.push("one");

      for (const [namespace, base] of plural_bases) {
        const entries = (bundle as Record<string, Record<string, string>>)[
          namespace
        ];

        for (const category of required) {
          if (typeof entries?.[`${base}_${category}`] !== "string") {
            missing.push(`${language} ${namespace}.${base}_${category}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
