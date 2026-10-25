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

import { beforeEach, describe, expect, it } from "vitest";

import {
  STORAGE_NUDGE_SNOOZE_MS,
  dismiss_storage_nudge,
  is_storage_nudge_dismissed,
  pick_storage_offer,
  storage_nudge_tier,
  storage_percent,
} from "./storage_nudge";

const GB = 1024 * 1024 * 1024;

function addon(id: string, gb: number, price_cents: number): StorageAddonItem {
  return {
    id,
    name: `${gb} GB`,
    storage_bytes: gb * GB,
    price_cents,
    billing_period: "month",
    is_active: true,
  };
}

describe("storage_percent", () => {
  it("returns zero for empty or invalid totals", () => {
    expect(storage_percent(5, 0)).toBe(0);
    expect(storage_percent(0, 10)).toBe(0);
    expect(storage_percent(Number.NaN, 10)).toBe(0);
    expect(storage_percent(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("computes the used share", () => {
    expect(storage_percent(9, 10)).toBe(90);
  });
});

describe("storage_nudge_tier", () => {
  it("stays hidden below 80 percent", () => {
    expect(storage_nudge_tier(0)).toBeNull();
    expect(storage_nudge_tier(79.9)).toBeNull();
    expect(storage_nudge_tier(Number.NaN)).toBeNull();
  });

  it("maps each threshold to a tier", () => {
    expect(storage_nudge_tier(80)).toBe("almost");
    expect(storage_nudge_tier(94.9)).toBe("almost");
    expect(storage_nudge_tier(95)).toBe("critical");
    expect(storage_nudge_tier(100)).toBe("full");
    expect(storage_nudge_tier(140)).toBe("full");
  });
});

describe("pick_storage_offer", () => {
  const catalog = [
    addon("big", 500, 999),
    addon("small", 10, 199),
    addon("mid", 100, 499),
  ];

  it("returns null without purchasable add-ons", () => {
    expect(pick_storage_offer([], 9 * GB, 10 * GB)).toBeNull();
    expect(
      pick_storage_offer([addon("free", 10, 0)], 9 * GB, 10 * GB),
    ).toBeNull();
  });

  it("picks the smallest add-on that brings usage under 80 percent", () => {
    expect(pick_storage_offer(catalog, 9 * GB, 10 * GB)?.id).toBe("small");
    expect(pick_storage_offer(catalog, 80 * GB, 80 * GB)?.id).toBe("mid");
  });

  it("falls back to the largest add-on when none is enough", () => {
    expect(pick_storage_offer(catalog, 5000 * GB, 5000 * GB)?.id).toBe("big");
  });
});

describe("storage nudge dismissal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hides the dismissed tier for a week", () => {
    const now = 1_000_000;

    dismiss_storage_nudge("almost", "user-a", now);

    expect(is_storage_nudge_dismissed("almost", "user-a", now + 1)).toBe(true);
    expect(
      is_storage_nudge_dismissed(
        "almost",
        "user-a",
        now + STORAGE_NUDGE_SNOOZE_MS,
      ),
    ).toBe(false);
  });

  it("shows again when usage reaches a higher tier", () => {
    dismiss_storage_nudge("almost", "user-a", 0);

    expect(is_storage_nudge_dismissed("critical", "user-a", 1)).toBe(false);
  });

  it("keeps each account separate", () => {
    dismiss_storage_nudge("almost", "user-a", 0);

    expect(is_storage_nudge_dismissed("almost", "user-b", 1)).toBe(false);
  });

  it("never hides a full mailbox", () => {
    dismiss_storage_nudge("full", "user-a", 0);
    dismiss_storage_nudge("critical", "user-a", 0);

    expect(is_storage_nudge_dismissed("full", "user-a", 1)).toBe(false);
  });

  it("ignores corrupt stored values", () => {
    localStorage.setItem("aster:storage_nudge_dismissed:user-a", "{oops");
    expect(is_storage_nudge_dismissed("almost", "user-a", 1)).toBe(false);

    localStorage.setItem(
      "aster:storage_nudge_dismissed:user-a",
      JSON.stringify({ tier: "nope", until: 99 }),
    );
    expect(is_storage_nudge_dismissed("almost", "user-a", 1)).toBe(false);
  });
});
