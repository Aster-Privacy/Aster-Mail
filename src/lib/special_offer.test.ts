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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SPECIAL_OFFER_PERCENT_OFF,
  is_special_offer_available,
  special_offer_checkout,
  special_offer_checkout_total_cents,
  special_offer_crypto_total_cents,
  special_offer_discounted_cents,
  special_offer_pricing,
  special_offer_promo_code,
  special_offer_term_months,
} from "@/lib/special_offer";

const special_offer_source = readFileSync(
  join(process.cwd(), "src/lib/special_offer.ts"),
  "utf8",
);

describe("special_offer_pricing", () => {
  it("matches the monthly card charge", () => {
    const pricing = special_offer_pricing();

    expect(pricing).not.toBeNull();
    expect(pricing?.list_cents).toBe(899);
    expect(pricing?.offer_cents).toBe(449);
  });

  it("applies the declared discount", () => {
    const pricing = special_offer_pricing();
    const list_cents = pricing?.list_cents ?? 0;
    const discount_cents = Math.floor(
      (list_cents * SPECIAL_OFFER_PERCENT_OFF + 50) / 100,
    );

    expect(pricing?.offer_cents).toBe(list_cents - discount_cents);
  });
});

describe("special_offer_discounted_cents", () => {
  it("rounds the discount half up before subtracting it", () => {
    expect(special_offer_discounted_cents(899)).toBe(449);
    expect(special_offer_discounted_cents(2697)).toBe(1348);
    expect(special_offer_discounted_cents(900)).toBe(450);
  });

  it("never drops below the minimum charge", () => {
    expect(special_offer_discounted_cents(60)).toBe(50);
  });
});

describe("special_offer_crypto_total_cents", () => {
  it("matches what the crypto checkout charges on the server", () => {
    expect(special_offer_crypto_total_cents("nova", 1, 899)).toBe(449);
    expect(special_offer_crypto_total_cents("nova", 3, 2697)).toBe(1348);
    expect(special_offer_crypto_total_cents("nova", 6, 5394)).toBe(2697);
    expect(special_offer_crypto_total_cents("nova", 12, 8699)).toBe(4349);
  });

  it("charges full price beyond the offer duration", () => {
    expect(special_offer_crypto_total_cents("nova", 24, 14999)).toBeNull();
  });

  it("only discounts the offer plan", () => {
    expect(special_offer_crypto_total_cents("star", 1, 299)).toBeNull();
    expect(special_offer_crypto_total_cents("supernova", 12, 17399)).toBeNull();
  });

  it("never drops below the minimum charge", () => {
    expect(special_offer_crypto_total_cents("nova", 1, 60)).toBe(50);
  });
});

describe("special_offer_term_months", () => {
  it("maps checkout term ids to months", () => {
    expect(special_offer_term_months("monthly")).toBe(1);
    expect(special_offer_term_months("yearly")).toBe(12);
    expect(special_offer_term_months("biennial")).toBe(24);
    expect(special_offer_term_months("weekly")).toBeNull();
  });
});

describe("special_offer_checkout_total_cents", () => {
  it("discounts card only on monthly billing", () => {
    expect(special_offer_checkout_total_cents("card", "nova", 1, 899)).toBe(
      449,
    );
    expect(
      special_offer_checkout_total_cents("card", "nova", 12, 8699),
    ).toBeNull();
    expect(
      special_offer_checkout_total_cents("card", "nova", 24, 14999),
    ).toBeNull();
  });

  it("discounts crypto for terms up to twelve months", () => {
    expect(special_offer_checkout_total_cents("crypto", "nova", 12, 8699)).toBe(
      4349,
    );
    expect(
      special_offer_checkout_total_cents("crypto", "nova", 24, 14999),
    ).toBeNull();
  });
});

describe("special_offer_checkout", () => {
  it("prices nothing while the offer is unavailable", () => {
    const checkout = special_offer_checkout(false);

    expect(checkout.percent_off).toBeUndefined();
    expect(checkout.plan_pricing("nova")).toBeUndefined();
    expect(checkout.crypto_price("nova")).toBeUndefined();
  });

  it("prices only the offer plan", () => {
    const checkout = special_offer_checkout(true);

    expect(checkout.percent_off).toBe(SPECIAL_OFFER_PERCENT_OFF);
    expect(checkout.plan_pricing("star")).toBeUndefined();
    expect(checkout.plan_pricing(null)).toBeUndefined();
    expect(checkout.crypto_price("supernova")).toBeUndefined();
  });

  it("applies the card and crypto rules for each term", () => {
    const checkout = special_offer_checkout(true);
    const pricing = checkout.plan_pricing("nova");
    const crypto_price = checkout.crypto_price("nova");

    expect(pricing?.percent_off).toBe(SPECIAL_OFFER_PERCENT_OFF);
    expect(pricing?.discounted_total_cents("card", "monthly", 899)).toBe(449);
    expect(pricing?.discounted_total_cents("card", "yearly", 8699)).toBeNull();
    expect(pricing?.discounted_total_cents("crypto", "yearly", 8699)).toBe(
      4349,
    );
    expect(
      pricing?.discounted_total_cents("crypto", "biennial", 14999),
    ).toBeNull();
    expect(crypto_price?.(3, 2697)).toBe(1348);
    expect(crypto_price?.(24, 14999)).toBeNull();
  });
});

describe("is_special_offer_available", () => {
  it("offers to a free account", () => {
    expect(
      is_special_offer_available({
        plan_code: "free",
        is_dismissed: false,
        is_onion: false,
      }),
    ).toBe(true);
  });

  it("never offers to a paid account", () => {
    for (const plan_code of ["star", "nova", "supernova", "duo", "family"]) {
      expect(
        is_special_offer_available({
          plan_code,
          is_dismissed: false,
          is_onion: false,
        }),
      ).toBe(false);
    }
  });

  it("stays hidden once dismissed", () => {
    expect(
      is_special_offer_available({
        plan_code: "free",
        is_dismissed: true,
        is_onion: false,
      }),
    ).toBe(false);
  });

  it("stays hidden on an onion host that cannot pay", () => {
    expect(
      is_special_offer_available({
        plan_code: "free",
        is_dismissed: false,
        is_onion: true,
      }),
    ).toBe(false);
  });

  it("stays hidden while the plan is unknown", () => {
    expect(
      is_special_offer_available({
        plan_code: null,
        is_dismissed: false,
        is_onion: false,
      }),
    ).toBe(false);
  });
});

describe("special_offer_promo_code", () => {
  it("sends nothing until a code is configured", () => {
    const source = special_offer_source;

    expect(source).toContain('const SPECIAL_OFFER_PROMO_CODE = ""');
    expect(special_offer_promo_code()).toBeNull();
  });

  it("never reads a code from the page URL or from storage", () => {
    const source = special_offer_source;

    expect(source).not.toContain("location.search");
    expect(source).not.toContain("URLSearchParams");
    expect(special_offer_promo_code()).toBeNull();
  });
});
