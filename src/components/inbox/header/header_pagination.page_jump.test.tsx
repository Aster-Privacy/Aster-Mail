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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

import { HeaderPagination } from "@/components/inbox/header/header_pagination";
import { parse_page_input } from "@/components/inbox/header/page_jump_menu";

const PAGE_SIZE = 50;
const TOTAL = 823;
const PAGE_COUNT = Math.ceil(TOTAL / PAGE_SIZE);

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

function rows_on(page: number): number {
  return Math.min(PAGE_SIZE, TOTAL - page * PAGE_SIZE);
}

function render_pager(
  current_page: number,
  on_page_change: (page: number) => void,
): void {
  act(() => {
    root.render(
      <HeaderPagination
        can_go_next={false}
        can_go_prev={false}
        current_page={current_page}
        filtered_count={TOTAL}
        page_row_count={rows_on(current_page)}
        page_size={PAGE_SIZE}
        total_email_count={0}
        total_pages={PAGE_COUNT}
        on_page_change={on_page_change}
      />,
    );
  });
}

function trigger(): HTMLElement {
  return host.querySelector<HTMLElement>('[data-testid="page-jump-trigger"]')!;
}

function menu_part(test_id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${test_id}"]`);
}

function press(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function open_menu(): void {
  press(trigger(), "Enter");
  expect(menu_part("page-jump-menu")).not.toBeNull();
}

function click(target: Element): void {
  act(() => {
    (target as HTMLElement).click();
  });
}

function type_into(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function flush_frames(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

describe("page jump menu", () => {
  it("shows the clamped range on the trigger", () => {
    render_pager(PAGE_COUNT - 1, vi.fn());

    expect(trigger().textContent).toContain("801-823");
    expect(trigger().textContent).toContain("823");
  });

  it("requests the last page when Oldest is chosen", () => {
    const on_page_change = vi.fn();

    render_pager(3, on_page_change);
    open_menu();
    click(menu_part("page-jump-oldest")!);

    expect(on_page_change).toHaveBeenCalledTimes(1);
    expect(on_page_change).toHaveBeenCalledWith(PAGE_COUNT - 1);
    expect(menu_part("page-jump-menu")).toBeNull();
  });

  it("requests the first page when Newest is chosen", () => {
    const on_page_change = vi.fn();

    render_pager(5, on_page_change);
    open_menu();
    click(menu_part("page-jump-newest")!);

    expect(on_page_change).toHaveBeenCalledWith(0);
  });

  it("disables Oldest on the last page and Newest on the first page", () => {
    const on_page_change = vi.fn();

    render_pager(PAGE_COUNT - 1, on_page_change);
    open_menu();
    expect(menu_part("page-jump-oldest")!.hasAttribute("data-disabled")).toBe(
      true,
    );
    expect(menu_part("page-jump-newest")!.hasAttribute("data-disabled")).toBe(
      false,
    );
    click(menu_part("page-jump-oldest")!);
    expect(on_page_change).not.toHaveBeenCalled();
    press(menu_part("page-jump-menu")!, "Escape");
    expect(menu_part("page-jump-menu")).toBeNull();

    render_pager(0, on_page_change);
    open_menu();
    expect(menu_part("page-jump-newest")!.hasAttribute("data-disabled")).toBe(
      true,
    );
    expect(menu_part("page-jump-oldest")!.hasAttribute("data-disabled")).toBe(
      false,
    );
  });

  it("keeps Oldest disabled while the folder total is unknown", () => {
    act(() => {
      root.render(
        <HeaderPagination
          can_go_next={false}
          can_go_prev={false}
          current_page={2}
          filtered_count={0}
          page_row_count={PAGE_SIZE}
          page_size={PAGE_SIZE}
          total_email_count={0}
          total_pages={4}
          on_page_change={vi.fn()}
        />,
      );
    });
    open_menu();

    expect(menu_part("page-jump-oldest")!.hasAttribute("data-disabled")).toBe(
      true,
    );
  });

  it("opens with Enter, closes with Escape and returns focus to the label", async () => {
    render_pager(4, vi.fn());
    act(() => trigger().focus());
    open_menu();
    await flush_frames();

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    press(menu_part("page-jump-menu")!, "Escape");
    await flush_frames();

    expect(menu_part("page-jump-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("moves from the page field to the menu items with the arrow keys", async () => {
    render_pager(4, vi.fn());
    open_menu();
    click(menu_part("page-jump-go-to")!);
    await flush_frames();

    const input = menu_part("page-jump-input") as HTMLInputElement;

    press(input, "ArrowDown");
    expect(document.activeElement).toBe(menu_part("page-jump-newest"));

    act(() => input.focus());
    press(input, "ArrowUp");
    expect(document.activeElement).toBe(menu_part("page-jump-oldest"));
  });

  it("goes to a typed page and rejects one outside the range", async () => {
    const on_page_change = vi.fn();

    render_pager(1, on_page_change);
    open_menu();
    click(menu_part("page-jump-go-to")!);
    await flush_frames();

    const input = menu_part("page-jump-input") as HTMLInputElement;

    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);

    type_into(input, String(PAGE_COUNT + 1));
    press(input, "Enter");
    expect(on_page_change).not.toHaveBeenCalled();
    expect(menu_part("page-jump-error")).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");

    type_into(input, "1a2");
    expect(input.value).toBe("12");
    expect(menu_part("page-jump-error")).toBeNull();
    press(input, "Enter");

    expect(on_page_change).toHaveBeenCalledWith(11);
    expect(menu_part("page-jump-menu")).toBeNull();
  });

  it("changes the list page from the message counter while a message is open", () => {
    const on_jump_to_page = vi.fn();

    act(() => {
      root.render(
        <HeaderPagination
          can_go_next
          can_go_prev
          current_email_index={4}
          current_page={2}
          filtered_count={TOTAL}
          page_row_count={PAGE_SIZE}
          page_size={PAGE_SIZE}
          total_email_count={TOTAL}
          total_pages={PAGE_COUNT}
          on_jump_to_page={on_jump_to_page}
          on_navigate_next={vi.fn()}
          on_navigate_prev={vi.fn()}
        />,
      );
    });
    open_menu();
    click(menu_part("page-jump-oldest")!);

    expect(on_jump_to_page).toHaveBeenCalledWith(PAGE_COUNT - 1);
  });
});

describe("parse_page_input", () => {
  it("accepts pages within the range only", () => {
    expect(parse_page_input("1", 17)).toBe(0);
    expect(parse_page_input("17", 17)).toBe(16);
    expect(parse_page_input("0", 17)).toBeNull();
    expect(parse_page_input("18", 17)).toBeNull();
    expect(parse_page_input("", 17)).toBeNull();
    expect(parse_page_input("2.5", 17)).toBeNull();
  });
});

describe("header pagination with an empty list", () => {
  function render_empty(list_empty: boolean): void {
    act(() => {
      root.render(
        <HeaderPagination
          can_go_next={false}
          can_go_prev={false}
          current_page={0}
          filtered_count={0}
          list_empty={list_empty}
          page_row_count={0}
          page_size={PAGE_SIZE}
          total_email_count={0}
          total_pages={1}
          on_page_change={vi.fn()}
        />,
      );
    });
  }

  it("keeps a zero range with disabled arrows when nothing matches", () => {
    render_empty(true);

    const pager = host.querySelector<HTMLElement>(
      '[data-testid="header-pagination-empty"]',
    );

    expect(pager).not.toBeNull();
    expect(pager!.textContent).toContain("0 common.of 0");
    const arrows = pager!.querySelectorAll("button");

    expect(arrows).toHaveLength(2);
    arrows.forEach((arrow) => {
      expect(arrow.getAttribute("aria-disabled")).toBe("true");
      expect(arrow.tabIndex).toBe(-1);
    });
    expect(trigger()).toBeNull();
  });

  it("stays hidden while the first page is still loading", () => {
    render_empty(false);

    expect(host.innerHTML).toBe("");
  });
});
