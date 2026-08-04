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
import type { CategoryCounts } from "@/services/category_index";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      enabled_categories: ["promotions", "social"],
      custom_categories: [],
    },
  }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: null }),
}));

vi.mock("@/hooks/use_category_previews", () => ({
  use_category_previews: () => ({
    promotions: { sender: "Paybis Team", subject: "Get 20% off this week" },
  }),
}));

const { CategoryTabs } = await import("./category_tabs");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const counts = {
  primary: { total: 4, unread: 1, new_count: 0 },
  promotions: { total: 60, unread: 42, new_count: 42 },
  social: { total: 3, unread: 0, new_count: 0 },
} as unknown as CategoryCounts;

function tab_of(el: HTMLDivElement, label: string): HTMLButtonElement {
  const found = Array.from(el.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );

  expect(found, `no tab labelled ${label}`).toBeTruthy();

  return found as HTMLButtonElement;
}

describe("CategoryTabs", () => {
  it("colors the new badge with the category token", () => {
    const el = render(
      <CategoryTabs
        active_category="primary"
        counts={counts}
        on_change={() => {}}
      />,
    );
    const promotions = tab_of(el, "category_promotions");
    const badge = promotions.querySelector(".aster_cat_badge");

    expect(badge?.textContent).toContain("42");
    expect(promotions.style.getPropertyValue("--cat-fg")).toBe(
      "var(--cat-green-fg)",
    );
    expect(promotions.style.getPropertyValue("--cat-soft")).toBe(
      "var(--cat-green-soft)",
    );
  });

  it("leaves the icon on the neutral text color", () => {
    const el = render(
      <CategoryTabs
        active_category="primary"
        counts={counts}
        on_change={() => {}}
      />,
    );
    const icon = tab_of(el, "category_promotions").querySelector("svg");

    expect(icon?.getAttribute("class")).toContain("text-txt-muted");
    expect(icon?.getAttribute("class")).not.toContain("--cat-fg");
  });

  it("keeps the active tab on the brand color, not the category color", () => {
    const el = render(
      <CategoryTabs
        active_category="primary"
        counts={counts}
        on_change={() => {}}
      />,
    );
    const primary = tab_of(el, "category_primary");

    expect(primary.className).toContain("text-brand");
    expect(primary.querySelector("svg")?.getAttribute("class")).toContain(
      "text-brand",
    );
  });

  it("shows the preview line only for a tab with new mail", () => {
    const el = render(
      <CategoryTabs
        active_category="primary"
        counts={counts}
        on_change={() => {}}
      />,
    );

    expect(tab_of(el, "category_promotions").textContent).toContain(
      "Paybis Team",
    );
    expect(tab_of(el, "category_social").textContent).not.toContain("Paybis");
  });

  it("hides the preview and the new badge on the tab you are viewing", () => {
    const el = render(
      <CategoryTabs
        active_category="promotions"
        counts={counts}
        on_change={() => {}}
      />,
    );
    const promotions = tab_of(el, "category_promotions");

    expect(promotions.querySelector(".aster_cat_badge")).toBeNull();
    expect(promotions.textContent).not.toContain("Paybis Team");
  });

  it("falls back to the plain unread pill when nothing is new", () => {
    const el = render(
      <CategoryTabs
        active_category="promotions"
        counts={counts}
        on_change={() => {}}
      />,
    );
    const primary = tab_of(el, "category_primary");

    expect(primary.querySelector(".aster_cat_badge")).toBeNull();
    expect(primary.textContent).toContain("1");
  });

  it("keeps every tab the same height whether or not it has a preview", () => {
    const el = render(
      <CategoryTabs
        active_category="primary"
        counts={counts}
        on_change={() => {}}
      />,
    );
    const with_preview = tab_of(el, "category_promotions");
    const without_preview = tab_of(el, "category_social");
    const classes_of = (tab: HTMLButtonElement) => tab.className.split(" ");

    for (const tab of [with_preview, without_preview]) {
      expect(classes_of(tab)).toContain("h-[56px]");
      expect(classes_of(tab)).toContain("items-center");
    }

    expect(with_preview.querySelector("span.h-\\[13px\\]")).toBeTruthy();
    expect(without_preview.querySelector("span.h-\\[13px\\]")).toBeNull();
    expect(with_preview.querySelector("span.w-\\[168px\\]")).toBeTruthy();
    expect(without_preview.querySelector("span.w-\\[168px\\]")).toBeNull();
  });
});
