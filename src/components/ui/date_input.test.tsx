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
import type { PreferencesContextType } from "@/contexts/preferences_context/helpers";
import type { WeekStartPreference } from "@/utils/week_start";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { DateInput, parse_iso_date, to_iso_date } = await import(
  "./date_input"
);
const { PreferencesContext } = await import(
  "@/contexts/preferences_context/helpers"
);
const { DEFAULT_PREFERENCES } = await import("@/services/api/preferences");

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

function render_input(
  week_start: WeekStartPreference | undefined,
  props: { value: string; min?: string; max?: string },
  on_change: (value: string) => void = () => {},
) {
  const context = {
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(week_start ? { calendar_week_starts_on: week_start } : {}),
    },
  } as unknown as PreferencesContextType;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <PreferencesContext.Provider value={context}>
        <DateInput aria_label="pick" on_change={on_change} {...props} />
      </PreferencesContext.Provider>,
    );
  });
  act(() => {
    document.querySelector<HTMLButtonElement>('[aria-label="pick"]')!.click();
  });
}

function first_weekday_label(): string | null {
  const header = document.querySelector("th[aria-label]");

  return header?.getAttribute("aria-label") ?? null;
}

describe("iso date helpers", () => {
  it("round trips a calendar day without shifting it", () => {
    const date = parse_iso_date("2026-03-08");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(8);
    expect(to_iso_date(date!)).toBe("2026-03-08");
  });

  it("rejects malformed and impossible dates", () => {
    expect(parse_iso_date("")).toBeUndefined();
    expect(parse_iso_date("2026-3-8")).toBeUndefined();
    expect(parse_iso_date("2026-02-31")).toBeUndefined();
  });
});

describe("DateInput week start", () => {
  it("starts the grid on sunday when no week start is saved", () => {
    render_input(undefined, { value: "2026-09-15" });
    expect(first_weekday_label()).toMatch(/sunday/i);
  });

  it("starts the grid on monday when Aster Calendar saved monday", () => {
    render_input("monday", { value: "2026-09-15" });
    expect(first_weekday_label()).toMatch(/monday/i);
  });

  it("starts the grid on saturday when Aster Calendar saved saturday", () => {
    render_input("saturday", { value: "2026-09-15" });
    expect(first_weekday_label()).toMatch(/saturday/i);
  });
});

describe("DateInput selection", () => {
  it("reports the picked day as an iso date", () => {
    const on_change = vi.fn();

    render_input("monday", { value: "2026-09-15" }, on_change);
    act(() => {
      document
        .querySelector<HTMLButtonElement>('[data-day="2026-09-29"] button')!
        .click();
    });

    expect(on_change).toHaveBeenCalledWith("2026-09-29");
  });

  it("disables days outside the min and max range", () => {
    render_input("monday", {
      value: "2026-09-15",
      min: "2026-09-10",
      max: "2026-09-20",
    });

    const before = document.querySelector<HTMLButtonElement>(
      '[data-day="2026-09-09"] button',
    );
    const inside = document.querySelector<HTMLButtonElement>(
      '[data-day="2026-09-12"] button',
    );
    const after = document.querySelector<HTMLButtonElement>(
      '[data-day="2026-09-21"] button',
    );

    expect(before?.disabled).toBe(true);
    expect(inside?.disabled).toBe(false);
    expect(after?.disabled).toBe(true);
  });

  it("clears the value", () => {
    const on_change = vi.fn();

    render_input(undefined, { value: "2026-09-15" }, on_change);
    const clear = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "common.clear",
    );

    act(() => {
      clear!.click();
    });

    expect(on_change).toHaveBeenCalledWith("");
  });
});
