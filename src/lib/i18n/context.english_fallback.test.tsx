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
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const english_module = vi.hoisted(() => ({ reads: 0 }));

vi.mock("./translations/en", async (import_original) => {
  const actual = await import_original<typeof import("./translations/en")>();

  return {
    get en() {
      english_module.reads += 1;

      return actual.en;
    },
  };
});

vi.mock("./translations/nl", async (import_original) => {
  const actual = await import_original<typeof import("./translations/nl")>();
  const common: Record<string, string> = { ...actual.nl.common };

  delete common.loading;

  return { nl: { ...actual.nl, common } };
});

let context: typeof import("./context");
let translations: typeof import("./translations");
let container: HTMLDivElement;
let root: Root | null = null;

function Probe() {
  return <span>{context.use_i18n().t("common.loading")}</span>;
}

function mount(language: "en" | "pt" | "nl") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      <context.I18nProvider default_language={language}>
        <Probe />
      </context.I18nProvider>,
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

beforeEach(async () => {
  vi.resetModules();
  context = await import("./context");
  translations = await import("./translations");
  english_module.reads = 0;
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  localStorage.clear();
});

describe("english strings load on demand", () => {
  it("renders a complete locale without loading English", async () => {
    localStorage.setItem("astermail_language", "pt");
    const portuguese = await translations.get_translations_async("pt");

    mount("pt");

    expect(container.textContent).toBe(portuguese.common.loading);
    expect(translations.get_active_translations()).toBe(portuguese);
    expect(english_module.reads).toBe(0);
    expect(translations.get_cached_translations("en")).toBeUndefined();
  });

  it("shows English for a key the locale lacks once English loads", async () => {
    mount("nl");

    await settle_until(() => expect(container.textContent).toBe("Loading..."));
    expect(english_module.reads).toBe(1);
    expect(translations.get_cached_translations("nl")?.common.loading).toBe(
      "Loading...",
    );
  });

  it("starts loading English before the first render for an English user", async () => {
    localStorage.setItem("astermail_language", "en");

    expect(context.preload_initial_language()).toBe(true);

    mount("en");

    expect(container.textContent).toBe("");
    await settle_until(() => expect(container.textContent).toBe("Loading..."));
    expect(english_module.reads).toBe(1);
  });
});
