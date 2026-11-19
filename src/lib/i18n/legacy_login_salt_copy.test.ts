//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
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

async function error_keys(code: string): Promise<string[]> {
  const module_exports = await import(`./translations/${code}.ts`);
  const table = Object.values(module_exports)[0] as {
    errors?: Record<string, unknown>;
  };

  return Object.keys(table.errors ?? {});
}

describe("legacy sign-in salt copy", () => {
  it.each(LOCALES)(
    "%s keeps only the new-device message for a legacy salt",
    async (code) => {
      const keys = await error_keys(code);

      expect(keys).toContain("legacy_login_salt_new_device");
      expect(keys).not.toContain("legacy_login_salt_sign_in_again");
    },
  );
});
