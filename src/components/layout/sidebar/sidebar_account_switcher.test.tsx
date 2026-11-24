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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/layout/storage_meter", () => ({
  scroll_to_storage_addons: vi.fn(),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));

const { SidebarAccountSwitcher } = await import("./sidebar_account_switcher");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(props: {
  is_collapsed?: boolean;
  storage_percentage?: number;
  storage_total_bytes?: number;
  on_settings_click?: (section?: string) => void;
  on_toggle_collapse?: () => void;
}) {
  act(() => {
    root!.render(
      <SidebarAccountSwitcher
        is_collapsed={props.is_collapsed ?? false}
        storage_percentage={props.storage_percentage ?? 42}
        storage_total_bytes={props.storage_total_bytes ?? 1024 ** 3}
        storage_used_bytes={450 * 1024 ** 2}
        on_settings_click={props.on_settings_click ?? (() => {})}
        on_toggle_collapse={props.on_toggle_collapse}
      />,
    );
  });
}

function text_classes(text: string): string[] {
  const node = Array.from(container!.querySelectorAll("span, p, button")).find(
    (element) => element.textContent === text,
  );

  expect(node).toBeDefined();

  return (node as HTMLElement).className.split(/\s+/);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("SidebarAccountSwitcher", () => {
  it("uses readable text sizes for storage and invite", () => {
    render({});

    expect(text_classes("common.storage_used")).toContain("text-[13px]");
    expect(text_classes("42%")).toContain("text-[13px]");
    expect(text_classes("common.buy_more_storage")).toContain("text-xs");
    expect(text_classes("settings.invite_friends").join(" ")).not.toMatch(
      /text-\[(9|10|11)px\]/,
    );
    expect(container!.innerHTML).not.toMatch(/text-\[(9|10|11)px\]/);
  });

  it("reports storage progress and opens the storage settings", () => {
    const on_settings_click = vi.fn();

    render({ on_settings_click });

    const bar = container!.querySelector('[role="progressbar"]');

    expect(bar?.getAttribute("aria-valuenow")).toBe("42");
    act(() =>
      (
        container!.querySelector(
          'button[aria-label="settings.storage"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(on_settings_click).toHaveBeenCalledWith("storage");
  });

  it("colors the meter as critical near the limit", () => {
    render({ storage_percentage: 95 });

    expect(
      (container!.querySelector("[role='progressbar'] > span") as HTMLElement)
        .style.backgroundColor,
    ).toBe("var(--color-danger)");
  });

  it("shows a placeholder until the quota is known", () => {
    render({ storage_total_bytes: 0 });

    expect(
      container!.querySelector('[data-testid="sidebar-storage-loading"]'),
    ).not.toBeNull();
    expect(container!.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("keeps the collapsed rail to icon buttons", () => {
    const on_toggle_collapse = vi.fn();

    render({ is_collapsed: true, on_toggle_collapse });

    expect(container!.querySelector('[role="progressbar"]')).toBeNull();
    expect(container!.querySelectorAll("button.sidebar-rail-btn")).toHaveLength(
      2,
    );
  });
});
