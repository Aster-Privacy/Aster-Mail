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

import { use_special_offer_checkout } from "./use_special_offer_checkout";

import type { SpecialOfferCheckout } from "@/lib/special_offer";

const refresh_mock = vi.fn(() => Promise.resolve());

vi.mock("@/stores/special_offer_status", () => ({
  refresh_special_offer_status: () => refresh_mock(),
  use_special_offer_status: () => ({
    status: { available: true },
    is_loaded: true,
  }),
}));

vi.mock("@/lib/onion_host", () => ({ is_onion_host: () => false }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("use_special_offer_checkout", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: SpecialOfferCheckout | null;

  function Probe({ plan_code }: { plan_code?: string | null }) {
    latest = use_special_offer_checkout(plan_code);

    return null;
  }

  function render(plan_code?: string | null) {
    act(() => {
      root.render(<Probe plan_code={plan_code} />);
    });
  }

  beforeEach(() => {
    refresh_mock.mockClear();
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers the discount while the plan is unknown or free", () => {
    render(undefined);
    expect(latest?.plan_pricing("nova")).toBeDefined();

    render("free");
    expect(latest?.plan_pricing("nova")).toBeDefined();
    expect(refresh_mock).not.toHaveBeenCalled();
  });

  it("drops the discount and refreshes once the account is on a paid plan", () => {
    render("free");
    render("star");

    expect(latest?.plan_pricing("nova")).toBeUndefined();
    expect(latest?.crypto_price("nova")).toBeUndefined();
    expect(latest?.percent_off).toBeUndefined();
    expect(refresh_mock).toHaveBeenCalledTimes(1);
  });
});
