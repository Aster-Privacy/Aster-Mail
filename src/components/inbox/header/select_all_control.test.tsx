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
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", async (load) => ({
  ...(await load<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown_menu", () => {
  const pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    DropdownMenu: pass,
    DropdownMenuTrigger: pass,
    DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuLabel: ({ children }: { children?: ReactNode }) => (
      <div data-testid="menu-label">{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onClick,
      ...rest
    }: {
      children?: ReactNode;
      onClick?: () => void;
    }) => (
      <div role="menuitem" tabIndex={-1} onClick={onClick} {...rest}>
        {children}
      </div>
    ),
  };
});

import { SelectAllControl } from "@/components/inbox/header/select_all_control";

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
  document.body.innerHTML = "";
});

function render_control(
  props: Partial<Parameters<typeof SelectAllControl>[0]> = {},
) {
  const on_toggle = vi.fn();

  act(() => {
    root.render(
      <SelectAllControl
        all_selected={false}
        compact={false}
        on_toggle={on_toggle}
        show_profile_pictures={true}
        some_selected={false}
        {...props}
      />,
    );
  });

  return { on_toggle };
}

function by_test_id(id: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  if (!el) throw new Error(`missing ${id}`);

  return el;
}

function checkbox_input(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]');

  if (!input) throw new Error("missing checkbox input");

  return input;
}

describe("SelectAllControl", () => {
  it("toggles from a click and from the keyboard", () => {
    const { on_toggle } = render_control();
    const toggle = by_test_id("list-select-toggle");

    act(() => toggle.click());
    act(() => {
      toggle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      toggle.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(on_toggle).toHaveBeenCalledTimes(3);
    expect(toggle.getAttribute("tabindex")).toBe("0");
  });

  it("reports unchecked, mixed and checked states", () => {
    render_control();
    expect(by_test_id("list-select-toggle").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(by_test_id("list-select-toggle").getAttribute("aria-label")).toBe(
      "common.select_all",
    );
    expect(checkbox_input().checked).toBe(false);
    expect(checkbox_input().indeterminate).toBe(false);

    render_control({ some_selected: true });
    expect(by_test_id("list-select-toggle").getAttribute("aria-checked")).toBe(
      "mixed",
    );
    expect(by_test_id("list-select-toggle").getAttribute("aria-label")).toBe(
      "common.deselect_all",
    );
    expect(checkbox_input().indeterminate).toBe(true);
    expect(checkbox_input().checked).toBe(false);

    render_control({ all_selected: true, some_selected: true });
    expect(by_test_id("list-select-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(checkbox_input().checked).toBe(true);
    expect(checkbox_input().indeterminate).toBe(false);
  });

  it("keeps the checkbox out of the tab order inside the control", () => {
    render_control();
    expect(checkbox_input().tabIndex).toBe(-1);
  });

  it("hides the menu arrow without a filter handler and pads both ends", () => {
    render_control({ show_profile_pictures: false });

    expect(host.querySelector('[data-testid="list-select-menu"]')).toBeNull();
    const control = by_test_id("list-select-control");

    const toggle = by_test_id("list-select-toggle");

    expect(control.style.marginInlineStart).toBe("-8px");
    expect(toggle.style.paddingInlineStart).toBe("8px");
    expect(toggle.style.paddingInlineEnd).toBe("8px");
  });

  it("pulls the menu arrow up to the checkbox edge", () => {
    render_control({ on_select_by_filter: vi.fn() });

    expect(by_test_id("list-select-menu").style.marginInlineStart).toBe("-7px");
    expect(by_test_id("list-select-toggle").style.paddingInlineEnd).toMatch(
      /^0(px)?$/,
    );
    expect(by_test_id("list-select-menu").getAttribute("aria-label")).toBe(
      "common.select_label",
    );
  });

  it("lists every selection filter under a menu label", () => {
    const on_select_by_filter = vi.fn();

    render_control({ on_select_by_filter });

    expect(by_test_id("menu-label").textContent).toBe("common.select_label");
    const items = Array.from(
      host.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );

    expect(items.map((item) => item.textContent)).toEqual([
      "common.all_short",
      "common.select_none",
      "common.select_read",
      "common.select_unread",
      "common.select_starred",
      "common.select_unstarred",
    ]);

    act(() => by_test_id("list-select-unread").click());
    act(() => by_test_id("list-select-none").click());
    expect(on_select_by_filter.mock.calls).toEqual([["unread"], ["none"]]);
  });
});
