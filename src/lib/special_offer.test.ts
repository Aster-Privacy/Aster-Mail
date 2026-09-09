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
  special_offer_pricing,
  special_offer_promo_code,
} from "@/lib/special_offer";

const special_offer_source = readFileSync(
  join(process.cwd(), "src/lib/special_offer.ts"),
  "utf8",
);

describe("special_offer_pricing", () => {
  it("halves the list price", () => {
    const pricing = special_offer_pricing();

    expect(pricing).not.toBeNull();
    expect(pricing?.list_cents).toBe(899);
    expect(pricing?.offer_cents).toBe(450);
  });

  it("applies the declared discount", () => {
    const pricing = special_offer_pricing();
    const expected = Math.round(
      ((pricing?.list_cents ?? 0) * (100 - SPECIAL_OFFER_PERCENT_OFF)) / 100,
    );

    expect(pricing?.offer_cents).toBe(expected);
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
