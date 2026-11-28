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

const select_events = vi.hoisted(() => [] as Event[]);

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    ...rest
  }: {
    children: ReactNode;
    onSelect?: (event: Event) => void;
    [key: string]: unknown;
  }) => (
    <div
      {...rest}
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        const event = new Event("select", { cancelable: true });

        select_events.push(event);
        onSelect?.(event);
      }}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

const { SenderAddressCopyRow, SENDER_ADDRESS_COPIED_RESET_MS } =
  await import("./sender_address_copy_row");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "frost.marshsxt3dhs6@realiased.me";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  select_events.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function render_row(on_copy: () => Promise<boolean>): HTMLElement {
  act(() => {
    root!.render(<SenderAddressCopyRow email={ADDRESS} on_copy={on_copy} />);
  });

  return container!.querySelector<HTMLElement>(
    '[data-testid="sender_address_copy_row"]',
  )!;
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}

function icon_markup(row: HTMLElement): string {
  return row.querySelector('[data-testid="sender_address_copy_icon"]')!
    .outerHTML;
}

describe("SenderAddressCopyRow", () => {
  it("renders as a menu row with the address and one trailing icon", () => {
    const row = render_row(() => Promise.resolve(true));
    const value = row.querySelector(
      '[data-testid="sender_address_copy_value"]',
    )!;

    expect(row.getAttribute("role")).toBe("menuitem");
    expect(row.getAttribute("aria-label")).toBe("common.copy_address");
    expect(row.getAttribute("data-copied")).toBe("false");
    expect(value.textContent).toBe(ADDRESS);
    expect(value.getAttribute("dir")).toBe("ltr");
    expect(value.className).toContain("truncate");
    expect(row.querySelectorAll("svg")).toHaveLength(1);
    expect(row.querySelector("button")).toBeNull();
  });

  it("uses theme tokens and no filled or bordered pill", () => {
    const row = render_row(() => Promise.resolve(true));
    const classes = `${row.className} ${icon_markup(row)}`;

    expect(row.className).toContain("text-txt-secondary");
    expect(classes).not.toMatch(/\bbg-(black|surf-|\[#)/);
    expect(classes).not.toMatch(/\bborder\b|\bborder-edge/);
    expect(classes).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("copies on select and keeps the copy icon while the status resets", async () => {
    vi.useFakeTimers();
    const on_copy = vi.fn(() => Promise.resolve(true));
    const row = render_row(on_copy);
    const idle_icon = icon_markup(row);

    await click(row);

    expect(on_copy).toHaveBeenCalledTimes(1);
    expect(row.getAttribute("data-copied")).toBe("true");
    expect(row.querySelector('[role="status"]')!.textContent).toBe(
      "common.copied",
    );
    expect(icon_markup(row)).toBe(idle_icon);

    act(() => {
      vi.advanceTimersByTime(SENDER_ADDRESS_COPIED_RESET_MS);
    });

    expect(row.getAttribute("data-copied")).toBe("false");
    expect(row.querySelector('[role="status"]')!.textContent).toBe("");
    expect(icon_markup(row)).toBe(idle_icon);
  });

  it("keeps the idle state when the copy fails", async () => {
    const on_copy = vi.fn(() => Promise.resolve(false));
    const row = render_row(on_copy);

    await click(row);

    expect(on_copy).toHaveBeenCalledTimes(1);
    expect(row.getAttribute("data-copied")).toBe("false");
  });

  it("keeps the menu open when the row is selected", async () => {
    const row = render_row(() => Promise.resolve(true));

    await click(row);

    expect(select_events).toHaveLength(1);
    expect(select_events[0].defaultPrevented).toBe(true);
  });
});
