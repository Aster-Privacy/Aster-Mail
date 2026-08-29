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

import {
  PlanPaymentMethodModal,
  type plan_term_option,
} from "./plan_payment_method_modal";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/api/billing", () => ({
  format_price: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TERMS: plan_term_option[] = [
  {
    id: "monthly",
    label: "settings.billing_monthly",
    per_month_cents: 299,
    total_cents: 299,
    save_cents: 0,
  },
  {
    id: "yearly",
    label: "settings.billing_yearly",
    per_month_cents: 249,
    total_cents: 2999,
    save_cents: 589,
  },
  {
    id: "biennial",
    label: "settings.biennial",
    per_month_cents: 208,
    total_cents: 4999,
    save_cents: 2177,
    crypto_only: true,
  },
];

function term_button(container: HTMLElement, id: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const index = TERMS.findIndex((term) => term.id === id);
  const match = buttons.find((button) =>
    button.textContent?.includes(TERMS[index].label),
  );

  if (!match) throw new Error(`term button not found: ${id}`);

  return match as HTMLButtonElement;
}

function method_button(container: HTMLElement, key: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(key),
  );

  if (!match) throw new Error(`method button not found: ${key}`);

  return match as HTMLButtonElement;
}

describe("PlanPaymentMethodModal crypto-only terms", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(on_choose_card = vi.fn()) {
    act(() => {
      root.render(
        <PlanPaymentMethodModal
          open
          on_choose_card={on_choose_card}
          on_choose_crypto={vi.fn()}
          on_close={vi.fn()}
          plan_name="Nova"
          selected_term="yearly"
          term_options={TERMS}
        />,
      );
    });

    return on_choose_card;
  }

  it("keeps card checkout available for terms Stripe can price", () => {
    render();

    const card = method_button(document.body, "settings.checkout_method_card");

    expect(card.disabled).toBe(false);
    expect(document.body.textContent).not.toContain(
      "settings.checkout_card_term_unavailable",
    );
  });

  it("blocks card checkout on a crypto-only term and says why", () => {
    const on_choose_card = render();

    act(() => {
      term_button(document.body, "biennial").click();
    });

    const card = method_button(document.body, "settings.checkout_method_card");

    expect(card.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "settings.checkout_card_term_unavailable",
    );

    act(() => card.click());
    expect(on_choose_card).not.toHaveBeenCalled();
  });
});
