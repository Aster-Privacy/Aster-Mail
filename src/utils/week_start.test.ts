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

import {
  app_week_start_index,
  is_week_start_preference,
  normalize_week_start,
  set_display_week_start,
  week_start_index,
  week_start_label,
} from "./week_start";

afterEach(() => {
  set_display_week_start(undefined);
});

describe("week_start_index", () => {
  it("maps each calendar preference to its day index", () => {
    expect(week_start_index("sunday")).toBe(0);
    expect(week_start_index("monday")).toBe(1);
    expect(week_start_index("saturday")).toBe(6);
  });

  it("falls back to sunday when the preference is missing or unknown", () => {
    expect(week_start_index(undefined)).toBe(0);
    expect(week_start_index("tuesday")).toBe(0);
    expect(week_start_index(1)).toBe(0);
  });
});

describe("normalize_week_start", () => {
  it("keeps valid values and replaces anything else with sunday", () => {
    expect(normalize_week_start("monday")).toBe("monday");
    expect(normalize_week_start("Monday")).toBe("sunday");
    expect(normalize_week_start(null)).toBe("sunday");
  });

  it("recognizes only the three calendar values", () => {
    expect(is_week_start_preference("saturday")).toBe(true);
    expect(is_week_start_preference("friday")).toBe(false);
    expect(is_week_start_preference(undefined)).toBe(false);
  });
});

describe("app_week_start_index", () => {
  it("is undefined until a preference is set", () => {
    expect(app_week_start_index()).toBeUndefined();
  });

  it("follows the stored preference and clears on an invalid value", () => {
    set_display_week_start("monday");
    expect(app_week_start_index()).toBe(1);
    set_display_week_start("saturday");
    expect(app_week_start_index()).toBe(6);
    set_display_week_start("bogus");
    expect(app_week_start_index()).toBeUndefined();
  });
});

describe("week_start_label", () => {
  it("names the weekday in the requested locale", () => {
    expect(week_start_label("sunday", "en-US")).toBe("Sunday");
    expect(week_start_label("monday", "en-US")).toBe("Monday");
    expect(week_start_label("saturday", "de-DE")).toBe("Samstag");
  });
});
