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
import { describe, expect, it } from "vitest";

const LOCALES = [
  "en",
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

interface CategoryNames {
  mail: { inbox: string; all_mail: string };
  mail_rules: { category_primary: string };
}

async function load(code: string): Promise<CategoryNames> {
  const module_exports = await import(`./translations/${code}.ts`);

  return Object.values(module_exports)[0] as CategoryNames;
}

describe("primary category tab name", () => {
  it.each(LOCALES)("%s names the tab apart from the Inbox folder", async (code) => {
    const locale = await load(code);
    const tab = locale.mail_rules.category_primary.trim().toLocaleLowerCase();

    expect(tab.length).toBeGreaterThan(0);
    expect(tab).not.toBe(locale.mail.inbox.trim().toLocaleLowerCase());
    expect(tab).not.toBe(locale.mail.all_mail.trim().toLocaleLowerCase());
  });
});
