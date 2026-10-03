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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TypedList } from "./fields";

import { set_display_locale } from "@/utils/date_format";

const t = (key: string) => key;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  set_display_locale("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  set_display_locale(undefined);
});

function render_dates(value: string, on_change = vi.fn()) {
  act(() => {
    root.render(
      <TypedList
        disabled={false}
        entries={[{ value, type: "anniversary" }]}
        input_type="date"
        options={["anniversary", "other"]}
        placeholder="YYYY-MM-DD"
        t={t}
        type_default="anniversary"
        on_add={() => {}}
        on_change={on_change}
        on_remove={() => {}}
        on_type_change={() => {}}
      />,
    );
  });

  return on_change;
}

describe("TypedList dates", () => {
  it("shows a yearless date as text with a clear button instead of a blank picker", () => {
    const on_change = render_dates("--05-15");
    const input = container.querySelector("input") as HTMLInputElement;

    expect(input.type).toBe("text");
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe("May 15");

    const clear = container.querySelector(
      'button[aria-label="common.clear"]',
    ) as HTMLButtonElement;

    act(() => clear.click());
    expect(on_change).toHaveBeenCalledWith(0, "");
  });

  it.each([
    ["--04", "April"],
    ["1985-04", "April 1985"],
    ["1604-04-15", "April 15"],
  ])(
    "shows the partial date %s as text instead of a blank picker",
    (value, shown) => {
      const on_change = render_dates(value);
      const input = container.querySelector("input") as HTMLInputElement;

      expect(input.type).toBe("text");
      expect(input.readOnly).toBe(true);
      expect(input.value).toBe(shown);
      expect(on_change).not.toHaveBeenCalled();

      const clear = container.querySelector(
        'button[aria-label="common.clear"]',
      ) as HTMLButtonElement;

      act(() => clear.click());
      expect(on_change).toHaveBeenCalledWith(0, "");
    },
  );

  it("fills the picker for a dated value in basic form", () => {
    render_dates("19900515");
    const input = container.querySelector("input") as HTMLInputElement;

    expect(input.type).toBe("date");
    expect(input.value).toBe("1990-05-15");
    expect(
      container.querySelector('button[aria-label="common.clear"]'),
    ).toBeNull();
  });
});
