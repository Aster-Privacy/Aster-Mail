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
  apply_custom_date_range,
  apply_date_preset,
  date_preset_of_query,
} from "./search_date_presets";

describe("search date presets", () => {
  it("recognizes every preset token", () => {
    expect(date_preset_of_query("report")).toBe("any");
    expect(date_preset_of_query("report after:7d")).toBe("last_7_days");
    expect(date_preset_of_query("report after:30d")).toBe("last_30_days");
    expect(date_preset_of_query("report after:183d")).toBe("last_6_months");
    expect(date_preset_of_query("report after:365d")).toBe("last_year");
    expect(date_preset_of_query("report before:365d")).toBe("older_than_year");
  });

  it("treats any other date filter as a custom range", () => {
    expect(date_preset_of_query("after:2026-01-01")).toBe("custom");
    expect(date_preset_of_query("after:7d before:1d")).toBe("custom");
    expect(date_preset_of_query("date:today")).toBe("custom");
  });

  it("ignores negated date operators", () => {
    expect(date_preset_of_query("report -after:7d")).toBe("any");
  });

  it("replaces every date operator when a preset is applied", () => {
    expect(
      apply_date_preset("report before:2020-01-01 date:today", "last_7_days"),
    ).toBe("report after:7d");
    expect(apply_date_preset("report after:7d", "any")).toBe("report");
    expect(apply_date_preset("after:7d", "last_year")).toBe("after:365d");
  });

  it("keeps the picked end day inside a custom range", () => {
    expect(
      apply_custom_date_range("report after:7d", "2026-09-01", "2026-09-29"),
    ).toBe("report after:2026-09-01 before:2026-09-30");
  });
});
