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
import { MemoryRouter, useLocation } from "react-router-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
    limits: null,
    plan_code: "free",
    is_loading: false,
    load_failed: false,
    refresh: vi.fn(),
  }),
}));

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
  PlanPaymentMethodModal: (props: {
    open: boolean;
    on_choose_crypto: (term_id?: string) => void;
  }) =>
    props.open ? (
      <button
        data-testid="choose_crypto"
        type="button"
        onClick={() => props.on_choose_crypto("monthly")}
      />
    ) : null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: (props: {
    on_finished?: () => void;
    on_native_invoice?: (invoice_id: string) => void | Promise<void>;
  }) => (
    <button
      data-testid="pay_native"
      type="button"
      onClick={() => {
        props.on_finished?.();
        void props.on_native_invoice?.("invoice_1");
      }}
    />
  ),
}));

vi.mock("@/components/settings/billing/plan_change_confirm_modal", () => ({
  PlanChangeConfirmModal: () => null,
}));

import { UpgradeModal } from "./upgrade_modal";

import {
  close_upgrade_modal,
  get_upgrade_snapshot,
  show_checkout_cancelled_upgrade,
} from "@/stores/upgrade_store";

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();

  return <span data-testid="pathname">{location.pathname}</span>;
}

function click(test_id: string) {
  const target = document.querySelector<HTMLButtonElement>(
    `[data-testid="${test_id}"]`,
  );

  expect(target).not.toBeNull();
  target?.click();
}

describe("upgrade modal native crypto invoice", () => {
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_upgrade_modal();
  });

  it("closes the plan chooser and opens the invoice page", async () => {
    show_checkout_cancelled_upgrade({ plan_code: "star", interval: "month" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <UpgradeModal />
          <LocationProbe />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      click("choose_crypto");
    });
    await act(async () => {
      click("pay_native");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(get_upgrade_snapshot().is_open).toBe(false);
    expect(
      document.querySelector('[data-testid="pathname"]')?.textContent,
    ).toBe("/crypto-invoice/invoice_1");
    expect(document.body.textContent).not.toContain(
      "settings.upgrade_modal_title",
    );
  });
});
