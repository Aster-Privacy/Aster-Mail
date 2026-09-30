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

import { afterEach, describe, expect, it } from "vitest";

import { set_display_time_zone } from "./date_format";
import {
  build_zoned_datetime,
  get_next_monday_morning,
  get_tomorrow_afternoon,
  get_tomorrow_morning,
  is_future_instant,
} from "./schedule_targets";

describe("schedule targets in an account time zone", () => {
  afterEach(() => {
    set_display_time_zone(undefined);
  });

  it("puts tomorrow morning at eight in the account zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = get_tomorrow_morning(new Date("2026-08-03T12:00:00Z"));

    expect(target.toISOString()).toBe("2026-08-03T23:00:00.000Z");
  });

  it("uses the account zone calendar day when the zones disagree", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = get_tomorrow_morning(new Date("2026-08-03T22:00:00Z"));

    expect(target.toISOString()).toBe("2026-08-04T23:00:00.000Z");
  });

  it("puts tomorrow afternoon at one in the account zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = get_tomorrow_afternoon(new Date("2026-08-03T12:00:00Z"));

    expect(target.toISOString()).toBe("2026-08-04T04:00:00.000Z");
  });

  it("skips a week when today is already monday", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = get_next_monday_morning(new Date("2026-08-03T00:00:00Z"));

    expect(target.toISOString()).toBe("2026-08-09T23:00:00.000Z");
  });

  it("picks the coming monday from the account zone weekday", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = get_next_monday_morning(new Date("2026-08-05T00:00:00Z"));

    expect(target.toISOString()).toBe("2026-08-09T23:00:00.000Z");
  });
});

describe("build_zoned_datetime", () => {
  afterEach(() => {
    set_display_time_zone(undefined);
  });

  it("reads the picker fields as account zone wall time", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = build_zoned_datetime("2026-08-25", "09:00");

    expect(target?.toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("returns null for an empty date", () => {
    expect(build_zoned_datetime("", "09:00")).toBeNull();
  });

  it("returns null for a malformed time", () => {
    expect(build_zoned_datetime("2026-08-25", "not-a-time")).toBeNull();
  });
});

describe("is_future_instant", () => {
  const now = new Date("2026-08-03T12:23:40Z");

  it("rejects an instant inside the current minute", () => {
    expect(is_future_instant(new Date("2026-08-03T12:23:00Z"), now)).toBe(
      false,
    );
  });

  it("rejects the current instant", () => {
    expect(is_future_instant(new Date("2026-08-03T12:23:40Z"), now)).toBe(
      false,
    );
  });

  it("accepts the next selectable minute", () => {
    expect(is_future_instant(new Date("2026-08-03T12:24:00Z"), now)).toBe(true);
  });

  it("rejects a missing or unparsable instant", () => {
    expect(is_future_instant(null, now)).toBe(false);
    expect(is_future_instant(new Date("nope"), now)).toBe(false);
  });
});
