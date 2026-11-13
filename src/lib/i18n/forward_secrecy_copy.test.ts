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

const LOCALE_TERMS: Record<
  string,
  { forward_secrecy: string; password: string }
> = {
  en: { forward_secrecy: "forward secrecy", password: "password" },
  de: { forward_secrecy: "forward secrecy", password: "passwort" },
  es: {
    forward_secrecy: "confidencialidad persistente",
    password: "contraseña",
  },
  fr: {
    forward_secrecy: "confidentialité persistante",
    password: "mot de passe",
  },
  it: { forward_secrecy: "forward secrecy", password: "password" },
  nl: { forward_secrecy: "forward secrecy", password: "wachtwoord" },
  pl: { forward_secrecy: "forward secrecy", password: "hasło" },
  "pt-BR": { forward_secrecy: "sigilo direto", password: "senha" },
  pt: { forward_secrecy: "sigilo futuro", password: "palavra-passe" },
  tr: { forward_secrecy: "ileri gizlili", password: "parola" },
  ar: { forward_secrecy: "السرية الأمامية", password: "كلمة المرور" },
  hi: { forward_secrecy: "फ़ॉरवर्ड सीक्रेसी", password: "पासवर्ड" },
  ja: { forward_secrecy: "前方秘匿性", password: "パスワード" },
  ko: { forward_secrecy: "순방향 비밀성", password: "비밀번호" },
  ru: { forward_secrecy: "прямую секретность", password: "пароль" },
  "zh-CN": { forward_secrecy: "前向保密", password: "密码" },
};

async function load_settings(code: string): Promise<Record<string, string>> {
  const module_exports = await import(`./translations/${code}.ts`);
  const locale = Object.values(module_exports)[0] as Record<
    string,
    Record<string, string>
  >;

  return locale.settings;
}

describe("forward secrecy copy", () => {
  it.each(Object.keys(LOCALE_TERMS))(
    "%s explains that synced copies stay readable with the password",
    async (code) => {
      const settings = await load_settings(code);
      const info = settings.info_forward_secrecy_description.toLowerCase();

      expect(info).toContain(LOCALE_TERMS[code].password);
    },
  );

  it.each(Object.keys(LOCALE_TERMS))(
    "%s rotation prompt does not promise forward secrecy",
    async (code) => {
      const settings = await load_settings(code);
      const prompt = settings.rotate_keys_description_required.toLowerCase();

      expect(prompt).toContain(LOCALE_TERMS[code].password);
      expect(prompt).not.toContain(LOCALE_TERMS[code].forward_secrecy);
    },
  );
});
