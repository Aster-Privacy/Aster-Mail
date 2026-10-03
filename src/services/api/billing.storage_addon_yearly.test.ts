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
import { describe, it, expect } from "vitest";

import {
  addon_charge_cents,
  addon_has_yearly,
  addon_term_total_cents,
  type StorageAddonItem,
} from "./billing";

function addon(overrides: Partial<StorageAddonItem> = {}): StorageAddonItem {
  return {
    id: "addon",
    name: "200 GB",
    storage_bytes: 214_748_364_800,
    price_cents: 499,
    yearly_price_cents: 4999,
    billing_period: "month",
    is_active: true,
    ...overrides,
  };
}

describe("storage add-on yearly pricing", () => {
  it("charges the yearly price only when yearly is chosen and offered", () => {
    expect(addon_charge_cents(addon())).toBe(499);
    expect(addon_charge_cents(addon({ billing_interval: "year" }))).toBe(4999);
    expect(
      addon_charge_cents(
        addon({ billing_interval: "year", yearly_price_cents: null }),
      ),
    ).toBe(499);
  });

  it("treats a missing or zero yearly price as monthly only", () => {
    expect(addon_has_yearly(addon())).toBe(true);
    expect(addon_has_yearly(addon({ yearly_price_cents: undefined }))).toBe(
      false,
    );
    expect(addon_has_yearly(addon({ yearly_price_cents: 0 }))).toBe(false);
  });

  it("prices prepaid crypto terms with the yearly rate for whole years", () => {
    expect(addon_term_total_cents(499, 4999, 1)).toBe(499);
    expect(addon_term_total_cents(499, 4999, 6)).toBe(2994);
    expect(addon_term_total_cents(499, 4999, 12)).toBe(4999);
    expect(addon_term_total_cents(499, 4999, 24)).toBe(9998);
    expect(addon_term_total_cents(299, null, 12)).toBe(3588);
  });
});
