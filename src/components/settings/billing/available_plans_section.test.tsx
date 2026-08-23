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

import { AvailablePlansSection } from "./available_plans_section";

import { type SubscriptionResponse } from "@/services/api/billing";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}|${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/components/settings/billing/plan_card", () => ({
  PlanCard: ({
    name,
    badge,
    featured,
  }: {
    name: string;
    badge?: string | null;
    featured?: boolean;
  }) => (
    <div
      data-badge={badge ?? ""}
      data-featured={String(!!featured)}
      data-plan={name}
    >
      {name}
    </div>
  ),
  Segmented: () => <div />,
}));

vi.mock("@/components/settings/billing/use_currency_rates", () => ({
  use_currency_rates: () => undefined,
}));

const scroll_spy = vi.fn();

vi.mock("@/components/layout/storage_meter", () => ({
  scroll_to_storage_addons: () => scroll_spy(),
}));

vi.mock("@/components/settings/billing/plan_payment_method_modal", () => ({
  PlanPaymentMethodModal: () => null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/services/api/family", () => ({
  create_family_group: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const gb = (n: number) => n * 1024 * 1024 * 1024;

const subscription_for = (
  code: string,
  used_bytes: number,
  total_limit_bytes: number,
): SubscriptionResponse =>
  ({
    plan: { code, name: code },
    storage: { used_bytes, total_limit_bytes },
  }) as unknown as SubscriptionResponse;

describe("AvailablePlansSection plan recommendation", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_section = async (subscription: SubscriptionResponse | null) => {
    await act(async () => {
      root.render(
        <AvailablePlansSection
          billing_period="yearly"
          current_billing_interval="year"
          handle_currency_change={vi.fn()}
          is_action_loading={false}
          on_upgrade={vi.fn()}
          plan_features={{}}
          plans={[]}
          preferred_currency="usd"
          set_billing_period={vi.fn()}
          subscription={subscription}
        />,
      );
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    scroll_spy.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("acknowledges a top-tier subscriber instead of recommending an upgrade", async () => {
    await render_section(subscription_for("family", gb(100), gb(3000)));

    expect(container.textContent).toContain("settings.plan_top_tier_title");
    expect(container.textContent).toContain('"plan":"Family"');
    expect(container.textContent).toContain("settings.plan_add_storage_link");
    expect(container.textContent).not.toContain(
      "settings.plan_storage_tight_note",
    );
    expect(
      container.querySelectorAll('[data-badge="settings.recommended"]').length,
    ).toBe(0);
  });

  it("scrolls to the storage add-ons when the top-tier link is used", async () => {
    await render_section(subscription_for("supernova", gb(10), gb(500)));

    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("settings.plan_add_storage_link"),
    );

    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(scroll_spy).toHaveBeenCalledTimes(1);
  });

  it("names the current plan while recommending the next tier up", async () => {
    await render_section(subscription_for("star", gb(90), gb(100)));

    expect(container.textContent).toContain("settings.plan_current_title");
    expect(container.textContent).toContain('"plan":"Star"');
    expect(container.textContent).toContain("settings.plan_storage_tight_note");
    expect(container.textContent).toContain('"percent":90');
    expect(container.textContent).toContain('"plan":"Nova"');
    expect(container.textContent).not.toContain("settings.plan_top_tier_title");
  });

  it("names the current plan and suggests nothing when there is room to spare", async () => {
    await render_section(subscription_for("star", gb(1), gb(100)));

    expect(container.textContent).toContain("settings.plan_current_title");
    expect(container.textContent).toContain('"plan":"Star"');
    expect(container.textContent).toContain("settings.plan_current_note");
    expect(container.textContent).not.toContain("settings.plan_top_tier_title");
    expect(container.textContent).not.toContain(
      "settings.plan_storage_tight_note",
    );
    expect(container.querySelectorAll('[data-featured="true"]').length).toBe(0);
  });

  it("still guides an unpaid visitor toward a plan", async () => {
    await render_section(subscription_for("free", gb(1), gb(1)));

    expect(container.textContent).not.toContain("settings.plan_top_tier_title");
    expect(container.textContent).not.toContain("settings.plan_current_title");
    expect(container.querySelectorAll('[data-featured="true"]').length).toBe(1);
  });
});
