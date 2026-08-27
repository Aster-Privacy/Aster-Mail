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

import { days_until } from "./win_back_offer_card";

const now = Date.parse("2026-08-27T12:00:00Z");

describe("days_until", () => {
  it("rounds a partial day up so the deadline is never understated", () => {
    expect(days_until("2026-08-29T06:00:00Z", now)).toBe(2);
  });

  it("reports zero once the deadline has passed", () => {
    expect(days_until("2026-08-20T12:00:00Z", now)).toBe(0);
  });

  it("rejects a timestamp it cannot parse", () => {
    expect(days_until("not-a-date", now)).toBeNull();
  });
});
