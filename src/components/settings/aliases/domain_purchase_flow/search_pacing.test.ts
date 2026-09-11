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
import { describe, expect, it } from "vitest";

import {
  DOMAIN_SEARCH_RATE_LIMITED,
  SEARCH_DEFAULT_THROTTLE_MS,
  SEARCH_MAX_THROTTLE_MS,
  SEARCH_MIN_START_GAP_MS,
  classify_search_failure,
  search_start_delay,
  throttle_wait_ms,
} from "./search_pacing";

const now = Date.parse("2026-09-11T18:15:00.000Z");

describe("classify_search_failure", () => {
  it("treats the registrar throttle code as throttled", () => {
    expect(
      classify_search_failure({
        code: "RATE_LIMIT_EXCEEDED",
        server_code: DOMAIN_SEARCH_RATE_LIMITED,
      }),
    ).toBe("throttled");
  });

  it("treats a plain rate limit as a short slow down", () => {
    expect(
      classify_search_failure({
        code: "RATE_LIMIT_EXCEEDED",
        server_code: "RATE_LIMIT_EXCEEDED",
      }),
    ).toBe("slow_down");
  });

  it("keeps not released and generic failures apart", () => {
    expect(classify_search_failure({ code: "NOT_FOUND" })).toBe("not_released");
    expect(classify_search_failure({ code: "SERVICE_UNAVAILABLE" })).toBe(
      "failed",
    );
    expect(classify_search_failure({})).toBe("failed");
  });
});

describe("throttle_wait_ms", () => {
  it("prefers retry_after_secs from the details", () => {
    expect(
      throttle_wait_ms(
        {
          details: { retry_after_secs: 42 },
          resets_at: new Date(now + 5_000).toISOString(),
        },
        now,
      ),
    ).toBe(42_000);
  });

  it("falls back to resets_at", () => {
    expect(
      throttle_wait_ms(
        { resets_at: new Date(now + 30_500).toISOString() },
        now,
      ),
    ).toBe(30_500);
  });

  it("uses a minute when the server gives no hint", () => {
    expect(throttle_wait_ms({}, now)).toBe(SEARCH_DEFAULT_THROTTLE_MS);
    expect(
      throttle_wait_ms({ resets_at: new Date(now - 1_000).toISOString() }, now),
    ).toBe(SEARCH_DEFAULT_THROTTLE_MS);
    expect(throttle_wait_ms({ details: { retry_after_secs: "60" } }, now)).toBe(
      SEARCH_DEFAULT_THROTTLE_MS,
    );
  });

  it("clamps extreme values", () => {
    expect(
      throttle_wait_ms({ details: { retry_after_secs: 99_999 } }, now),
    ).toBe(SEARCH_MAX_THROTTLE_MS);
    expect(throttle_wait_ms({ details: { retry_after_secs: 0.01 } }, now)).toBe(
      1000,
    );
  });
});

describe("search_start_delay", () => {
  it("starts right away when nothing ran recently", () => {
    expect(search_start_delay(now, null, 0)).toBe(0);
    expect(search_start_delay(now, now - SEARCH_MIN_START_GAP_MS, 0)).toBe(0);
  });

  it("keeps searches spaced by the minimum gap", () => {
    expect(search_start_delay(now, now - 300, 0)).toBe(
      SEARCH_MIN_START_GAP_MS - 300,
    );
  });

  it("waits out a server cooldown", () => {
    expect(search_start_delay(now, now - 300, now + 45_000)).toBe(45_000);
  });
});
