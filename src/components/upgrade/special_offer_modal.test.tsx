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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  status: {
    status: null as {
      available: boolean;
      auto_show: boolean;
      dismissed: boolean;
    } | null,
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

vi.mock("@/hooks/use_special_offer_checkout", () => ({
  use_special_offer_checkout: () => ({
    plan_pricing: () => null,
    percent_off: 50,
    crypto_price: () => null,
  }),
}));

vi.mock("@/services/api/billing", () => ({
  format_price: (cents: number) => String(cents),
  start_hosted_checkout: vi.fn(),
  get_currency_rates: vi.fn(async () => ({ data: null })),
}));

vi.mock("@/components/settings/billing/plan_payment_method_modal", () => ({
  PlanPaymentMethodModal: () => null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/stores/special_offer_status", () => ({
  use_special_offer_status: () => h.status,
  claim_special_offer_slot: vi.fn(async () => false),
  get_special_offer_generation: () => 0,
  record_special_offer_accepted: vi.fn(),
  record_special_offer_dismissed: vi.fn(),
  refresh_special_offer_status: vi.fn(),
}));

import { SpecialOfferModal } from "./special_offer_modal";

import {
  close_special_offer,
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
