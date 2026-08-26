import { afterEach, describe, expect, it, vi } from "vitest";

import { set_display_time_zone } from "@/utils/date_format";

import { expand_date_shortcut, get_first_week_day, get_week_end, get_week_start } from "./dates";

vi.mock("@/utils/date_format", async (import_original) => ({
  ...(await import_original<typeof import("@/utils/date_format")>()),
  app_locale: () => mock_locale,
}));

let mock_locale: string | undefined = "en-US";

afterEach(() => {
  vi.useRealTimers();
  mock_locale = "en-US";
});

function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("get_first_week_day", () => {
  it("starts the week on sunday for united states english", () => {
    mock_locale = "en-US";
    expect(get_first_week_day()).toBe(0);
  });

  it("starts the week on monday for german", () => {
    mock_locale = "de-DE";
    expect(get_first_week_day()).toBe(1);
  });
});

describe("get_week_start", () => {
  it("keeps sunday inside the current week for united states english", () => {
    mock_locale = "en-US";
    at("2026-08-23T15:00:00");
    expect(get_week_start().getDate()).toBe(23);
    expect(get_week_end().getDate()).toBe(29);
  });

  it("puts sunday in the closing week for german", () => {
    mock_locale = "de-DE";
    at("2026-08-23T15:00:00");
    expect(get_week_start().getDate()).toBe(17);
    expect(get_week_end().getDate()).toBe(23);
  });
});

describe("date shortcuts in an account time zone", () => {
  afterEach(() => {
    set_display_time_zone(undefined);
  });

  it("expands today to the account zone calendar day", () => {
    set_display_time_zone("Asia/Tokyo");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T22:00:00Z"));

    expect(expand_date_shortcut("today")).toEqual({
      date_from: "2026-08-24",
      date_to: "2026-08-24",
    });
  });

  it("expands yesterday to the account zone calendar day", () => {
    set_display_time_zone("Asia/Tokyo");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T22:00:00Z"));

    expect(expand_date_shortcut("yesterday")).toEqual({
      date_from: "2026-08-23",
      date_to: "2026-08-23",
    });
  });

  it("expands this month to the account zone month bounds", () => {
    set_display_time_zone("Asia/Tokyo");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T22:00:00Z"));

    expect(expand_date_shortcut("this_month")).toEqual({
      date_from: "2026-02-01",
      date_to: "2026-02-28",
    });
  });

  it("expands last month to the account zone month bounds", () => {
    set_display_time_zone("Asia/Tokyo");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));

    expect(expand_date_shortcut("last_month")).toEqual({
      date_from: "2026-02-01",
      date_to: "2026-02-28",
    });
  });
});
