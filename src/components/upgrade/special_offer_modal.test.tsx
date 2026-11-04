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
    is_loaded: false,
  },
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: true, user: { id: "user_1" } }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ plan_code: "free", refresh: vi.fn() }),
}));

vi.mock("@/hooks/use_special_offer_checkout", async () => {
  const actual = await vi.importActual<typeof import("@/lib/special_offer")>(
    "@/lib/special_offer",
  );

  return {
    use_special_offer_checkout: () =>
      actual.special_offer_checkout(
        true,
        h.status.status as SpecialOfferStatus | null,
      ),
  };
});

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/services/api/billing", () => ({
  format_price: (cents: number) => String(cents),
  start_hosted_checkout: vi.fn(async () => ({
    ok: false,
    server_code: "TEST",
  })),
  remember_checkout_target: vi.fn(),
  get_currency_rates: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/services/api/family", () => ({
  create_family_group: vi.fn(async () => ({ data: null, server_code: "TEST" })),
}));

vi.mock("@/components/settings/billing/plan_payment_method_modal", () => ({
  PlanPaymentMethodModal: (props: {
    open: boolean;
    on_choose_card: () => void;
  }) =>
    props.open ? (
      <button
        data-testid="pay_card"
        type="button"
        onClick={props.on_choose_card}
      >
        card
      </button>
    ) : null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/stores/special_offer_status", () => ({
  use_special_offer_status: () => h.status,
  get_special_offer_status_snapshot: () => h.status,
  claim_special_offer_slot: vi.fn(async () => false),
  get_special_offer_generation: () => 0,
  record_special_offer_accepted: vi.fn(),
  record_special_offer_dismissed: vi.fn(),
  refresh_special_offer_status: vi.fn(),
}));

import { SpecialOfferModal } from "./special_offer_modal";

import { create_family_group } from "@/services/api/family";
import { start_hosted_checkout } from "@/services/api/billing";
import {
  close_special_offer,
  request_special_offer_checkout,
  get_special_offer_snapshot,
  show_special_offer,
} from "@/stores/special_offer_store";

let container: HTMLDivElement;
let root: Root;

async function open_then_mount() {
  show_special_offer("manual");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<SpecialOfferModal />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function dialog_title_shown(): boolean {
  return document.body.textContent?.includes("settings.special_offer") ?? false;
}

describe("SpecialOfferModal mounted by a manual open", () => {
  beforeEach(() => {
    close_special_offer();
    window.history.pushState({}, "", "/");
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_special_offer();
  });

  it("stays open when the offer does not show itself", async () => {
    h.status = {
      status: { available: true, auto_show: false, dismissed: false },
      is_loaded: true,
    };
    await open_then_mount();

    expect(get_special_offer_snapshot().is_open).toBe(true);
    expect(dialog_title_shown()).toBe(true);
  });

  it("stays open when the offer was dismissed before", async () => {
    h.status = {
      status: { available: true, auto_show: false, dismissed: true },
      is_loaded: true,
    };
    await open_then_mount();

    expect(get_special_offer_snapshot().is_open).toBe(true);
  });

  it("still closes when the offer stops being available", async () => {
    h.status = {
      status: { available: true, auto_show: false, dismissed: false },
      is_loaded: true,
    };
    await open_then_mount();

    h.status = {
      status: { available: false, auto_show: false, dismissed: false },
      is_loaded: true,
    };
    await act(async () => {
      root.render(<SpecialOfferModal />);
    });

    expect(get_special_offer_snapshot().is_open).toBe(false);
  });
});

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

function click_button_with_text(text: string) {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  );

  if (!button) throw new Error(`no button with text ${text}`);

  return act(async () => {
    button.click();
  });
}

function plan_option_names(): string[] {
  return Array.from(document.body.querySelectorAll('[role="radio"]')).map(
    (option) => option.textContent ?? "",
  );
}

describe("SpecialOfferModal under the Black Friday offer", () => {
  beforeEach(() => {
    close_special_offer();
    window.history.pushState({}, "", "/");
    vi.mocked(start_hosted_checkout).mockClear();
    vi.mocked(create_family_group).mockClear();
    h.status = { status: BLACK_FRIDAY_STATUS, is_loaded: true };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_special_offer();
  });

  it("lists Star, Nova, Supernova, Duo, and Family", async () => {
    await open_then_mount();

    expect(plan_option_names()).toEqual([
      "Star",
      "Nova",
      "Supernova",
      "Duo",
      "Family",
    ]);
    expect(document.body.textContent).toContain(
      "settings.special_offer_black_friday_title",
    );
  });

  it("opens on the yearly price", async () => {
    await open_then_mount();

    expect(document.body.textContent).toContain("4349");
    expect(document.body.textContent).toContain("8699");
  });

  it("shows the list price without a strike-through for Star monthly", async () => {
    await open_then_mount();
    await click_button_with_text("Star");
    await click_button_with_text("settings.billing_monthly");

    expect(document.body.textContent).toContain(
      "settings.special_offer_not_on_star_monthly",
    );
    expect(document.body.querySelector(".line-through")).toBeNull();
    expect(document.body.textContent).not.toContain(
      "settings.special_offer_cta",
    );
  });

  it("lists features for Family", async () => {
    await open_then_mount();
    await click_button_with_text("Family");

    expect(
      document.body.querySelectorAll(".special_offer_feature").length,
    ).toBeGreaterThan(0);
  });

  it("shows no note and no offer button for a duo term that is not covered", async () => {
    h.status = {
      status: {
        ...BLACK_FRIDAY_STATUS,
        eligible_terms: ["star:year", "nova:year", "duo:year"],
      },
      is_loaded: true,
    };
    await open_then_mount();
    await click_button_with_text("Duo");
    await click_button_with_text("settings.billing_monthly");

    expect(document.body.textContent).not.toContain(
      "settings.special_offer_not_on_star_monthly",
    );
    expect(document.body.textContent).not.toContain(
      "settings.special_offer_cta",
    );
  });

  it("starts card checkout for Supernova yearly with the offer flag", async () => {
    await open_then_mount();
    await act(async () => {
      request_special_offer_checkout("year", "supernova");
    });
    await click_button_with_text("card");

    expect(start_hosted_checkout).toHaveBeenCalledWith(
      "supernova",
      "year",
      expect.any(String),
      undefined,
      undefined,
      true,
    );
  });

  it("starts family checkout for Family yearly with the offer flag", async () => {
    await open_then_mount();
    await act(async () => {
      request_special_offer_checkout("year", "family");
    });
    await click_button_with_text("card");

    expect(create_family_group).toHaveBeenCalledWith(
      "family",
      "year",
      expect.any(String),
      expect.any(String),
      undefined,
      true,
    );
    expect(start_hosted_checkout).not.toHaveBeenCalled();
  });

  it("does not send the offer flag for Star monthly", async () => {
    await open_then_mount();
    await act(async () => {
      request_special_offer_checkout("month", "star");
    });
    await click_button_with_text("card");

    expect(start_hosted_checkout).toHaveBeenCalledWith(
      "star",
      "month",
      expect.any(String),
      undefined,
      undefined,
      undefined,
    );
  });
});
