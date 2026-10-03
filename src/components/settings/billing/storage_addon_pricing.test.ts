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
import type { StorageAddonItem } from "@/services/api/billing";

import { describe, expect, it } from "vitest";

import {
  catalog_has_yearly,
  catalog_yearly_save_percent,
  default_addon_interval,
  featured_addon_id,
  storage_usage_is_high,
  yearly_save_percent,
} from "./storage_addon_pricing";

function addon(
  id: string,
  name: string,
  price_cents: number,
  yearly_price_cents?: number | null,
): StorageAddonItem {
  return {
    id,
    name,
    storage_bytes: 1,
    price_cents,
    yearly_price_cents,
    billing_period: "month",
    is_active: true,
  };
}

const new_catalog = [
  addon("a", "50 GB", 199, 1999),
  addon("b", "200 GB", 499, 4999),
  addon("c", "1 TB", 1299, 12999),
];

const old_catalog = [
  addon("o1", "5 GB", 99),
  addon("o2", "100 GB", 499),
  addon("o3", "10 TB", 4999),
];

describe("yearly_save_percent", () => {
  it("rounds the yearly discount down", () => {
    expect(yearly_save_percent(199, 1999)).toBe(16);
    expect(yearly_save_percent(499, 4999)).toBe(16);
    expect(yearly_save_percent(1299, 12999)).toBe(16);
    expect(yearly_save_percent(1000, 10000)).toBe(16);
    expect(yearly_save_percent(1000, 9000)).toBe(25);
  });

  it("returns 0 without a cheaper yearly price", () => {
    expect(yearly_save_percent(199, null)).toBe(0);
    expect(yearly_save_percent(199, undefined)).toBe(0);
    expect(yearly_save_percent(199, 0)).toBe(0);
    expect(yearly_save_percent(199, 2388)).toBe(0);
    expect(yearly_save_percent(199, 3000)).toBe(0);
    expect(yearly_save_percent(0, 1999)).toBe(0);
  });
});

describe("catalog helpers", () => {
  it("uses the smallest saving across the catalog", () => {
    expect(
      catalog_yearly_save_percent([
        addon("x", "A", 1000, 9000),
        addon("y", "B", 1000, 10000),
      ]),
    ).toBe(16);
    expect(catalog_yearly_save_percent([])).toBe(0);
  });

  it("defaults to yearly only when every item has a yearly price", () => {
    expect(catalog_has_yearly(new_catalog)).toBe(true);
    expect(default_addon_interval(new_catalog)).toBe("year");
    expect(catalog_has_yearly(old_catalog)).toBe(false);
    expect(default_addon_interval(old_catalog)).toBe("month");
    expect(
      default_addon_interval([...new_catalog, addon("d", "2 TB", 2000)]),
    ).toBe("month");
    expect(default_addon_interval([])).toBe("month");
  });

  it("features the popular item", () => {
    expect(featured_addon_id(new_catalog)).toBe("b");
    expect(featured_addon_id(old_catalog)).toBe("o2");
    expect(featured_addon_id([addon("z", "7 GB", 100)])).toBeNull();
  });
});

describe("storage_usage_is_high", () => {
  it("flags usage at or above 80 percent", () => {
    expect(storage_usage_is_high(79.9)).toBe(false);
    expect(storage_usage_is_high(80)).toBe(true);
    expect(storage_usage_is_high(100)).toBe(true);
    expect(storage_usage_is_high(undefined)).toBe(false);
    expect(storage_usage_is_high(Number.NaN)).toBe(false);
    expect(storage_usage_is_high(10, true)).toBe(true);
  });
});
