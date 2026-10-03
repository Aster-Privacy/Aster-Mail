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
import type { LanguageCode } from "@/lib/i18n/types";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";
import { LOW_RECOVERY_CODES } from "@/hooks/use_recovery_status";

type TranslateFn = ReturnType<typeof use_i18n>["t"];

const languages: LanguageCode[] = ["pt", "pt-BR", "es", "it", "ru", "pl", "hi"];
const translators: Partial<Record<LanguageCode, TranslateFn>> = {};

let container: HTMLDivElement;
let root: Root;

function Probe({ language }: { language: LanguageCode }) {
  translators[language] = use_i18n().t;

  return null;
}

function body(language: LanguageCode, count: number): string {
  const t = translators[language];

  if (!t) throw new Error(`no translator for ${language}`);

  return t("common.recovery_codes_low_reminder_body", { count });
}

beforeAll(async () => {
  for (const language of languages) {
    await get_translations_async(language);
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root.render(
      <>
        {languages.map((language) => (
          <I18nProvider key={language} default_language={language}>
            <Probe language={language} />
          </I18nProvider>
        ))}
      </>,
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

describe("low recovery codes reminder", () => {
  it("is shown for one remaining code", () => {
    expect(LOW_RECOVERY_CODES).toBeGreaterThanOrEqual(1);
  });

  it("uses the singular when one code is left", () => {
    expect(body("pt", 1)).toBe(
      "Cada código funciona uma vez e resta-te 1. Obtém novos códigos para não perderes o acesso.",
    );
    expect(body("pt-BR", 1)).toBe(
      "Cada código funciona uma vez, e resta 1. Obtenha novos códigos para não perder o acesso.",
    );
    expect(body("es", 1)).toBe(
      "Cada código funciona una vez y te queda 1. Obtén códigos nuevos para no perder el acceso.",
    );
    expect(body("it", 1)).toBe(
      "Ogni codice funziona una volta e te ne resta 1. Ottieni nuovi codici per non perdere l'accesso.",
    );
    expect(body("ru", 1)).toContain("у вас остался 1.");
    expect(body("pl", 1)).toContain("a został Ci 1.");
    expect(body("hi", 1)).toContain("आपके पास 1 बचा है।");
  });

  it("keeps the plural for two and three codes", () => {
    expect(body("pt", 2)).toContain("e restam-te 2.");
    expect(body("pt-BR", 3)).toContain("e restam 3.");
    expect(body("es", 2)).toContain("y te quedan 2.");
    expect(body("it", 3)).toContain("te ne restano 3.");
    expect(body("ru", 2)).toContain("у вас осталось 2.");
    expect(body("pl", 2)).toContain("a zostały Ci 2.");
    expect(body("pl", 3)).toContain("a zostały Ci 3.");
    expect(body("hi", 2)).toContain("आपके पास 2 बचे हैं।");
  });
});
