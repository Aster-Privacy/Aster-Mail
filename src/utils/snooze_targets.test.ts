import { afterEach, describe, expect, it } from "vitest";

import { compute_snooze_target } from "./snooze_targets";
import { set_display_time_zone } from "./date_format";

function local(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("compute_snooze_target", () => {
  it("adds four hours for later today", () => {
    expect(
      compute_snooze_target("later_today", local(2026, 3, 10, 9, 30)),
    ).toEqual(local(2026, 3, 10, 13, 30));
  });

  it("uses tomorrow morning rather than a fixed 24 hour offset", () => {
    expect(
      compute_snooze_target("tomorrow", local(2026, 3, 10, 23, 15)),
    ).toEqual(local(2026, 3, 11, 9, 0));
  });

  it("picks the coming saturday morning", () => {
    expect(
      compute_snooze_target("this_weekend", local(2026, 3, 11, 14, 0)),
    ).toEqual(local(2026, 3, 14, 9, 0));
  });

  it("skips a week when it is already saturday", () => {
    expect(
      compute_snooze_target("this_weekend", local(2026, 3, 14, 14, 0)),
    ).toEqual(local(2026, 3, 21, 9, 0));
  });

  it("adds seven days for next week", () => {
    expect(
      compute_snooze_target("next_week", local(2026, 3, 10, 8, 0)),
    ).toEqual(local(2026, 3, 17, 9, 0));
  });

  it("keeps the day of month for next month", () => {
    expect(
      compute_snooze_target("next_month", local(2026, 3, 10, 8, 0)),
    ).toEqual(local(2026, 4, 10, 9, 0));
  });

  it("clamps to the last day of a shorter month", () => {
    expect(
      compute_snooze_target("next_month", local(2026, 1, 31, 8, 0)),
    ).toEqual(local(2026, 2, 28, 9, 0));
  });
});

describe("compute_snooze_target in an account time zone", () => {
  afterEach(() => {
    set_display_time_zone(undefined);
  });

  it("wakes at nine in the account zone, not the device zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = compute_snooze_target(
      "tomorrow",
      new Date("2026-08-03T12:00:00Z"),
    );

    expect(target.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("uses the account zone calendar day when the zones disagree", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = compute_snooze_target(
      "tomorrow",
      new Date("2026-08-03T22:00:00Z"),
    );

    expect(target.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("reads the weekday in the account zone, not the device zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = compute_snooze_target(
      "this_weekend",
      new Date("2026-08-07T22:00:00Z"),
    );

    expect(target.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("clamps to the last day of a shorter month in the account zone", () => {
    set_display_time_zone("Asia/Tokyo");

    const target = compute_snooze_target(
      "next_month",
      new Date("2026-01-31T02:00:00Z"),
    );

    expect(target.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("keeps later today as a plain four hour offset", () => {
    set_display_time_zone("Asia/Tokyo");

    const now = new Date("2026-08-03T12:00:00Z");

    expect(compute_snooze_target("later_today", now).getTime()).toBe(
      now.getTime() + 4 * 60 * 60 * 1000,
    );
  });
});
