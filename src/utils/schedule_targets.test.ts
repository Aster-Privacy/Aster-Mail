//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it } from "vitest";

import {
  SCHEDULE_MINIMUM_LEAD_MS,
  is_schedulable_instant,
} from "./schedule_targets";

describe("is_schedulable_instant", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("rejects a time that is already past", () => {
    expect(is_schedulable_instant(new Date(now.getTime() - 1000), now)).toBe(
      false,
    );
  });

  it("rejects a time inside the minimum lead the server races", () => {
    expect(
      is_schedulable_instant(
        new Date(now.getTime() + SCHEDULE_MINIMUM_LEAD_MS - 1000),
        now,
      ),
    ).toBe(false);
  });

  it("accepts a time at the minimum lead", () => {
    expect(
      is_schedulable_instant(
        new Date(now.getTime() + SCHEDULE_MINIMUM_LEAD_MS),
        now,
      ),
    ).toBe(true);
  });

  it("rejects a missing or invalid date", () => {
    expect(is_schedulable_instant(null, now)).toBe(false);
    expect(is_schedulable_instant(new Date("nope"), now)).toBe(false);
  });
});
