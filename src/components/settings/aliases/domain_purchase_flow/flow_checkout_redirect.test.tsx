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

import { DomainPurchaseFlow } from "./flow";
import { CHECKOUT_KEY } from "./shared";

import { create_domain_checkout } from "@/services/api/domains";
import { open_payment_url } from "@/services/api/billing";

vi.mock("@/services/api/domains", () => ({
  create_domain_checkout: vi.fn(),
  search_purchasable_domains: vi.fn(async () => ({
    data: { results: [], suggestions: [] },
  })),
  get_domain_order: vi.fn(async () => ({ data: null })),
  format_domain_price: (cents: number | null) => `${cents ?? 0}`,
}));

vi.mock("@/services/api/billing", () => ({
  open_payment_url: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/client/helpers", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/api/client/helpers")
  >()),
  is_tauri_env: () => false,
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TURNSTILE_SITE_KEY: "",
  TurnstileWidget: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocked_checkout = vi.mocked(create_domain_checkout);
const mocked_open = vi.mocked(open_payment_url);

let container: HTMLDivElement;
let root: Root;

function seed_draft() {
  sessionStorage.setItem(
    CHECKOUT_KEY,
    JSON.stringify({
      selected: {
        domain: "example-shop.com",
        available: true,
        price_cents: 1200,
        renewal_price_cents: 1500,
        currency: "USD",
      },
      years: 1,
    }),
  );
}

async function click_buy() {
  await act(async () => {
    root.render(<DomainPurchaseFlow on_done={() => {}} on_purchased={() => {}} />);
  });

  const buy = Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes("settings.domain_purchase_buy"),
  );

  expect(buy).toBeDefined();

  await act(async () => {
    buy!.click();
  });
}

describe("domain purchase checkout redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    seed_draft();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
  });

  it("opens an https checkout through the payment url opener", async () => {
    mocked_checkout.mockResolvedValue({
      data: {
        order_id: "order_1",
        checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
      },
    } as never);

    await click_buy();

    expect(mocked_open).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(sessionStorage.getItem("aster_pending_domain_order")).toBe(
      "order_1",
    );
  });

  it("refuses a checkout url that is not https", async () => {
    const before = window.location.href;

    mocked_checkout.mockResolvedValue({
      data: {
        order_id: "order_2",
        checkout_url: "javascript:alert(1)",
      },
    } as never);

    await click_buy();

    expect(mocked_open).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    expect(sessionStorage.getItem("aster_pending_domain_order")).toBeNull();
    expect(container.textContent).toContain("settings.domain_purchase_error");
  });

  it("refuses a plain http checkout url", async () => {
    mocked_checkout.mockResolvedValue({
      data: {
        order_id: "order_3",
        checkout_url: "http://checkout.example.test/pay",
      },
    } as never);

    await click_buy();

    expect(mocked_open).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("aster_pending_domain_order")).toBeNull();
  });
});
