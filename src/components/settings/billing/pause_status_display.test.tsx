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
import type {
  PauseStatusResponse,
  SubscriptionResponse,
} from "@/services/api/billing";

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
const { CurrentPlanCard } = await import("./current_plan_card");
const { PauseNoticeCard } = await import("./pause_notice_card");
const { scheduled_pause_start } = await import("./use_pause_status");

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

function make_subscription(plan_code = "star"): SubscriptionResponse {
  const is_free = plan_code === "free";

  return {
    plan: {
      id: "plan-1",
      code: plan_code,
      name: is_free ? "Free" : "Star",
      description: null,
      storage_limit_bytes: 1_000_000_000,
      price_cents: is_free ? 0 : 299,
      billing_period: is_free ? null : "month",
    },
    status: "active",
    cancel_at_period_end: false,
    current_period_start: "2026-10-25T00:00:00Z",
    current_period_end: "2026-11-25T00:00:00Z",
    storage: {
      used_bytes: 0,
      limit_bytes: 1_000_000_000,
      total_limit_bytes: 1_000_000_000,
      percentage_used: 0,
      is_over_limit: false,
    },
    currency: "usd",
    payment_failed_at: null,
    grace_period_end: null,
    payment_provider: null,
    has_stripe_subscription: true,
  };
}

function make_pause(
  status: PauseStatusResponse["status"],
): PauseStatusResponse {
  return {
    status,
    eligible: status === "none",
    ineligible_reason: null,
    min_months: 1,
    max_months: 3,
    pause_starts_at: status === "none" ? null : "2026-11-25T00:00:00Z",
    pause_ends_at: status === "none" ? null : "2026-12-25T00:00:00Z",
    next_eligible_at: null,
    plan_name: "Star",
  };
}

function hero(pause_starts_at: string | null) {
  return (
    <BillingHeroCard
      current_billing_interval="month"
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
      pause_starts_at={pause_starts_at}
      plan_limits={null}
      plans_open={false}
      preferred_currency="usd"
      storage_limit_bytes={1_000_000_000}
      storage_percentage={0}
      storage_used_bytes={0}
      subscription={make_subscription()}
    />
  );
}

function plan_card(pause_starts_at: string | null) {
  return (
    <CurrentPlanCard
      current_billing_interval="month"
      grace_days_remaining={0}
      has_payment_failed={false}
      include_notices={false}
      is_action_loading={false}
      is_over_limit={false}
      on_manage_billing={() => {}}
      on_manage_plan={() => {}}
      on_reactivate={() => {}}
      on_scroll_to_plans={() => {}}
      pause_starts_at={pause_starts_at}
      preferred_currency="usd"
      storage_limit_bytes={1_000_000_000}
      storage_percentage={0}
      storage_used_bytes={0}
      subscription={make_subscription()}
    />
  );
}

function notice(status: PauseStatusResponse, show_cancel_plan: boolean) {
  return (
    <PauseNoticeCard
      show_cancel_plan={show_cancel_plan}
      status={status}
      on_cancel_plan={() => {}}
      on_changed={async () => {}}
      on_reload={async () => {}}
    />
  );
}

describe("scheduled_pause_start", () => {
  it("returns the start date only while a pause is scheduled", () => {
    expect(scheduled_pause_start(make_pause("scheduled"))).toBe(
      "2026-11-25T00:00:00Z",
    );
    expect(scheduled_pause_start(make_pause("paused"))).toBeNull();
    expect(scheduled_pause_start(make_pause("none"))).toBeNull();
    expect(scheduled_pause_start(null)).toBeNull();
  });
});

describe("renewal line with a scheduled pause", () => {
  it("says the plan pauses instead of renewing on the hero card", async () => {
    const text = await render(hero("2026-11-25T00:00:00Z"));

    expect(text).toContain("settings.billing_status_pauses");
    expect(text).not.toContain("settings.billing_status_renews");
  });

  it("keeps the renewal date on the hero card without a pause", async () => {
    const text = await render(hero(null));

    expect(text).toContain("settings.billing_status_renews");
    expect(text).not.toContain("settings.billing_status_pauses");
  });

  it("says the plan pauses instead of renewing on the mobile plan card", async () => {
    const text = await render(plan_card("2026-11-25T00:00:00Z"));

    expect(text).toContain("settings.billing_status_pauses");
    expect(text).not.toContain("settings.renews");
  });

  it("keeps the renewal date on the mobile plan card without a pause", async () => {
    const text = await render(plan_card(null));

    expect(text).toContain("settings.renews");
    expect(text).not.toContain("settings.billing_status_pauses");
  });
});

describe("pause notice card", () => {
  it("offers Cancel Plan while paused when the page has no other cancel path", async () => {
    const text = await render(notice(make_pause("paused"), true));

    expect(text).toContain("settings.pause_resume_action");
    expect(text).toContain("settings.cancel_plan");
  });

  it("leaves Cancel Plan to the plan card when the plan card shows it", async () => {
    const text = await render(notice(make_pause("paused"), false));

    expect(text).toContain("settings.pause_resume_action");
    expect(text).not.toContain("settings.cancel_plan");
  });

  it("renders nothing without a pause", async () => {
    const text = await render(notice(make_pause("none"), true));

    expect(text).toBe("");
  });
});
