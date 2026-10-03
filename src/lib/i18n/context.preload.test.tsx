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
import type { LanguageCode, Translations } from "./types";

import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "./context";
import { get_translations_async } from "./translations";

let container: HTMLDivElement;
let root: Root | null = null;
let set_language: ((code: LanguageCode) => void) | null = null;
const rendered: string[] = [];
let shown: Translations | null = null;

function Probe() {
  const i18n = use_i18n();

  set_language = i18n.set_language;
  rendered.push(i18n.t("common.loading"));
  shown = i18n.translations;

  return <span>{i18n.t("common.loading")}</span>;
}

function mount(language: LanguageCode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      <I18nProvider default_language={language}>
        <Probe />
      </I18nProvider>,
    );
  });
}

async function settle_until(check: () => void) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      check();
    },
    { timeout: 20_000, interval: 20 },
  );
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  rendered.length = 0;
  set_language = null;
  shown = null;
});

describe("locale loading", () => {
  it("shares one load between concurrent requests for a locale", async () => {
    const [first, second] = await Promise.all([
      get_translations_async("nl"),
      get_translations_async("nl"),
    ]);

    expect(second).toBe(first);
    expect(await get_translations_async("nl")).toBe(first);
  });

  it("reuses a preload that is still in flight", async () => {
    const preload = get_translations_async("it");

    mount("it");
    expect(container.textContent).toBe("");

    const loaded = await preload;

    await settle_until(() =>
      expect(container.textContent).toBe(loaded.common.loading),
    );
    expect(shown).toBe(loaded);
    expect(new Set(rendered)).toEqual(new Set([loaded.common.loading]));
  });

  it("renders children on the first render when the locale is already loaded", async () => {
    const loaded = await get_translations_async("es");

    mount("es");

    expect(container.textContent).toBe(loaded.common.loading);
    expect(rendered[0]).toBe(loaded.common.loading);
  });

  it("still loads a different language picked later", async () => {
    mount("en");
    expect(container.textContent).toBe("Loading...");

    act(() => {
      set_language!("pl");
    });
    const polish = await get_translations_async("pl");

    await settle_until(() =>
      expect(container.textContent).toBe(polish.common.loading),
    );

    act(() => {
      set_language!("en");
    });

    expect(container.textContent).toBe("Loading...");
  });
});
