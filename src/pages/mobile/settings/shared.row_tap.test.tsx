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
import { Switch } from "@aster/ui";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/hooks/use_platform", () => ({
  use_platform: () => ({
    safe_area_insets: { top: 0, bottom: 0, left: 0, right: 0 },
  }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

const { SettingsRow } = await import("./shared");

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render_row(node: React.ReactNode) {
  act(() => root.render(node));
}

function row_element(): HTMLElement {
  const el = host.querySelector("div.cursor-pointer") as HTMLElement | null;

  expect(el).not.toBeNull();

  return el as HTMLElement;
}

function toggle_input(): HTMLInputElement {
  const el = host.querySelector(
    "input.aster_switch_input",
  ) as HTMLInputElement | null;

  expect(el).not.toBeNull();

  return el as HTMLInputElement;
}

function label_span(): HTMLElement {
  const el = host.querySelector("span.min-w-0") as HTMLElement | null;

  expect(el).not.toBeNull();

  return el as HTMLElement;
}

describe("mobile settings row", () => {
  it("toggles the row switch when the label text is tapped", () => {
    const on_change = vi.fn();

    render_row(
      <SettingsRow
        label="Conversation grouping"
        trailing={<Switch checked={false} onCheckedChange={on_change} />}
      />,
    );

    act(() => {
      label_span().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(on_change).toHaveBeenCalledTimes(1);
    expect(on_change).toHaveBeenCalledWith(true);
  });

  it("toggles once, not twice, when the switch itself is tapped", () => {
    const on_change = vi.fn();

    render_row(
      <SettingsRow
        label="Conversation grouping"
        trailing={<Switch checked={false} onCheckedChange={on_change} />}
      />,
    );

    act(() => {
      toggle_input().click();
    });

    expect(on_change).toHaveBeenCalledTimes(1);
  });

  it("gives the switch an accessible name from the row label", () => {
    render_row(
      <SettingsRow
        label="Sender pictures"
        trailing={<Switch checked={true} onCheckedChange={() => {}} />}
      />,
    );

    const described_by = toggle_input().getAttribute("aria-labelledby");

    expect(described_by).toBeTruthy();
    expect(document.getElementById(described_by as string)?.textContent).toBe(
      "Sender pictures",
    );
  });

  it("keeps an explicit switch label instead of overriding it", () => {
    render_row(
      <SettingsRow
        label="Row label"
        trailing={
          <Switch
            aria-label="Explicit label"
            checked={false}
            onCheckedChange={() => {}}
          />
        }
      />,
    );

    expect(toggle_input().getAttribute("aria-label")).toBe("Explicit label");
    expect(toggle_input().getAttribute("aria-labelledby")).toBeNull();
  });

  it("does not toggle a disabled switch from a row tap", () => {
    const on_change = vi.fn();

    render_row(
      <SettingsRow
        label="Locked setting"
        trailing={
          <Switch disabled checked={false} onCheckedChange={on_change} />
        }
      />,
    );

    act(() => {
      label_span().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(on_change).not.toHaveBeenCalled();
  });

  it("does nothing when the row has no toggle to activate", () => {
    render_row(<SettingsRow label="Plain row" trailing={<span>Off</span>} />);

    expect(() =>
      act(() => {
        row_element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }),
    ).not.toThrow();
  });
});
