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

import {
  push_fallback_body,
  push_fallback_languages,
} from "./push_fallback_strings";
import { get_translations_async } from "./i18n/translations";
import type { LanguageCode } from "./i18n/types";

describe("push_fallback_body", () => {
  it("matches the app translation for every language", async () => {
    for (const code of push_fallback_languages()) {
      const translations = await get_translations_async(code as LanguageCode);

      expect(push_fallback_body(code)).toBe(
        translations.common.push_new_message,
      );
    }
  });

  it("resolves regional and unknown browser languages", () => {
    expect(push_fallback_body("pt-BR")).toBe("Você tem uma nova mensagem");
    expect(push_fallback_body("pt-PT")).toBe("Tem uma nova mensagem");
    expect(push_fallback_body("zh-TW")).toBe("您有一封新邮件");
    expect(push_fallback_body("de-AT")).toBe("Sie haben eine neue Nachricht");
    expect(push_fallback_body("xx")).toBe("You have a new message");
    expect(push_fallback_body(undefined)).toBe("You have a new message");
  });
});
