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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { default_filter_state } from "@/utils/search_filter_state";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { SearchModalFilterPanel } = await import("./search_modal_filter_panel");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function render_panel() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <SearchModalFilterPanel
        show_filters
        filters={default_filter_state()}
        on_submit={() => {}}
        set_filters={() => {}}
      />,
    );
  });
}

function placeholder_beside(label: string): string | null {
  const row = [...document.querySelectorAll("label")].find(
    (el) => el.textContent === label,
  )?.parentElement;

  return row?.querySelector("input")?.getAttribute("placeholder") ?? null;
}

describe("SearchModalFilterPanel text fields", () => {
  it("says what to type in every text field of the Message section", () => {
    render_panel();

    expect(placeholder_beside("common.subject_label")).toBe(
      "mail.search_subject_placeholder",
    );
    expect(placeholder_beside("mail.search_has_words")).toBe(
      "mail.search_has_words_placeholder",
    );
    expect(placeholder_beside("mail.search_does_not_have")).toBe(
      "mail.search_does_not_have_placeholder",
    );
  });
});
