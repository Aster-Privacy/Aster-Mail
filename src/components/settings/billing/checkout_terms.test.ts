/*
 * Aster Communications Inc.
 *
 * Copyright (c) 2026 Aster Communications Inc.
 *
 * This file is part of this project.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type { PlanTier } from "./billing_constants";

import { describe, expect, it } from "vitest";

import {
  interval_for_term,
  nearest_card_term,
  term_for_interval,
  term_monthly_cents,
  term_price_cents,
  term_savings_cents,
  term_savings_percent,
} from "./checkout_terms";

const tier: PlanTier = {
  id: "plus",
  name: "Plus",
  description: "",
  monthly_cents: 1000,
  yearly_cents: 9600,
  biennial_cents: 16800,
  savings_cents: 2400,
  biennial_savings_cents: 7200,
};

describe("interval_for_term", () => {
  it("maps each term to its billing interval", () => {
    expect(interval_for_term(24)).toBe("biennial");
    expect(interval_for_term(12)).toBe("year");
    expect(interval_for_term(6)).toBe("month");
    expect(interval_for_term(1)).toBe("month");
  });
});

describe("term_for_interval", () => {
  it("maps each billing interval back to a term", () => {
    expect(term_for_interval("biennial")).toBe(24);
    expect(term_for_interval("year")).toBe(12);
    expect(term_for_interval("month")).toBe(1);
    expect(term_for_interval("unknown")).toBe(1);
  });
});

describe("term_price_cents", () => {
  it("uses the tier price for the yearly and biennial terms", () => {
    expect(term_price_cents(tier, 24)).toBe(16800);
    expect(term_price_cents(tier, 12)).toBe(9600);
  });

  it("multiplies the monthly price for shorter terms", () => {
    expect(term_price_cents(tier, 6)).toBe(6000);
    expect(term_price_cents(tier, 3)).toBe(3000);
    expect(term_price_cents(tier, 1)).toBe(1000);
  });
});

describe("term_monthly_cents", () => {
  it("divides the term total across its months", () => {
    expect(term_monthly_cents(tier, 24)).toBe(700);
    expect(term_monthly_cents(tier, 12)).toBe(800);
    expect(term_monthly_cents(tier, 1)).toBe(1000);
  });
});

describe("term_savings_cents", () => {
  it("reports the discount against paying monthly", () => {
    expect(term_savings_cents(tier, 24)).toBe(7200);
    expect(term_savings_cents(tier, 12)).toBe(2400);
  });

  it("reports no savings for terms billed at the monthly rate", () => {
    expect(term_savings_cents(tier, 6)).toBe(0);
    expect(term_savings_cents(tier, 1)).toBe(0);
  });
});

describe("term_savings_percent", () => {
  it("expresses the savings as a whole percentage", () => {
    expect(term_savings_percent(tier, 24)).toBe(30);
    expect(term_savings_percent(tier, 12)).toBe(20);
    expect(term_savings_percent(tier, 1)).toBe(0);
  });

  it("returns zero when the tier has no monthly price", () => {
    expect(term_savings_percent({ ...tier, monthly_cents: 0 }, 12)).toBe(0);
  });
});

describe("nearest_card_term", () => {
  it("keeps the terms that card payments support", () => {
    expect(nearest_card_term(12)).toBe(12);
    expect(nearest_card_term(1)).toBe(1);
  });

  it("lowers crypto-only terms to a year", () => {
    expect(nearest_card_term(24)).toBe(12);
    expect(nearest_card_term(6)).toBe(12);
    expect(nearest_card_term(3)).toBe(12);
  });
});
