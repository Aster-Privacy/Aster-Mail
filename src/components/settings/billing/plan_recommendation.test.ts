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

import { describe, expect, it } from "vitest";

import {
  compute_plan_recommendation,
  plan_ladder,
  plan_rank,
  storage_percent,
} from "./plan_recommendation";

const gb = (n: number) => n * 1024 * 1024 * 1024;

describe("plan_ladder", () => {
  it("maps family plan codes to the family ladder", () => {
    expect(plan_ladder("duo")).toBe("family");
    expect(plan_ladder("family")).toBe("family");
  });

  it("maps everything else to the individual ladder", () => {
    expect(plan_ladder("free")).toBe("individual");
    expect(plan_ladder("supernova")).toBe("individual");
    expect(plan_ladder(null)).toBe("individual");
  });
});

describe("plan_rank", () => {
  it("orders individual plans", () => {
    expect(plan_rank("free")).toBe(0);
    expect(plan_rank("supernova")).toBe(3);
  });

  it("returns -1 for unknown plans", () => {
    expect(plan_rank("enterprise")).toBe(-1);
    expect(plan_rank(undefined)).toBe(-1);
  });
});

describe("storage_percent", () => {
  it("returns zero when the limit is missing or zero", () => {
    expect(storage_percent(gb(1), 0)).toBe(0);
    expect(storage_percent(gb(1), null)).toBe(0);
  });

  it("clamps to one hundred", () => {
    expect(storage_percent(gb(20), gb(10))).toBe(100);
  });
});

describe("compute_plan_recommendation", () => {
  it("recommends nova and family to users without a paid plan", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "free",
      storage_used_bytes: 0,
      storage_limit_bytes: gb(1),
    });

    expect(result.is_paid).toBe(false);
    expect(result.recommended_plan_code).toBe("nova");
    expect(result.recommended_family_plan_code).toBe("family");
    expect(result.suggest_storage_addon).toBe(false);
  });

  it("recommends nothing to a paid user with room to spare", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "star",
      storage_used_bytes: gb(1),
      storage_limit_bytes: gb(100),
    });

    expect(result.recommended_plan_code).toBeNull();
    expect(result.recommended_family_plan_code).toBeNull();
    expect(result.storage_is_tight).toBe(false);
    expect(result.suggest_storage_addon).toBe(false);
  });

  it("recommends the next tier up when storage is tight", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "star",
      storage_used_bytes: gb(90),
      storage_limit_bytes: gb(100),
    });

    expect(result.storage_is_tight).toBe(true);
    expect(result.recommended_plan_code).toBe("nova");
    expect(result.recommended_family_plan_code).toBeNull();
  });

  it("never recommends an individual plan to a family subscriber", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "duo",
      storage_used_bytes: gb(95),
      storage_limit_bytes: gb(100),
    });

    expect(result.ladder).toBe("family");
    expect(result.recommended_plan_code).toBeNull();
    expect(result.recommended_family_plan_code).toBe("family");
  });

  it("acknowledges the top family plan and points at add-on storage", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "family",
      storage_used_bytes: gb(2900),
      storage_limit_bytes: gb(3000),
    });

    expect(result.is_top_tier).toBe(true);
    expect(result.recommended_plan_code).toBeNull();
    expect(result.recommended_family_plan_code).toBeNull();
    expect(result.suggest_storage_addon).toBe(true);
  });

  it("acknowledges the top individual plan", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "supernova",
      storage_used_bytes: gb(10),
      storage_limit_bytes: gb(500),
    });

    expect(result.is_top_tier).toBe(true);
    expect(result.suggest_storage_addon).toBe(true);
    expect(result.recommended_plan_code).toBeNull();
  });

  it("treats an unknown plan code as unpaid", () => {
    const result = compute_plan_recommendation({
      current_plan_code: "enterprise",
      storage_used_bytes: gb(1),
      storage_limit_bytes: gb(10),
    });

    expect(result.is_paid).toBe(false);
    expect(result.recommended_plan_code).toBe("nova");
  });
});
