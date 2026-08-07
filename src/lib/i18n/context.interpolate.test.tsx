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
import type { TranslationKey } from "./types";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "./context";
import { en } from "./translations/en";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const placeholder_pattern = /\{\{?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}?\}/g;

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

describe("translation interpolation", () => {
  it("fills a double brace placeholder", () => {
    expect(translate("settings.vacation_n_replies_sent", { count: 4 })).toBe(
      "4 replies sent",
    );
  });

  it("fills a single brace placeholder", () => {
    expect(
      translate("settings.pgp_key_discovered_via", {
        source: "Web Key Directory",
      }),
    ).toBe("Discovered via Web Key Directory");
  });

  it("fills a single brace placeholder that follows literal text", () => {
    expect(translate("mail.menu_applies_to_selection", { count: 3 })).toBe(
      "Applies to 3 selected",
    );
  });

  it("leaves a string without params untouched", () => {
    expect(translate("settings.pgp_key_discovered_via")).toBe(
      "Discovered via {source}",
    );
  });

  it("resolves every placeholder used by an english string", () => {
    const unresolved: string[] = [];

    for (const [namespace, entries] of Object.entries(en)) {
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== "string") continue;

        const names = [...value.matchAll(placeholder_pattern)].map(
          (match) => match[1],
        );

        if (names.length === 0) continue;

        const params = Object.fromEntries(names.map((name) => [name, "x"]));
        const rendered = translate(
          `${namespace}.${key}` as TranslationKey,
          params,
        );

        if (rendered.includes("{")) {
          unresolved.push(`${namespace}.${key} -> ${rendered}`);
        }
      }
    }

    expect(unresolved).toEqual([]);
  });
});
