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
import type { StorageAddonItem, UserActiveAddon } from "@/services/api/billing";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}(${Object.values(params).join("|")})` : key,
    language: "en",
  }),
}));

const show_upgrade_plans = vi.fn();

vi.mock("@/stores/upgrade_store", () => ({ show_upgrade_plans }));

const { StorageAddonsSection, OPEN_STORAGE_ADDONS_EVENT } =
  await import("./storage_addons_section");
const { format_price } = await import("@/services/api/billing");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const GB = 1_073_741_824;

function item(
  id: string,
  name: string,
  storage_bytes: number,
  price_cents: number,
  yearly_price_cents: number | null,
): StorageAddonItem {
  return {
    id,
    name,
    storage_bytes,
    price_cents,
    yearly_price_cents,
    billing_period: "month",
    is_active: true,
  };
}

const new_catalog = [
  item("a50", "50 GB", 50 * GB, 199, 1999),
  item("a200", "200 GB", 200 * GB, 499, 4999),
  item("a1t", "1 TB", 1024 * GB, 1299, 12999),
];

const old_catalog = [
  item("o5", "5 GB", 5 * GB, 99, null),
  item("o100", "100 GB", 100 * GB, 499, null),
];

async function render_section(
  addons: StorageAddonItem[],
  options: {
    on_purchase?: (addon: StorageAddonItem) => void;
    active?: UserActiveAddon[];
    percent?: number;
    plan_code?: string;
  } = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StorageAddonsSection
        active_addons={options.active ?? []}
        available_addons={addons}
        current_plan_code={options.plan_code}
        is_action_loading={false}
        on_cancel_addon={() => {}}
        on_purchase_addon={options.on_purchase ?? (() => {})}
        preferred_currency="usd"
        selected_storage={null}
        set_selected_storage={() => {}}
        storage_limit_bytes={options.percent === undefined ? undefined : 100}
        storage_percentage={options.percent}
        storage_used_bytes={options.percent}
      />,
    );
  });
  await act(async () => {
    window.dispatchEvent(new Event(OPEN_STORAGE_ADDONS_EVENT));
  });

  return container;
}

function click(node: Element | null | undefined) {
  return act(async () => {
    node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function button_with(node: HTMLElement, text: string) {
  return Array.from(node.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("StorageAddonsSection", () => {
  it("defaults to yearly and shows the monthly equivalent", async () => {
    const node = await render_section(new_catalog);

    expect(node.querySelector('[aria-pressed="true"]')?.textContent).toContain(
      "settings.billing_yearly",
    );
    expect(node.textContent).toContain(format_price(167, "usd"));
    expect(node.textContent).toContain(
      `settings.billing_billed_yearly_total(${format_price(1999, "usd")})`,
    );
    expect(node.textContent).toContain("settings.billing_save_percent(16)");
  });

  it("features the 200 GB card with the primary action", async () => {
    const node = await render_section(new_catalog);
    const featured = node.querySelector('[data-featured="true"]');

    expect(featured?.textContent).toContain("200 GB");
    expect(featured?.textContent).toContain("settings.popular");
    expect(featured?.textContent).toContain(
      "settings.storage_addon_add_size(200 GB)",
    );
    expect(node.querySelectorAll('[data-featured="true"]')).toHaveLength(1);
  });

  it("shows the Supernova nudge once, below the cards", async () => {
    const node = await render_section(new_catalog);
    const grid = node.querySelector('div[role="group"].grid');
    const nudges = node.textContent?.split(
      "settings.storage_addon_supernova_nudge",
    );

    expect(nudges).toHaveLength(2);
    expect(grid?.textContent).not.toContain(
      "settings.storage_addon_supernova_nudge",
    );

    const link = Array.from(node.querySelectorAll("button")).find(
      (button) => button.textContent === "settings.upgrade_view_plans",
    );

    await click(link);
    expect(show_upgrade_plans).toHaveBeenCalledWith({
      interval: "year",
      plan_code: "supernova",
    });
  });

  it("hides the Supernova nudge from Supernova holders", async () => {
    const node = await render_section(new_catalog, { plan_code: "supernova" });

    expect(node.textContent).not.toContain(
      "settings.storage_addon_supernova_nudge",
    );
  });

  it("sends the chosen interval with the purchase", async () => {
    const bought: StorageAddonItem[] = [];
    const node = await render_section(new_catalog, {
      on_purchase: (addon) => bought.push(addon),
    });

    await click(button_with(node, "storage_addon_add_size(50 GB)"));
    await click(button_with(node, "settings.billing_monthly"));
    await click(button_with(node, "storage_addon_add_size(200 GB)"));

    expect(bought.map((addon) => [addon.id, addon.billing_interval])).toEqual([
      ["a50", "year"],
      ["a200", "month"],
    ]);
    expect(node.textContent).toContain(format_price(499, "usd"));
    expect(node.textContent).toContain("settings.billing_billed_monthly");
  });

  it("hides the switch and bills monthly for the old catalog", async () => {
    const bought: StorageAddonItem[] = [];
    const node = await render_section(old_catalog, {
      on_purchase: (addon) => bought.push(addon),
    });

    expect(node.querySelector(".aster_segmented")).toBeNull();
    expect(node.textContent).not.toContain("settings.billing_save_percent");
    expect(node.textContent).toContain(format_price(99, "usd"));

    await click(button_with(node, "storage_addon_add_size(100 GB)"));

    expect(bought[0]?.billing_interval).toBe("month");
  });

  it("keeps a holder's own price", async () => {
    const node = await render_section(new_catalog, {
      active: [
        {
          user_addon_id: "u1",
          addon_id: "legacy",
          size_label: "100 GB",
          size_bytes: 100 * GB,
          price_cents: 299,
          billing_period: "month",
          state: "active",
          created_at: "2026-01-01T00:00:00Z",
          cancel_at_period_end: false,
        },
      ],
    });

    expect(node.textContent).toContain(
      `${format_price(299, "usd")}settings.per_month_short`,
    );
  });

  it("nudges only when usage is high", async () => {
    const calm = await render_section(new_catalog, { percent: 40 });

    expect(calm.textContent).not.toContain("storage_addon_usage_");
    await act(async () => root!.unmount());
    root = null;
    calm.remove();

    const near = await render_section(new_catalog, { percent: 85 });

    expect(near.textContent).toContain("settings.storage_addon_usage_near");
  });
});
