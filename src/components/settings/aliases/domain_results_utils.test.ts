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
import type { DomainSearchResult } from "@/services/api/domains";

import { describe, expect, it } from "vitest";

import {
  filter_results,
  is_purchasable,
  is_unchecked,
  sort_results,
} from "./domain_results_utils";

function result(
  domain: string,
  available: boolean,
  extra: Partial<DomainSearchResult> = {},
): DomainSearchResult {
  return {
    domain,
    available,
    price_cents: available ? 1000 : null,
    renewal_price_cents: available ? 1200 : null,
    currency: "usd",
    ...extra,
  };
}

const open_domain = result("open.com", true);
const taken_domain = result("taken.com", false);
const unchecked_domain = result("unchecked.com", false, {
  availability_unknown: true,
});

describe("unchecked domain results", () => {
  it("treats a missing flag as checked", () => {
    expect(is_unchecked(open_domain)).toBe(false);
    expect(is_unchecked(taken_domain)).toBe(false);
    expect(is_unchecked(unchecked_domain)).toBe(true);
  });

  it("never offers an unchecked domain for purchase", () => {
    expect(is_purchasable(open_domain)).toBe(true);
    expect(is_purchasable(taken_domain)).toBe(false);
    expect(is_purchasable(unchecked_domain)).toBe(false);
    expect(
      is_purchasable(
        result("odd.com", true, {
          availability_unknown: true,
        }),
      ),
    ).toBe(false);
  });

  it("keeps unchecked domains out of the available and taken filters", () => {
    const all = [open_domain, taken_domain, unchecked_domain];

    expect(
      filter_results(all, "available", null, null).map((r) => r.domain),
    ).toEqual(["open.com"]);
    expect(
      filter_results(all, "taken", null, null).map((r) => r.domain),
    ).toEqual(["taken.com"]);
    expect(filter_results(all, "all", null, null)).toHaveLength(3);
  });

  it("sorts unchecked domains between available and taken ones", () => {
    const sorted = sort_results(
      [taken_domain, unchecked_domain, open_domain],
      "relevance",
    );

    expect(sorted.map((r) => r.domain)).toEqual([
      "open.com",
      "unchecked.com",
      "taken.com",
    ]);
  });
});
