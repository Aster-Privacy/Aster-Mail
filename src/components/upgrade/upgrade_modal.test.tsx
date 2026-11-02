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

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BLACK_FRIDAY_STATUS: SpecialOfferStatus = {
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
  use_plan_limits: () => ({
    limits: {
      plan_code: "free",
      plan_name: "Free",
      limits: {},
      storage: null,
    },
    plan_code: "free",
    is_loading: false,
    load_failed: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/use_special_offer_checkout", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/special_offer")>(
      "@/lib/special_offer",
    );

  return {
    use_special_offer_checkout: () =>
      actual.special_offer_checkout(true, BLACK_FRIDAY_STATUS),
  };
});

vi.mock("@/services/api/billing", () => ({
  change_plan: vi.fn(),
  format_price: (cents: number) => String(cents),
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
  close_upgrade_modal,
  show_plan_limit_upgrade,
} from "@/stores/upgrade_store";

let container: HTMLDivElement;
let root: Root;

async function mount_upgrade_modal() {
  show_plan_limit_upgrade({ resource: "aliases" });

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

function struck_prices(): string[] {
  return Array.from(document.body.querySelectorAll(".line-through")).map(
    (element) => element.textContent ?? "",
  );
}

describe("UpgradeModal under the Black Friday offer", () => {
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_upgrade_modal();
  });

  it("strikes through list prices for covered monthly terms only", async () => {
    await mount_upgrade_modal();

    const struck = struck_prices();

    expect(struck).toContain("899");
    expect(struck).toContain("1799");
    expect(struck).not.toContain("299");
    expect(document.body.textContent).toContain("449");
  });
});
