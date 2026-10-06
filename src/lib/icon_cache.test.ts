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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const CURRENT = "aster_icon_cache_v10";
const RETIRED = "aster_icon_cache_v9";

async function load_icon_cache() {
  vi.resetModules();

  return import("./icon_cache");
}

describe("icon cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forgets every sender domain when it is cleared", async () => {
    localStorage.setItem(
      RETIRED,
      JSON.stringify({ "old.example": { status: "ok", ts: Date.now() } }),
    );

    const cache = await load_icon_cache();

    cache.mark_icon_failed("bank.example");
    cache.mark_icon_ok("clinic.example");
    vi.advanceTimersByTime(1500);

    expect(localStorage.getItem(CURRENT)).toContain("bank.example");

    cache.clear_icon_cache();

    expect(localStorage.getItem(CURRENT)).toBeNull();
    expect(localStorage.getItem(RETIRED)).toBeNull();
    expect(cache.is_icon_failed("bank.example")).toBe(false);
  });

  it("does not write the domains back from a pending flush", async () => {
    const cache = await load_icon_cache();

    cache.mark_icon_failed("bank.example");
    cache.clear_icon_cache();
    vi.advanceTimersByTime(5000);

    expect(localStorage.getItem(CURRENT)).toBeNull();
  });

  it("starts empty in the next session after a clear", async () => {
    const first = await load_icon_cache();

    first.mark_icon_failed("bank.example");
    vi.advanceTimersByTime(1500);
    first.clear_icon_cache();

    const second = await load_icon_cache();

    expect(second.is_icon_failed("bank.example")).toBe(false);
  });
});
