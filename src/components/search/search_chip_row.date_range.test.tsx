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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { SearchChipRow } = await import("./search_chip_row");

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
  document.body.innerHTML = "";
  root = null;
  container = null;
});

function button_with_text(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );

  if (!match) throw new Error(`no button with ${text}`);

  return match;
}

function set_date(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SearchChipRow custom date range", () => {
  it("includes the day picked as the end of the range", () => {
    const on_query_change = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <SearchChipRow
          on_advanced_click={() => {}}
          on_query_change={on_query_change}
          query="encomenda"
        />,
      );
    });

    act(() => {
      button_with_text("mail.chip_any_time").click();
    });
    act(() => {
      button_with_text("mail.chip_custom_range").click();
    });

    const [from, to] = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="date"]'),
    ];

    set_date(from, "2026-09-29");
    set_date(to, "2026-09-29");
    act(() => {
      button_with_text("common.apply").click();
    });

    expect(on_query_change).toHaveBeenLastCalledWith(
      "encomenda after:2026-09-29 before:2026-09-30",
    );
  });
});
