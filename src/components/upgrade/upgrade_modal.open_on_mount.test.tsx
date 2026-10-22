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
import { act, type ReactNode } from "react";
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
  PlanPaymentMethodModal: () => null,
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/components/settings/billing/plan_change_confirm_modal", () => ({
  PlanChangeConfirmModal: () => null,
}));

import { AliasCapUpsellModal } from "./alias_cap_upsell_modal";
import { UpgradeModal } from "./upgrade_modal";

import {
  close_alias_cap_upsell,
  get_alias_cap_upsell_snapshot,
  show_alias_cap_upsell,
} from "@/stores/alias_cap_upsell_store";
import {
  close_upgrade_modal,
  get_upgrade_snapshot,
  show_plan_limit_upgrade,
} from "@/stores/upgrade_store";

let container: HTMLDivElement;
let root: Root;

async function mount(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<MemoryRouter initialEntries={["/"]}>{node}</MemoryRouter>);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("upgrade modals mounted by an open", () => {
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_upgrade_modal();
    close_alias_cap_upsell();
  });

  it("keeps the upgrade modal open", async () => {
    show_plan_limit_upgrade({ resource: "aliases" });
    await mount(<UpgradeModal />);

    expect(get_upgrade_snapshot().is_open).toBe(true);
    expect(document.body.textContent).toContain("settings.upgrade_modal_title");
  });

  it("keeps the alias cap upsell open", async () => {
    show_alias_cap_upsell({ used: 3, limit: 3 });
    await mount(<AliasCapUpsellModal />);

    expect(get_alias_cap_upsell_snapshot().is_open).toBe(true);
    expect(document.body.textContent).toContain("common.alias_limit_reached");
  });
});
