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
import type { RuleRun } from "@/services/api/mail_rules";
import type { AliasRun } from "@/services/api/aliases";
import type { LanguageCode } from "@/lib/i18n/types";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { rule_run_status_label } from "./rule_editor_helpers";

import { I18nProvider, use_i18n } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";

vi.mock("@/services/api/aliases", () => ({
  get_alias_run: vi.fn(),
  run_alias_on_existing: vi.fn(),
  cancel_alias_run: vi.fn(),
}));

const { alias_run_status_label } =
  await import("@/components/settings/aliases/alias_advanced_panel/delivery");

type TranslateFn = ReturnType<typeof use_i18n>["t"];

const languages: LanguageCode[] = ["en", "pt", "pt-BR", "es", "it"];
const translators: Partial<Record<LanguageCode, TranslateFn>> = {};

let container: HTMLDivElement;
let root: Root;

function Probe({ language }: { language: LanguageCode }) {
  translators[language] = use_i18n().t;

  return null;
}

function rule_run(applied: number, skipped_encrypted = 0): RuleRun {
  return {
    run_id: "r1",
    rule_id: "rule1",
    status: "canceled",
    include_trashed: false,
    scanned: 10,
    matched: applied,
    applied,
    skipped: 0,
    skipped_encrypted,
    total_estimate: null,
    created_at: "2026-10-01T00:00:00Z",
    started_at: "2026-10-01T00:00:00Z",
    finished_at: "2026-10-01T00:01:00Z",
  };
}

function alias_run(applied: number): AliasRun {
  return {
    run_id: "r1",
    alias_id: "a1",
    status: "canceled",
    include_trashed: false,
    scanned: 10,
    matched: applied,
    applied,
    created_at: "2026-10-01T00:00:00Z",
  } as AliasRun;
}

function t_for(language: LanguageCode): TranslateFn {
  const t = translators[language];

  if (!t) throw new Error(`no translator for ${language}`);

  return t;
}

beforeAll(async () => {
  for (const language of languages) {
    if (language !== "en") await get_translations_async(language);
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

describe("stopped apply-to-existing runs", () => {
  it("uses the singular for a single updated message", () => {
    expect(rule_run_status_label(rule_run(1), t_for("pt"))).toBe(
      "Parado: 1 atualizado",
    );
    expect(rule_run_status_label(rule_run(1), t_for("pt-BR"))).toBe(
      "Parado: 1 atualizado",
    );
    expect(rule_run_status_label(rule_run(1), t_for("es"))).toBe(
      "Detenido: 1 actualizado",
    );
    expect(rule_run_status_label(rule_run(1), t_for("it"))).toBe(
      "Interrotto: 1 aggiornato",
    );
    expect(rule_run_status_label(rule_run(1), t_for("en"))).toBe(
      "Stopped: 1 updated",
    );
  });

  it("keeps the plural for zero and for several messages", () => {
    expect(rule_run_status_label(rule_run(0), t_for("pt"))).toBe(
      "Parado: 0 atualizados",
    );
    expect(rule_run_status_label(rule_run(3), t_for("pt"))).toBe(
      "Parado: 3 atualizados",
    );
    expect(rule_run_status_label(rule_run(3), t_for("es"))).toBe(
      "Detenido: 3 actualizados",
    );
    expect(rule_run_status_label(rule_run(3), t_for("it"))).toBe(
      "Interrotto: 3 aggiornati",
    );
  });

  it("does not pair one updated message with a plural when some were encrypted", () => {
    expect(rule_run_status_label(rule_run(1, 2), t_for("pt"))).toBe(
      "Parado. Atualizados: 1. Esta regra ignorou 2 mensagens encriptadas porque só o seu dispositivo consegue lê-las.",
    );
    expect(rule_run_status_label(rule_run(1, 1), t_for("pt"))).toBe(
      "Parado. Atualizados: 1. Esta regra ignorou 1 mensagem encriptada porque só o seu dispositivo consegue lê-la.",
    );
    expect(rule_run_status_label(rule_run(1, 2), t_for("pt-BR"))).toBe(
      "Parado. Atualizados: 1. Esta regra ignorou 2 mensagens criptografadas porque só o seu dispositivo consegue lê-las.",
    );

    for (const language of ["es", "it"] as LanguageCode[]) {
      expect(
        rule_run_status_label(rule_run(1, 2), t_for(language)),
      ).not.toMatch(/\b1 (actualizados|aggiornati)\b/);
    }
  });

  it("uses the singular when an alias run is stopped after one message", () => {
    expect(alias_run_status_label(alias_run(1), t_for("pt"))).toBe(
      "Parado: 1 atualizado",
    );
    expect(alias_run_status_label(alias_run(1), t_for("es"))).toBe(
      "Detenido: 1 actualizado",
    );
    expect(alias_run_status_label(alias_run(1), t_for("it"))).toBe(
      "Interrotto: 1 aggiornato",
    );
    expect(alias_run_status_label(alias_run(4), t_for("pt"))).toBe(
      "Parado: 4 atualizados",
    );
  });
});
