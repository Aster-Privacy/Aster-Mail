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
  merge_untagged_snapshot,
  read_untagged_snapshot,
  untagged_open_allowed,
} from "./scheduled_untagged_snapshot";

const NOW = Date.parse("2026-11-18T00:00:00.000Z");

describe("shared scheduled snapshot format", () => {
  it("migrates a phone id list without dropping ids", () => {
    expect(
      read_untagged_snapshot({ scheduled_untagged_ids: ["b", "a", "b"] }, NOW),
    ).toEqual({ v: 1, at: "2026-11-18T00:00:00.000Z", ids: ["b", "a"] });
  });

  it("applies the cutoff of the canonical snapshot to phone ids", () => {
    const vault = {
      scheduled_untagged: {
        v: 1,
        at: "2026-11-01T00:00:00.000Z",
        ids: ["a"],
      },
      scheduled_untagged_ids: ["a"],
    };

    expect(untagged_open_allowed(vault, "a", "2026-10-31T00:00:00Z")).toBe(
      true,
    );
    expect(untagged_open_allowed(vault, "a", "2026-11-02T00:00:00Z")).toBe(
      false,
    );
  });

  it("refuses snapshot times outside the shared format", () => {
    expect(
      read_untagged_snapshot({
        scheduled_untagged: { v: 1, at: "Nov 1 2026", ids: ["a"] },
      }),
    ).toEqual({ v: 1, at: "1970-01-01T00:00:00.000Z", ids: [] });
  });

  it("orders snapshot times by instant, not by text", () => {
    const whole = { v: 1, at: "2026-11-01T00:00:00Z", ids: ["a"] };
    const fraction = { v: 1, at: "2026-11-01T00:00:00.500Z", ids: ["b"] };

    expect(merge_untagged_snapshot(fraction, whole)).toEqual(whole);
  });
});
