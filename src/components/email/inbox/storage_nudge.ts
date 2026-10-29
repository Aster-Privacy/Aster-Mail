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

import { STORAGE_USAGE_NUDGE_PERCENT } from "@/components/settings/billing/storage_addon_pricing";

export type StorageNudgeTier = "almost" | "critical" | "full";

export const STORAGE_NUDGE_CRITICAL_PERCENT = 95;
export const STORAGE_NUDGE_FULL_PERCENT = 100;
export const STORAGE_NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const DISMISS_KEY_PREFIX = "aster:storage_nudge_dismissed:";

const TIER_RANK: Record<StorageNudgeTier, number> = {
  almost: 1,
  critical: 2,
  full: 3,
};

export function storage_percent(used_bytes: number, total_bytes: number) {
  if (!Number.isFinite(used_bytes) || !Number.isFinite(total_bytes)) return 0;
  if (total_bytes <= 0 || used_bytes <= 0) return 0;

  return (used_bytes / total_bytes) * 100;
}

export function storage_nudge_tier(percent: number): StorageNudgeTier | null {
  if (!Number.isFinite(percent)) return null;
  if (percent >= STORAGE_NUDGE_FULL_PERCENT) return "full";
  if (percent >= STORAGE_NUDGE_CRITICAL_PERCENT) return "critical";
  if (percent >= STORAGE_USAGE_NUDGE_PERCENT) return "almost";

  return null;
}

export function pick_storage_offer(
  addons: StorageAddonItem[],
  used_bytes: number,
  total_bytes: number,
): StorageAddonItem | null {
  const purchasable = addons
    .filter((addon) => addon.storage_bytes > 0 && addon.price_cents > 0)
    .sort((a, b) => a.storage_bytes - b.storage_bytes);

  if (purchasable.length === 0) return null;

  const relieves = purchasable.find(
    (addon) =>
      storage_percent(used_bytes, total_bytes + addon.storage_bytes) <
      STORAGE_USAGE_NUDGE_PERCENT,
  );

  return relieves ?? purchasable[purchasable.length - 1];
}

interface StoredDismissal {
  tier: StorageNudgeTier;
  until: number;
}

function dismiss_key(account_id: string | null | undefined) {
  return `${DISMISS_KEY_PREFIX}${account_id || "default"}`;
}

function read_dismissal(
  account_id: string | null | undefined,
): StoredDismissal | null {
  try {
    const raw = localStorage.getItem(dismiss_key(account_id));

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") return null;

    const { tier, until } = parsed as Partial<StoredDismissal>;

    if (tier !== "almost" && tier !== "critical" && tier !== "full") {
      return null;
    }
    if (typeof until !== "number" || !Number.isFinite(until)) return null;

    return { tier, until };
  } catch {
    return null;
  }
}

export function is_storage_nudge_dismissed(
  tier: StorageNudgeTier,
  account_id: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (tier === "full") return false;

  const stored = read_dismissal(account_id);

  if (!stored) return false;
  if (stored.until <= now) return false;

  return TIER_RANK[stored.tier] >= TIER_RANK[tier];
}

export function dismiss_storage_nudge(
  tier: StorageNudgeTier,
  account_id: string | null | undefined,
  now: number = Date.now(),
): void {
  if (tier === "full") return;

  try {
    localStorage.setItem(
      dismiss_key(account_id),
      JSON.stringify({ tier, until: now + STORAGE_NUDGE_SNOOZE_MS }),
    );
  } catch {
    return;
  }
}
