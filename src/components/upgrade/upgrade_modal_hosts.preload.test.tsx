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
  imported: [] as string[],
  user_id: "user_1" as string | null,
  idle_callbacks: [] as (() => void)[],
  get_currency_rates: vi.fn(),
  refresh_plan_limits: vi.fn(),
  plan_code: "free" as string | null,
  status: {
    status: null as {
      available: boolean;
      auto_show: boolean;
      dismissed: boolean;
    } | null,
    is_loaded: false,
  },
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    is_authenticated: h.user_id !== null,
    user: h.user_id ? { id: h.user_id } : null,
  }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    plan_code: h.plan_code,
    refresh: h.refresh_plan_limits,
  }),
}));

vi.mock("@/stores/special_offer_status", () => ({
  use_special_offer_status: () => h.status,
}));

vi.mock("@/services/api/billing", () => ({
  get_currency_rates: h.get_currency_rates,
}));

vi.mock("@/components/upgrade/upgrade_modal", async () => {
  h.imported.push("upgrade_modal");
  const { use_currency_rates } =
    await import("@/components/settings/billing/use_currency_rates");

  return {
    UpgradeModal: () => {
      use_currency_rates();

      return <div data-modal="upgrade_modal" />;
    },
  };
});

vi.mock("@/components/upgrade/alias_cap_upsell_modal", async () => {
  h.imported.push("alias_cap_upsell_modal");
  const { use_currency_rates } =
    await import("@/components/settings/billing/use_currency_rates");

  return {
    AliasCapUpsellModal: () => {
      use_currency_rates();

      return <div data-modal="alias_cap_upsell_modal" />;
    },
  };
});

vi.mock("@/components/upgrade/special_offer_modal", async () => {
  h.imported.push("special_offer_modal");
  const { use_currency_rates } =
    await import("@/components/settings/billing/use_currency_rates");

  return {
    SpecialOfferModal: () => {
      use_currency_rates();

      return <div data-modal="special_offer_modal" />;
    },
  };
});

import {
  AliasCapUpsellModalHost,
  SpecialOfferModalHost,
  UpgradeModalHost,
} from "./upgrade_modal_hosts";

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(
      <>
        <UpgradeModalHost />
        <AliasCapUpsellModalHost />
        <SpecialOfferModalHost />
      </>,
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("upgrade modal preload", () => {
  beforeEach(() => {
    h.idle_callbacks.length = 0;
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      h.idle_callbacks.push(callback);

      return h.idle_callbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", () => undefined);
    window.history.pushState({}, "", "/");
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("does not schedule a preload while signed out", async () => {
    h.user_id = null;
    await mount();
    await settle();

    expect(h.idle_callbacks).toEqual([]);
    expect(h.imported).toEqual([]);
  });

  it("preloads modal code on idle once signed in without fetching rates", async () => {
    h.user_id = "user_1";
    await mount();
    await settle();

    expect(h.imported).toEqual([]);
    expect(h.idle_callbacks).toHaveLength(1);

    await act(async () => {
      h.idle_callbacks[0]();
    });
    await vi.waitFor(() => expect(h.imported).toHaveLength(3));

    expect(h.get_currency_rates).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
});
