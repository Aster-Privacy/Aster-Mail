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
import type { SpecialOfferStatus } from "@/services/api/offers";
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  status: {
    status: null as Partial<SpecialOfferStatus> | null,
    is_loaded: true,
  },
}));

vi.mock("@/hooks/use_special_offer_checkout", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/special_offer")>(
      "@/lib/special_offer",
    );

  return {
    use_special_offer_checkout: () =>
      actual.special_offer_checkout(
        h.status.status?.available === true,
        h.status.status as SpecialOfferStatus | null,
      ),
  };
});

vi.mock("@/stores/special_offer_status", () => ({
  use_special_offer_status: () => h.status,
  record_special_offer_accepted: vi.fn(async () => true),
  refresh_special_offer_status: vi.fn(),
}));

vi.mock("@/components/upgrade/offer_countdown", () => ({
  OfferCountdown: () => <span data-testid="offer_countdown" />,
}));

vi.mock("@/services/api/billing", async () => {
  const actual = await vi.importActual<typeof import("@/services/api/billing")>(
    "@/services/api/billing",
  );

  return {
    ...actual,
    format_price: (cents: number) => String(cents),
    get_available_plans: vi.fn(async () => ({ data: { plans: [] } })),
    get_my_referral_status: vi.fn(async () => ({ data: null })),
    validate_promo_code: vi.fn(async () => ({ data: null })),
    start_hosted_checkout: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("@/services/api/family", () => ({
  create_family_group: vi.fn(async () => ({
    data: { checkout_url: "http://insecure.test" },
  })),
}));

vi.mock("@/components/settings/billing/use_currency_rates", () => ({
  use_currency_rates: () => undefined,
}));

vi.mock("@/components/register/academic_offer_prefill", () => ({
  read_offer_prefill: () => ({ has_offer: false }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
  TOAST_DURATION_BILLING_MS: 4000,
}));

vi.mock("@/components/settings/checkout_modal", () => ({
  CheckoutModal: () => null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/components/settings/billing/plan_payment_method_modal", () => ({
  PlanPaymentMethodModal: (props: {
    open: boolean;
    promo_slot?: React.ReactNode;
    on_choose_card: () => void;
  }) =>
    props.open ? (
      <div>
        <button data-testid="pay_card" type="button" onClick={props.on_choose_card}>
          card
        </button>
        {props.promo_slot}
      </div>
    ) : null,
}));

import { RegisterStepPlanSelection } from "./register_step_plan_selection";

import { create_family_group } from "@/services/api/family";
import { start_hosted_checkout } from "@/services/api/billing";
import { record_special_offer_accepted } from "@/stores/special_offer_status";

const BLACK_FRIDAY_STATUS: Partial<SpecialOfferStatus> = {
  available: true,
  auto_show: false,
  shown: false,
  dismissed: false,
  plan_code: "nova",
  percent_off: 50,
  duration_months: 12,
  ends_at: "2099-12-02T07:59:59Z",
  theme: "black_friday",
  eligible_terms: [
    "star:year",
    "nova:month",
    "nova:year",
    "supernova:month",
    "supernova:year",
    "duo:month",
    "duo:year",
    "family:month",
    "family:year",
  ],
};

const reg = {
  t: (key: string) => key,
  is_invited: false,
  finalize_registration: vi.fn(),
} as unknown as UseRegistrationReturn;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<RegisterStepPlanSelection reg={reg} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function click(element: Element | undefined) {
  if (!element) throw new Error("missing element");

  return act(async () => {
    (element as HTMLElement).click();
  });
}

function buttons_with_text(text: string): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll("button")).filter(
    (candidate) => candidate.textContent === text,
  );
}

describe("RegisterStepPlanSelection under the Black Friday offer", () => {
  beforeEach(() => {
    vi.mocked(start_hosted_checkout).mockClear();
    vi.mocked(create_family_group).mockClear();
    vi.mocked(record_special_offer_accepted).mockClear();
    h.status = { status: BLACK_FRIDAY_STATUS, is_loaded: true };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the banner with the countdown", async () => {
    await mount();

    expect(
      document.body.querySelector('[data-testid="register_offer_banner"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="offer_countdown"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain(
      "settings.special_offer_black_friday_title",
    );
  });

  it("shows the list price struck through and the offer price", async () => {
    await mount();

    expect(document.body.querySelector(".line-through")).not.toBeNull();
    expect(document.body.textContent).toContain("8699");
    expect(document.body.textContent).toContain("4349");
  });

  it("sends the offer flag for Nova yearly after claiming", async () => {
    await mount();
    await click(buttons_with_text("settings.get_plan")[1]);
    await click(document.body.querySelector('[data-testid="pay_card"]')!);

    expect(record_special_offer_accepted).toHaveBeenCalledTimes(1);

    const call = vi.mocked(start_hosted_checkout).mock.calls[0];

    expect(call[0]).toBe("nova");
    expect(call[1]).toBe("year");
    expect(call[5]).toBe(true);
  });

  it("sends the offer flag for Family", async () => {
    await mount();
    await click(buttons_with_text("settings.plan_type_family")[0]);
    await click(buttons_with_text("settings.get_plan")[1]);
    await click(document.body.querySelector('[data-testid="pay_card"]')!);

    const call = vi.mocked(create_family_group).mock.calls[0];

    expect(call[0]).toBe("family");
    expect(call[1]).toBe("year");
    expect(call[5]).toBe(true);
  });

  it("hides the promo code entry while the offer applies", async () => {
    await mount();
    await click(buttons_with_text("settings.get_plan")[1]);

    expect(document.body.textContent).not.toContain(
      "settings.checkout_add_promo",
    );
  });

  it("shows the list price and no offer for Star monthly", async () => {
    await mount();
    await click(buttons_with_text("settings.billing_monthly")[0]);
    await click(buttons_with_text("settings.get_plan")[0]);
    await click(document.body.querySelector('[data-testid="pay_card"]')!);

    expect(document.body.textContent).toContain(
      "settings.special_offer_not_on_star_monthly",
    );
    expect(record_special_offer_accepted).not.toHaveBeenCalled();

    const call = vi.mocked(start_hosted_checkout).mock.calls[0];

    expect(call[0]).toBe("star");
    expect(call[5]).toBeUndefined();
  });
});

describe("RegisterStepPlanSelection without an offer", () => {
  beforeEach(() => {
    vi.mocked(start_hosted_checkout).mockClear();
    vi.mocked(record_special_offer_accepted).mockClear();
    h.status = { status: { available: false }, is_loaded: true };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps today's behavior", async () => {
    await mount();

    expect(
      document.body.querySelector('[data-testid="register_offer_banner"]'),
    ).toBeNull();
    expect(document.body.querySelector(".line-through")).toBeNull();

    await click(buttons_with_text("settings.get_plan")[1]);

    expect(document.body.textContent).toContain("settings.checkout_add_promo");

    await click(document.body.querySelector('[data-testid="pay_card"]')!);

    expect(record_special_offer_accepted).not.toHaveBeenCalled();
    expect(vi.mocked(start_hosted_checkout).mock.calls[0][5]).toBeUndefined();
  });
});
