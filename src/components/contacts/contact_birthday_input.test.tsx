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

import { ContactBirthdayInput } from "./contact_birthday_input";

import { set_display_locale } from "@/utils/date_format";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

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

function render_input(value: string, on_change = vi.fn()) {
  act(() => {
    root.render(
      <ContactBirthdayInput
        label="Birthday"
        on_change={on_change}
        value={value}
      />,
    );
  });

  return on_change;
}

function selects(): HTMLSelectElement[] {
  return [...container.querySelectorAll("select")];
}

function month_select(): HTMLSelectElement {
  return selects().find((el) =>
    el.getAttribute("aria-label")?.includes("birthday_month"),
  )!;
}

function day_select(): HTMLSelectElement {
  return selects().find((el) =>
    el.getAttribute("aria-label")?.includes("birthday_day"),
  )!;
}

function year_input(): HTMLInputElement {
  return container.querySelector("input")!;
}

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function type_year(value: string) {
  const input = year_input();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ContactBirthdayInput", () => {
  it("saves a birthday with only a month and a day", () => {
    const on_change = render_input("");

    choose(month_select(), "5");
    choose(day_select(), "15");

    expect(on_change).toHaveBeenLastCalledWith("--05-15");
    expect(year_input().value).toBe("");
  });

  it("adds and removes an optional year", () => {
    const on_change = render_input("--05-15");

    type_year("1990");
    expect(on_change).toHaveBeenLastCalledWith("1990-05-15");

    type_year("");
    expect(on_change).toHaveBeenLastCalledWith("--05-15");
  });

  it("does not save a partly typed year", () => {
    const on_change = render_input("--05-15");

    type_year("19");

    expect(on_change).not.toHaveBeenCalled();
  });

  it("shows a stored year-less birthday in the fields", () => {
    render_input("--02-29");

    expect(month_select().value).toBe("2");
    expect(day_select().value).toBe("29");
    expect(year_input().value).toBe("");
  });

  it("offers February 29 only when the year allows it", () => {
    const on_change = render_input("--02-29");

    type_year("2023");

    expect(day_select().value).toBe("28");
    expect(on_change).toHaveBeenLastCalledWith("2023-02-28");
  });

  it("clears the birthday when the month and day are emptied", () => {
    const on_change = render_input("--05-15");

    choose(day_select(), "");
    expect(on_change).toHaveBeenLastCalledWith("--05");

    choose(month_select(), "");
    expect(on_change).toHaveBeenLastCalledWith("");
  });
});
