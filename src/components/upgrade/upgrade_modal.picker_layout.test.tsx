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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: true, user: { id: "user_1" } }),
}));

const limits_value = {
  plan_code: "free",
  plan_name: "Free",
  limits: {
    max_email_aliases: { current: 3, limit: 3, is_at_limit: true },
  },
  storage: null,
};

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: limits_value,
    plan_code: "free",
    is_loading: false,
    load_failed: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/services/api/billing", () => ({
  change_plan: vi.fn(),
  format_price: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  start_hosted_checkout: vi.fn(),
  get_currency_rates: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/components/settings/billing/plan_features_modal", () => ({
  PlanFeaturesModal: () => null,
}));

vi.mock("@/components/settings/billing/plan_payment_method_modal", () => ({
  PlanPaymentMethodModal: () => null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/components/settings/billing/plan_change_confirm_modal", () => ({
  PlanChangeConfirmModal: () => null,
}));

import { UpgradeModal } from "./upgrade_modal";

import {
  FAMILY_PLAN_TIERS,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";
import {
  close_upgrade_modal,
  show_plan_limit_upgrade,
  show_storage_full_upgrade,
  show_upgrade_plans,
} from "@/stores/upgrade_store";

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <UpgradeModal />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function plan_cards(): string[] {
  return Array.from(document.querySelectorAll("[data-plan-card]")).map(
    (node) => node.getAttribute("data-plan-card") ?? "",
  );
}

describe("upgrade modal plan picker", () => {
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_upgrade_modal();
  });

  it("names the plan that unlocks a feature only in the label", async () => {
    show_plan_limit_upgrade({
      feature: "has_quiet_hours",
      message: "settings.feature_requires_upgrade",
    });
    await mount();

    const text = document.body.textContent ?? "";

    expect(text).toContain(
      'settings.plan_required_for_quiet_hours:{"plan":"Star"}',
    );
    expect(text).not.toContain("settings.available_on_plan");
    expect(text).not.toContain("settings.feature_requires_upgrade");
  });

  it("shows one currency control and no feature info buttons", async () => {
    show_plan_limit_upgrade({ resource: "aliases" });
    await mount();

    expect(document.querySelectorAll("select")).toHaveLength(1);
    expect(document.querySelectorAll("[data-plan-card] button")).toHaveLength(
      plan_cards().length,
    );
    expect(document.body.textContent).toContain(
      "settings.plan_picker_limit_subtitle",
    );
  });

  it("prices yearly plans from the yearly total", async () => {
    show_plan_limit_upgrade({ resource: "aliases" });
    await mount();

    const star = PLAN_TIERS.find((tier) => tier.id === "star");
    const card = document.querySelector('[data-plan-card="star"]');

    expect(star).toBeDefined();
    expect(card?.textContent).toContain(
      `$${(Math.round((star?.yearly_cents ?? 0) / 12) / 100).toFixed(2)}`,
    );
    expect(card?.textContent).toContain(
      `$${((star?.yearly_cents ?? 0) / 100).toFixed(2)}`,
    );
  });

  it("marks one plan as recommended and switches to family plans", async () => {
    show_plan_limit_upgrade({ resource: "aliases" });
    await mount();

    expect(plan_cards()).toEqual(
      PLAN_TIERS.filter((tier) => tier.id !== "free").map((tier) => tier.id),
    );
    expect(
      document.body.textContent?.split("settings.plan_recommended").length,
    ).toBe(2);

    const link = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "settings.plan_picker_family_link",
    );

    expect(link).toBeDefined();
    await act(async () => {
      link?.click();
    });

    expect(plan_cards()).toEqual(FAMILY_PLAN_TIERS.map((tier) => tier.id));
    expect(document.body.textContent).toContain(
      "settings.plan_picker_individual_link",
    );
  });

  it("labels the feature that needs an upgrade above the title", async () => {
    show_plan_limit_upgrade({ feature: "has_quiet_hours" });
    await mount();

    const label = document.querySelector('[data-testid="plan_required_for"]');
    const icon = label?.querySelector("svg");

    expect(label?.textContent).toBe(
      'settings.plan_required_for_quiet_hours:{"plan":"Star"}',
    );
    expect(label?.className).toContain("text-amber-700");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(label?.firstElementChild).toBe(icon);
  });

  it("names the plan and icon for a storage upgrade", async () => {
    show_storage_full_upgrade();
    await mount();

    const label = document.querySelector('[data-testid="plan_required_for"]');

    expect(label?.textContent).toBe(
      'settings.plan_required_for_storage:{"plan":"Star"}',
    );
    expect(label?.querySelector("svg")).not.toBeNull();
  });

  it("shows no required label when opened from the Upgrade button", async () => {
    show_upgrade_plans();
    await mount();

    expect(document.body.textContent).not.toContain("plan_required_for");
    expect(
      document.querySelector('[data-testid="plan_required_for"]'),
    ).toBeNull();
  });

  it("recommends the cheapest plan that raises the alias limit", async () => {
    show_plan_limit_upgrade({ resource: "aliases" });
    await mount();

    expect(document.body.textContent).toContain(
      'settings.plan_required_for_aliases:{"plan":"Star"}',
    );

    const star = document.querySelector('[data-plan-card="star"]');
    const nova = document.querySelector('[data-plan-card="nova"]');

    expect(star?.textContent).toContain("settings.plan_recommended");
    expect(nova?.textContent).not.toContain("settings.plan_recommended");
  });

  it("puts the matching feature line first in every card", async () => {
    show_plan_limit_upgrade({ resource: "domains" });
    await mount();

    for (const id of ["star", "nova", "supernova"]) {
      const first = document.querySelector(`[data-plan-card="${id}"] li`);

      expect(first?.textContent).toContain("settings.plan_feat_domains_");
      expect(first?.className).toContain("text-amber-700");
    }
  });
});
