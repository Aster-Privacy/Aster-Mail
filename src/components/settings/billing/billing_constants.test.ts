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
import { describe, it, expect, afterEach } from "vitest";

import {
  CURRENCY_CONVERSION_MARGIN,
  CURRENCY_RATES,
  FALLBACK_CURRENCY_RATES,
  PLAN_TIERS,
  SUPPORTED_CURRENCIES,
  convert_cents,
  set_currency_rates,
  subscribe_currency_rates,
} from "./billing_constants";

function restore_fallback_rates(): void {
  set_currency_rates(FALLBACK_CURRENCY_RATES);
}

afterEach(restore_fallback_rates);

describe("convert_cents", () => {
  it("leaves US dollars untouched", () => {
    expect(convert_cents(899, "usd")).toBe(899);
    expect(convert_cents(8699, "USD")).toBe(8699);
  });

  it("includes the checkout conversion fee", () => {
    set_currency_rates({ inr: 95.4223 });

    const without_fee = 899 * 95.4223;

    expect(convert_cents(899, "inr")).toBe(
      Math.round(without_fee * (1 + CURRENCY_CONVERSION_MARGIN)),
    );
    expect(convert_cents(899, "inr")).toBeGreaterThan(Math.round(without_fee));
  });

  it("lands within one percent of what the processor charges", () => {
    set_currency_rates({ inr: 95.4223 });

    const nova = PLAN_TIERS.find((tier) => tier.id === "nova");

    expect(nova).toBeDefined();

    const processor_yearly_paise = 862900;
    const shown = convert_cents(nova?.yearly_cents ?? 0, "inr");
    const drift = Math.abs(shown - processor_yearly_paise) / processor_yearly_paise;

    expect(drift).toBeLessThan(0.01);
  });

  it("falls back to the unconverted amount for an unknown currency", () => {
    expect(convert_cents(500, "zzz")).toBe(500 * (1 + CURRENCY_CONVERSION_MARGIN));
  });
});

describe("currency rate hydration", () => {
  it("replaces a stale rate with the live one", () => {
    set_currency_rates({ inr: 120 });

    expect(CURRENCY_RATES.inr).toBe(120);
    expect(convert_cents(100, "inr")).toBe(Math.round(100 * 120 * 1.04));
  });

  it("ignores nonsense rates", () => {
    const before = CURRENCY_RATES.inr;

    set_currency_rates({
      inr: 0,
      eur: -1,
      gbp: Number.NaN,
      jpy: Number.POSITIVE_INFINITY,
    });

    expect(CURRENCY_RATES.inr).toBe(before);
    expect(CURRENCY_RATES.eur).toBe(FALLBACK_CURRENCY_RATES.eur);
    expect(CURRENCY_RATES.gbp).toBe(FALLBACK_CURRENCY_RATES.gbp);
    expect(CURRENCY_RATES.jpy).toBe(FALLBACK_CURRENCY_RATES.jpy);
  });

  it("notifies subscribers only when a rate actually changes", () => {
    let calls = 0;
    const unsubscribe = subscribe_currency_rates(() => {
      calls += 1;
    });

    set_currency_rates({ inr: 111 });
    set_currency_rates({ inr: 111 });

    expect(calls).toBe(1);

    unsubscribe();

    set_currency_rates({ inr: 112 });

    expect(calls).toBe(1);
  });
});

describe("fallback rate table", () => {
  it("covers every currency the picker offers", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(FALLBACK_CURRENCY_RATES[currency.code]).toBeGreaterThan(0);
    }
  });
});
