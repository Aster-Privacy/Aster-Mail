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
import type { SubscriptionResponse } from "@/services/api/billing";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: "en",
  }),
}));

const { BillingHeroCard } = await import("./billing_hero_card");
const { CurrentPlanCard, CurrentPlanNotices } =
  await import("./current_plan_card");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function render(element: ReactElement): Promise<string> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });

  return container.textContent ?? "";
}

function make_subscription(
  overrides: Partial<SubscriptionResponse> = {},
  plan_code = "supernova",
): SubscriptionResponse {
  const is_free = plan_code === "free";

  return {
    plan: {
      id: "plan-1",
      code: plan_code,
      name: is_free ? "Free" : "Supernova",
      storage_limit_bytes: 1_000_000_000,
      price_cents: is_free ? 0 : 16080,
      billing_period: is_free ? null : "year",
    },
    status: "active",
    cancel_at_period_end: false,
    current_period_start: "2026-09-30T00:00:00Z",
    current_period_end: "2126-09-30T00:00:00Z",
    storage: {
      total_used_bytes: 0,
      total_limit_bytes: 1_000_000_000,
    },
    currency: "eur",
    payment_failed_at: null,
    grace_period_end: null,
    payment_provider: null,
    has_stripe_subscription: false,
    ...overrides,
  } as SubscriptionResponse;
}

function hero(subscription: SubscriptionResponse) {
  return (
    <BillingHeroCard
      current_billing_interval="year"
      has_payment_failed={false}
      is_action_loading={false}
      is_over_limit={false}
      next_tier={null}
      next_tier_highlights={[]}
      on_add_storage={() => {}}
      on_cancel_plan={() => {}}
      on_manage_payment={() => {}}
      on_renew_with_crypto={() => {}}
      on_show_plans={() => {}}
      on_switch_billing={() => {}}
      on_toggle_plans={() => {}}
      on_upgrade_next={() => {}}
      plan_limits={null}
      plans_open={false}
      preferred_currency="usd"
      storage_limit_bytes={1_000_000_000}
      storage_percentage={0}
      storage_used_bytes={0}
      subscription={subscription}
    />
  );
}

function plan_card(subscription: SubscriptionResponse) {
  return (
    <CurrentPlanCard
      current_billing_interval="year"
      grace_days_remaining={0}
      has_payment_failed={false}
      is_action_loading={false}
      is_over_limit={false}
      on_manage_billing={() => {}}
      on_manage_plan={() => {}}
      on_reactivate={() => {}}
      on_scroll_to_plans={() => {}}
      preferred_currency="usd"
      storage_limit_bytes={1_000_000_000}
      storage_percentage={0}
      storage_used_bytes={0}
      subscription={subscription}
    />
  );
}

function notices(subscription: SubscriptionResponse) {
  return (
    <CurrentPlanNotices
      grace_days_remaining={0}
      has_payment_failed={false}
      is_action_loading={false}
      is_over_limit={false}
      on_manage_billing={() => {}}
      on_reactivate={() => {}}
      on_renew_with_crypto={() => {}}
      subscription={subscription}
    />
  );
}

describe("billing hero card", () => {
  it("shows a lifetime plan without a renewal date, price, or plan actions", async () => {
    const text = await render(hero(make_subscription({ is_lifetime: true })));

    expect(text).toContain("settings.billing_status_lifetime");
    expect(text).toContain("settings.billing_lifetime_note");
    expect(text).not.toContain("settings.billing_status_renews");
    expect(text).not.toContain("settings.per_year_short");
    expect(text).not.toContain("settings.change_plan");
    expect(text).not.toContain("settings.cancel_plan");
    expect(text).not.toContain("settings.switch_to_monthly");
    expect(text).not.toContain("settings.checkout_method_card");
  });

  it("keeps the renewal date, price, and actions for a regular yearly plan", async () => {
    const text = await render(hero(make_subscription()));

    expect(text).toContain("settings.billing_status_renews");
    expect(text).toContain("settings.per_year_short");
    expect(text).toContain("settings.change_plan");
    expect(text).toContain("settings.cancel_plan");
    expect(text).not.toContain("settings.billing_status_lifetime");
    expect(text).not.toContain("settings.billing_lifetime_note");
  });

  it("treats an explicit false flag like a regular plan", async () => {
    const text = await render(hero(make_subscription({ is_lifetime: false })));

    expect(text).toContain("settings.billing_status_renews");
    expect(text).not.toContain("settings.billing_status_lifetime");
  });

  it("ignores the flag on the free plan", async () => {
    const text = await render(
      hero(make_subscription({ is_lifetime: true }, "free")),
    );

    expect(text).not.toContain("settings.billing_status_lifetime");
    expect(text).not.toContain("settings.billing_lifetime_note");
  });

  it("hides crypto renewal and cancellation states for a lifetime plan", async () => {
    const text = await render(
      hero(
        make_subscription({
          is_lifetime: true,
          payment_provider: "crypto",
          cancel_at_period_end: true,
          paid_until: "2126-09-30T00:00:00Z",
        }),
      ),
    );

    expect(text).toContain("settings.billing_status_lifetime");
    expect(text).not.toContain("settings.crypto_paid_until");
    expect(text).not.toContain("settings.crypto_renew_link");
    expect(text).not.toContain("settings.billing_status_ending");
  });
});

describe("current plan card", () => {
  it("shows lifetime instead of the price and renewal date", async () => {
    const text = await render(
      plan_card(make_subscription({ is_lifetime: true })),
    );

    expect(text).toContain("settings.billing_status_lifetime");
    expect(text).toContain("settings.billing_lifetime_note");
    expect(text).not.toContain("settings.manage_plan");
    expect(text).not.toContain("settings.per_year_short");
    expect(text).not.toContain("settings.renews");
  });

  it("keeps the price, renewal date, and plan button for a regular plan", async () => {
    const text = await render(plan_card(make_subscription()));

    expect(text).toContain("settings.per_year_short");
    expect(text).toContain("settings.renews");
    expect(text).toContain("settings.manage_plan");
    expect(text).not.toContain("settings.billing_status_lifetime");
  });
});

describe("current plan notices", () => {
  it("hides the cancellation and crypto notices for a lifetime plan", async () => {
    const text = await render(
      notices(
        make_subscription({
          is_lifetime: true,
          payment_provider: "crypto",
          cancel_at_period_end: true,
        }),
      ),
    );

    expect(text).not.toContain("settings.billing_cancel_notice_title");
    expect(text).not.toContain("settings.crypto_no_renew_notice");
  });

  it("still shows the cancellation notice for a regular plan", async () => {
    const text = await render(
      notices(make_subscription({ cancel_at_period_end: true })),
    );

    expect(text).toContain("settings.billing_cancel_notice_title");
  });
});
