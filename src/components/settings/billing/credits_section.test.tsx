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

import { CreditsSection } from "./credits_section";
import {
  get_credit_packages,
  purchase_credits,
  type CreditPackageItem,
} from "@/services/api/billing";

vi.mock("@/services/api/billing", () => ({
  get_credit_packages: vi.fn(),
  purchase_credits: vi.fn(),
  get_credit_transactions: vi.fn(),
  update_credit_settings: vi.fn(),
  format_price: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  format_date: () => "date",
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/settings/billing/billing_constants", () => ({
  convert_cents: (cents: number) => cents,
}));

const mocked_packages = vi.mocked(get_credit_packages);
const mocked_purchase = vi.mocked(purchase_credits);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PACKAGE: CreditPackageItem = {
  id: "pkg_1",
  price_cents: 500,
  amount_cents: 500,
  bonus_cents: 0,
} as CreditPackageItem;

describe("CreditsSection top-up bfcache restore", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_section = async () => {
    await act(async () => {
      root.render(
        <CreditsSection
          credit_balance={null}
          set_credit_balance={vi.fn()}
          preferred_currency="usd"
        />,
      );
    });
  };

  const find_button = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    ) as HTMLButtonElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_packages.mockReset();
    mocked_purchase.mockReset();
    mocked_packages.mockResolvedValue({ data: { packages: [PACKAGE] } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("re-enables the buy button after a bfcache restore (pageshow persisted)", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });

    let resolve_purchase: ((value: { data: { url: string } }) => void) | undefined;
    mocked_purchase.mockReturnValue(
      new Promise((resolve) => {
        resolve_purchase = resolve;
      }) as ReturnType<typeof purchase_credits>,
    );

    await render_section();

    await act(async () => {
      find_button("settings.top_up_credits")!.click();
    });

    const buy_button = find_button("settings.buy_credits")!;
    expect(buy_button.textContent).toContain("settings.buy_credits");
    expect(buy_button.disabled).toBe(false);

    await act(async () => {
      buy_button.click();
    });

    expect(find_button("settings.buying_credits")!.disabled).toBe(true);

    await act(async () => {
      resolve_purchase?.({ data: { url: "https://checkout.stripe.com/c/pay/cs_test" } });
    });

    expect(assign).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test",
    );
    expect(find_button("settings.buying_credits")!.disabled).toBe(true);

    await act(async () => {
      const evt = new Event("pageshow");
      Object.defineProperty(evt, "persisted", { value: true });
      window.dispatchEvent(evt);
    });

    const restored = find_button("settings.buy_credits")!;
    expect(restored.textContent).toContain("settings.buy_credits");
    expect(restored.disabled).toBe(false);
  });

  it("leaves the button untouched on a normal (non-persisted) pageshow", async () => {
    await render_section();

    await act(async () => {
      find_button("settings.top_up_credits")!.click();
    });

    await act(async () => {
      const evt = new Event("pageshow");
      Object.defineProperty(evt, "persisted", { value: false });
      window.dispatchEvent(evt);
    });

    expect(find_button("settings.buy_credits")!.disabled).toBe(false);
  });
});
