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
import type { TranslationKey } from "./types";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "./context";
import { to_intl_locale } from "./languages";
import { get_translations_async } from "./translations";
import { pt } from "./translations/pt";
import { pt_br } from "./translations/pt-BR";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

let translate: TranslateFn;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  translate = use_i18n().t;

  return null;
}

beforeAll(async () => {
  await get_translations_async("pt");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root.render(
      <I18nProvider default_language="pt">
        <Probe />
      </I18nProvider>,
    );
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

afterAll(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("European Portuguese plurals", () => {
  it("maps the app's pt to pt-PT for Intl and keeps pt-BR", () => {
    expect(to_intl_locale("pt")).toBe("pt-PT");
    expect(to_intl_locale("pt-BR")).toBe("pt-BR");
    expect(to_intl_locale("en")).toBe("en");
  });

  it("uses the singular for a count of one", () => {
    expect(translate("common.trash_days_left", { count: 1 })).toBe(
      "1 dia restante",
    );
    expect(translate("mail.tab_unread_count", { count: 1 })).toBe("1 não lida");
    expect(translate("mail.empty_trash_description", { count: 1 })).toBe(
      "A mensagem no Lixo será removida definitivamente e não é possível anular esta ação.",
    );
    expect(translate("mail.empty_spam_description", { count: 1 })).toBe(
      "A mensagem no spam será removida definitivamente e não é possível anular esta ação.",
    );
  });

  it("treats zero as plural, as Portugal does", () => {
    expect(translate("common.trash_days_left", { count: 0 })).toBe(
      "0 dias restantes",
    );
    expect(translate("mail.tab_unread_count", { count: 0 })).toBe(
      "0 não lidas",
    );
    expect(translate("common.more_folders", { count: 0 })).toBe(
      "mais 0 pastas",
    );
  });

  it("keeps the plural for larger counts", () => {
    expect(translate("common.trash_days_left", { count: 5 })).toBe(
      "5 dias restantes",
    );
  });
});

describe("European Portuguese wording", () => {
  const keys: Array<[string, string]> = [
    ["mail", "pdf_password_title"],
    ["mail", "pdf_password_description"],
    ["mail", "pdf_password_label"],
    ["mail", "pdf_preview_failed"],
    ["settings", "auto_delete_trash_after"],
    ["settings", "auto_delete_trash_description"],
    ["settings", "signature_too_large"],
    ["settings", "recovery_codes_confirm_desc"],
    ["settings", "recovery_codes_low"],
    ["settings", "export_private_key_warning"],
    ["settings", "billing_thanks_body"],
    ["settings", "passphrase"],
    ["auth", "reset_second_factor_description"],
    ["auth", "reset_second_factor_backup_description"],
  ];

  const bundle = (source: unknown, namespace: string, key: string) =>
    (source as Record<string, Record<string, string>>)[namespace][key];

  it.each(keys)("%s.%s is not the Brazilian string", (namespace, key) => {
    expect(bundle(pt, namespace, key)).not.toBe(bundle(pt_br, namespace, key));
  });

  it("uses no Brazilian-only terms in the fixed strings", () => {
    const brazilian =
      /\b(senha|Senha|digite|Digite|lixeira|Lixeira|excluíd\w*|Excluir a|equipe|compartilh\w*|arquivo em|salva|app autenticador|backup)\b/;
    const offenders = keys
      .map(([namespace, key]) => [key, bundle(pt, namespace, key)])
      .filter(([, value]) => brazilian.test(value));

    expect(offenders).toEqual([]);
  });
});
