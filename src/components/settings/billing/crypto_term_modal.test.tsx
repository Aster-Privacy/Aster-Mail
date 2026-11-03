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
import type { ReactNode } from "react";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CryptoTermModal } from "./crypto_term_modal";

import {
  create_crypto_checkout_session,
  create_crypto_native_invoice,
} from "@/services/api/billing";
import {
  FAMILY_PLAN_TIERS,
  PLAN_TIERS,
} from "@/components/settings/billing/billing_constants";

const tauri_invoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}(${Object.values(params).join(",")})` : key,
  }),
}));

vi.mock("@/services/api/billing", () => ({
  format_price: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  get_crypto_native_coins: vi.fn(async () => ({
    data: {
      enabled: true,
      coins: [
        {
          currency: "btc",
          chain: "bitcoin",
          display_name: "Bitcoin",
          decimals: 8,
          recommended: true,
        },
      ],
    },
  })),
  create_crypto_native_invoice: vi.fn(async () => ({
    data: { id: "invoice-1" },
  })),
  create_crypto_checkout_session: vi.fn(async () => ({
    data: { url: "https://checkout.stripe.com/c/pay/cs_test" },
  })),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children: ReactNode }) =>
    is_open ? <div>{children}</div> : null,
  ModalHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  ModalDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  ModalBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "web" },
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/pages/crypto_invoice/prefetch", () => ({
  prefetch_crypto_invoice_page: vi.fn(),
}));

vi.mock("@/pages/crypto_invoice/ui", () => ({
  Notice: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TicketDivider: () => null,
}));

vi.mock("@/components/ui/coin_icon", () => ({
  CoinIcon: () => null,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
  TOAST_DURATION_BILLING_MS: 0,
}));

vi.mock("@/lib/payment_navigation", () => ({
  mark_payment_navigation: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri_invoke,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type TermMonths = 1 | 3 | 6 | 12 | 24;

const TERM_LABEL: Record<TermMonths, string> = {
  1: "settings.crypto_term_1mo",
  3: "settings.crypto_term_3mo",
  6: "settings.crypto_term_6mo",
  12: "settings.crypto_term_12mo",
  24: "settings.crypto_term_24mo",
};

interface tier_prices {
  id: string;
  name: string;
  monthly_cents: number;
  yearly_cents: number;
  biennial_cents: number;
}

const ALL_TIERS: tier_prices[] = [...PLAN_TIERS, ...FAMILY_PLAN_TIERS];

function tier(id: string): tier_prices {
  const match = ALL_TIERS.find((entry) => entry.id === id);

  if (!match) throw new Error(`unknown tier: ${id}`);

  return match;
}

function expected_cents(entry: tier_prices, term: TermMonths): number {
  if (term === 24) return entry.biennial_cents;
  if (term === 12) return entry.yearly_cents;

  return entry.monthly_cents * term;
}

function format_cents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function find_button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text),
  );

  if (!match) throw new Error(`button not found: ${text}`);

  return match as HTMLButtonElement;
}

function term_radios(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('[role="radio"]'));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CryptoTermModal terms", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_modal = async (
    plan_code: string,
    options: { is_open?: boolean; initial_term_months?: number } = {},
  ) => {
    const entry = tier(plan_code);

    await act(async () => {
      root.render(
        <CryptoTermModal
          initial_term_months={options.initial_term_months}
          is_open={options.is_open ?? true}
          monthly_price_cents={entry.monthly_cents}
          on_close={vi.fn()}
          on_native_invoice={vi.fn()}
          plan_code={plan_code}
          plan_name={entry.name}
          preferred_currency="usd"
          yearly_price_cents={entry.yearly_cents}
        />,
      );
    });
    await flush();
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(create_crypto_native_invoice).mockClear();
    vi.mocked(create_crypto_checkout_session).mockClear();
    tauri_invoke.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("offers every crypto term, including two years", async () => {
    await render_modal("star");

    const labels = term_radios(container).map((radio) => radio.textContent);

    expect(labels).toHaveLength(5);
    ([1, 3, 6, 12, 24] as TermMonths[]).forEach((term, index) => {
      expect(labels[index]).toContain(TERM_LABEL[term]);
      expect(labels[index]).toContain(
        format_cents(expected_cents(tier("star"), term)),
      );
    });
  });

  it("opens straight to the method step for a two-year selection", async () => {
    await render_modal("star", { initial_term_months: 24 });

    expect(term_radios(container)).toHaveLength(0);
    expect(container.textContent).toContain(TERM_LABEL[24]);
    expect(container.textContent).toContain(format_cents(4999));
  });

  it.each(
    ALL_TIERS.flatMap((entry) =>
      ([1, 3, 6, 12, 24] as TermMonths[]).map(
        (term) => [entry.id, term] as const,
      ),
    ),
  )(
    "creates a native invoice for %s over %i months",
    async (plan_code, term) => {
      await render_modal(plan_code);

      await act(async () => {
        find_button(container, TERM_LABEL[term]).click();
      });
      await act(async () => {
        find_button(container, "settings.crypto_native_continue").click();
      });
      await flush();

      expect(container.textContent).toContain(
        format_cents(expected_cents(tier(plan_code), term)),
      );

      await act(async () => {
        find_button(container, "Bitcoin").click();
      });
      await flush();

      expect(create_crypto_native_invoice).toHaveBeenCalledWith(
        plan_code,
        term,
        "btc",
        "bitcoin",
        undefined,
        false,
      );
    },
  );

  it.each(["star", "nova", "supernova", "duo", "family"])(
    "opens a stablecoin checkout for %s over two years",
    async (plan_code) => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      await render_modal(plan_code, { initial_term_months: 24 });

      await act(async () => {
        find_button(container, "settings.crypto_native_stripe_option").click();
      });
      await flush();

      expect(create_crypto_checkout_session).toHaveBeenCalledWith(
        plan_code,
        24,
        "https://app.astermail.org/?crypto=success",
        "https://app.astermail.org/?crypto=cancelled",
        undefined,
        false,
      );
      expect(tauri_invoke).toHaveBeenCalledWith("open_external_url", {
        url: "https://checkout.stripe.com/c/pay/cs_test",
      });
    },
  );

  it("starts from one month when reopened without a term", async () => {
    await render_modal("star", { initial_term_months: 24 });
    await render_modal("star", { is_open: false });
    await render_modal("star");

    const checked = term_radios(container).filter(
      (radio) => radio.getAttribute("aria-checked") === "true",
    );

    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain(TERM_LABEL[1]);
  });
});
