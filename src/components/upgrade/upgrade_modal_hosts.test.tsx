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

import {
  close_upgrade_modal,
  show_plan_limit_upgrade,
} from "@/stores/upgrade_store";
import {
  close_alias_cap_upsell,
  show_alias_cap_upsell,
} from "@/stores/alias_cap_upsell_store";
import {
  close_special_offer,
  request_special_offer_checkout,
  show_special_offer,
} from "@/stores/special_offer_store";

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

function rendered(name: string): boolean {
  return container.querySelector(`[data-modal="${name}"]`) !== null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function wait_for_modal(name: string) {
  await vi.waitFor(async () => {
    await settle();
    expect(rendered(name)).toBe(true);
  });
}

describe("upgrade modal hosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    close_upgrade_modal();
    close_alias_cap_upsell();
    close_special_offer();
    h.plan_code = "free";
    h.user_id = "user_1";
    h.idle_callbacks.length = 0;
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      h.idle_callbacks.push(callback);

      return h.idle_callbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", () => undefined);
    h.status = { status: null, is_loaded: false };
    h.get_currency_rates.mockResolvedValue({ data: { rates: { eur: 1 } } });
    window.history.pushState({}, "", "/");
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("loads no modal code and fetches no currency rates while closed", async () => {
    h.status = {
      status: { available: true, auto_show: false, dismissed: false },
      is_loaded: true,
    };
    await mount();
    await settle();

    expect(h.imported).toEqual([]);
    expect(h.get_currency_rates).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
    expect(h.refresh_plan_limits).toHaveBeenCalled();
  });

  it("does not load the special offer for a paid plan", async () => {
    h.plan_code = "nova";
    h.status = {
      status: { available: true, auto_show: true, dismissed: false },
      is_loaded: true,
    };
    await mount();
    await settle();

    expect(h.imported).toEqual([]);
    expect(h.get_currency_rates).not.toHaveBeenCalled();
  });

  it("renders the upgrade modal when the store opens it and keeps it mounted after close", async () => {
    await mount();

    await act(async () => {
      show_plan_limit_upgrade({ resource: "aliases" });
    });
    await wait_for_modal("upgrade_modal");

    expect(h.imported).toEqual(["upgrade_modal"]);
    expect(h.get_currency_rates).toHaveBeenCalledTimes(1);

    await act(async () => {
      close_upgrade_modal();
    });

    expect(rendered("upgrade_modal")).toBe(true);
  });

  it("renders the alias cap upsell when the store opens it", async () => {
    await mount();

    expect(rendered("alias_cap_upsell_modal")).toBe(false);

    await act(async () => {
      show_alias_cap_upsell({ used: 3, limit: 3 });
    });
    await wait_for_modal("alias_cap_upsell_modal");

    expect(h.imported).toContain("alias_cap_upsell_modal");
    expect(h.imported).not.toContain("special_offer_modal");
  });

  it("renders the special offer when it may show itself", async () => {
    h.status = {
      status: { available: true, auto_show: true, dismissed: false },
      is_loaded: true,
    };
    await mount();

    await wait_for_modal("special_offer_modal");
    expect(h.imported).toContain("special_offer_modal");
  });

  it("renders the special offer when it is opened by hand", async () => {
    await mount();

    expect(rendered("special_offer_modal")).toBe(false);

    await act(async () => {
      show_special_offer("manual");
    });
    await wait_for_modal("special_offer_modal");
  });

  it("renders the special offer when a checkout is requested", async () => {
    await mount();

    expect(rendered("special_offer_modal")).toBe(false);

    await act(async () => {
      request_special_offer_checkout("year");
    });
    await wait_for_modal("special_offer_modal");
  });
});
