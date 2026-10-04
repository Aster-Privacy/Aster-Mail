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
import type {
  AddonBillingInterval,
  StorageAddonItem,
} from "@/services/api/billing";

import { ADDON_BADGES } from "@/components/settings/billing/billing_constants";

export const STORAGE_USAGE_NUDGE_PERCENT = 80;

export function yearly_save_percent(
  monthly_cents: number,
  yearly_cents: number | null | undefined,
): number {
  if (!yearly_cents || yearly_cents <= 0 || monthly_cents <= 0) return 0;

  const full_year_cents = monthly_cents * 12;

  if (yearly_cents >= full_year_cents) return 0;

  return Math.floor(((full_year_cents - yearly_cents) * 100) / full_year_cents);
}

export function catalog_yearly_save_percent(
  addons: StorageAddonItem[],
): number {
  if (addons.length === 0) return 0;

  return Math.min(
    ...addons.map((addon) =>
      yearly_save_percent(addon.price_cents, addon.yearly_price_cents),
    ),
  );
}

export function catalog_has_yearly(addons: StorageAddonItem[]): boolean {
  return (
    addons.length > 0 &&
    addons.every((addon) => (addon.yearly_price_cents ?? 0) > 0)
  );
}

export function default_addon_interval(
  addons: StorageAddonItem[],
): AddonBillingInterval {
  return catalog_has_yearly(addons) ? "year" : "month";
}

export function featured_addon_id(addons: StorageAddonItem[]): string | null {
  return (
    addons.find((addon) => ADDON_BADGES[addon.name] === "popular")?.id ?? null
  );
}

export function storage_usage_is_high(
  percent: number | undefined,
  over_limit = false,
): boolean {
  if (over_limit) return true;
  if (percent === undefined || !Number.isFinite(percent)) return false;

  return percent >= STORAGE_USAGE_NUDGE_PERCENT;
}
