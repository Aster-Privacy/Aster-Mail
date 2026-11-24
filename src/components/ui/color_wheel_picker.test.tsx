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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ColorSwatchRow, ColorWheelPanel } from "./color_wheel_picker";

import { COLOR_ROW_PRESET_HEXES } from "@/lib/color_wheel";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

function swatches(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      "[data-color-swatch-row] > button",
    ),
  );
}

function selected(): HTMLButtonElement[] {
  return swatches().filter((b) => b.dataset.selected === "true");
}

function hex_input(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="common.color_hex"]',
  );

  if (!input) throw new Error("hex input missing");

  return input;
}

function type_into(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press_enter(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

describe("ColorSwatchRow", () => {
  it("renders eight presets followed by the custom swatch", () => {
    render(<ColorSwatchRow value="#3b82f6" on_change={() => {}} />);

    const buttons = swatches();

    expect(buttons).toHaveLength(9);
    expect(
      buttons.slice(0, 8).map((b) => b.style.backgroundColor !== ""),
    ).toEqual(Array(8).fill(true));
    expect(buttons[8].hasAttribute("data-custom-color-swatch")).toBe(true);
  });

  it("selects exactly the matching preset", () => {
    render(<ColorSwatchRow value="#3B82F6" on_change={() => {}} />);

    expect(selected()).toHaveLength(1);
    expect(selected()[0].getAttribute("aria-label")).toBe("common.color_blue");
    expect(selected()[0].querySelector("[data-swatch-check]")).not.toBeNull();
  });

  it("shows a stored color outside the row as the selected custom swatch", () => {
    render(<ColorSwatchRow value="#6366f1" on_change={() => {}} />);

    expect(selected()).toHaveLength(1);
    expect(selected()[0].hasAttribute("data-custom-color-swatch")).toBe(true);
    expect(selected()[0].querySelector("[data-swatch-check]")).not.toBeNull();
  });

  it("shows the rainbow custom swatch when a preset is selected", () => {
    render(<ColorSwatchRow value="#ef4444" on_change={() => {}} />);

    const custom = swatches()[8];

    expect(custom.dataset.selected).toBeUndefined();
    expect(custom.style.backgroundImage).toContain("conic-gradient");
  });

  it("emits the preset hex and commits only on change", () => {
    const on_change = vi.fn();
    const on_commit = vi.fn();

    render(
      <ColorSwatchRow
        value="#ef4444"
        on_change={on_change}
        on_commit={on_commit}
      />,
    );
    act(() => swatches()[0].click());
    act(() => swatches()[5].click());

    expect(on_change).toHaveBeenNthCalledWith(1, COLOR_ROW_PRESET_HEXES[0]);
    expect(on_change).toHaveBeenNthCalledWith(2, "#3b82f6");
    expect(on_commit).toHaveBeenCalledTimes(1);
    expect(on_commit).toHaveBeenCalledWith("#3b82f6");
  });
});

describe("ColorWheelPanel hex field", () => {
  it("does not flag a partial value while typing", () => {
    const on_change = vi.fn();

    render(<ColorWheelPanel value="#3b82f6" on_change={on_change} />);
    type_into(hex_input(), "#12");

    expect(hex_input().getAttribute("aria-invalid")).toBe("false");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(on_change).not.toHaveBeenCalled();
  });

  it("applies a complete valid value while typing", () => {
    const on_change = vi.fn();

    render(<ColorWheelPanel value="#3b82f6" on_change={on_change} />);
    type_into(hex_input(), "7c2d92");

    expect(on_change).toHaveBeenCalledWith("#7c2d92");
  });

  it("flags an invalid value on Enter and keeps the last valid color", () => {
    const on_change = vi.fn();

    render(<ColorWheelPanel value="#3b82f6" on_change={on_change} />);
    type_into(hex_input(), "12zz");
    press_enter(hex_input());

    expect(hex_input().getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "common.color_hex_invalid",
    );
    expect(on_change).not.toHaveBeenCalled();
  });

  it("accepts a short hex on blur and clears the message", () => {
    const on_change = vi.fn();

    render(<ColorWheelPanel value="#3b82f6" on_change={on_change} />);
    type_into(hex_input(), "zz");
    press_enter(hex_input());
    type_into(hex_input(), "#f0a");

    expect(container.querySelector('[role="alert"]')).toBeNull();
    act(() => {
      hex_input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(on_change).toHaveBeenCalledWith("#ff00aa");
  });
});
