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
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { I18nProvider, use_i18n } from "./context";
import { get_translations_async } from "./translations";

let container: HTMLDivElement;
let root: Root;

function Probe() {
  return <span>{use_i18n().t("common.loading")}</span>;
}

function mount(language: "en" | "fr") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root.render(
      <I18nProvider default_language={language}>
        <Probe />
      </I18nProvider>,
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("initial language gate", () => {
  it("renders nothing before the selected locale resolves", () => {
    mount("fr");

    expect(container.textContent).toBe("");
  });

  it("renders the selected locale once it resolves", async () => {
    await get_translations_async("fr");
    mount("fr");
    await settle();

    expect(container.textContent).toBe("Chargement...");
  });

  it("renders english immediately", () => {
    mount("en");

    expect(container.textContent).toBe("Loading...");
  });
});
