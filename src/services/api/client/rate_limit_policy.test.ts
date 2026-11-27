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
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_RETRY_JITTER_MS,
  RATE_LIMIT_RETRY_MAX_HOLD_MS,
  rate_limit_retry_jitter_ms,
  should_retry_rate_limited,
} from "./rate_limit_policy";

describe("should_retry_rate_limited", () => {
  it("retries a read while attempts remain", () => {
    expect(
      should_retry_rate_limited({
        method: "GET",
        retries_so_far: 0,
        hold_ms: 2000,
      }),
    ).toBe(true);
    expect(
      should_retry_rate_limited({
        method: "get",
        retries_so_far: RATE_LIMIT_MAX_ATTEMPTS - 2,
        hold_ms: 2000,
      }),
    ).toBe(true);
  });

  it("stops after the attempt limit", () => {
    expect(
      should_retry_rate_limited({
        method: "GET",
        retries_so_far: RATE_LIMIT_MAX_ATTEMPTS - 1,
        hold_ms: 1000,
      }),
    ).toBe(false);
  });

  it("never retries a request that changes state", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        should_retry_rate_limited({ method, retries_so_far: 0, hold_ms: 1 }),
      ).toBe(false);
    }
  });

  it("gives up when the server asks for a long wait", () => {
    expect(
      should_retry_rate_limited({
        method: "GET",
        retries_so_far: 0,
        hold_ms: RATE_LIMIT_RETRY_MAX_HOLD_MS,
      }),
    ).toBe(true);
    expect(
      should_retry_rate_limited({
        method: "GET",
        retries_so_far: 0,
        hold_ms: RATE_LIMIT_RETRY_MAX_HOLD_MS + 1,
      }),
    ).toBe(false);
  });
});

describe("rate_limit_retry_jitter_ms", () => {
  it("stays inside the jitter window", () => {
    expect(rate_limit_retry_jitter_ms(() => 0)).toBe(0);
    expect(rate_limit_retry_jitter_ms(() => 0.5)).toBe(
      RATE_LIMIT_RETRY_JITTER_MS / 2,
    );
    expect(rate_limit_retry_jitter_ms(() => 1)).toBe(
      RATE_LIMIT_RETRY_JITTER_MS,
    );
    expect(rate_limit_retry_jitter_ms(() => 7)).toBe(
      RATE_LIMIT_RETRY_JITTER_MS,
    );
    expect(rate_limit_retry_jitter_ms(() => -1)).toBe(0);
  });
});
