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
  history_standing,
  published_at_us,
  received_at_us,
  RETIREMENT_GRACE_US,
  retired_at_us,
  standing_confirms,
  standing_is_retired,
  type PublishedIdentityEntry,
  type SenderKeyStanding,
} from "./sender_key_retirement";

const SECOND = 1_000_000;
const OLD_LAST = 1_790_000_000 * SECOND;
const NEW_FIRST = OLD_LAST + 7200 * SECOND;
const NEWER_FIRST = NEW_FIRST + 86_400 * SECOND;

function iso(us: number): string {
  return new Date(us / 1000).toISOString();
}

function entry(
  key: string,
  first: string | null,
  last: string | null,
): PublishedIdentityEntry {
  return {
    kem_identity_key: key,
    first_published_at: first,
    last_published_at: last,
  };
}

const HISTORY = [
  entry("newer", iso(NEWER_FIRST), iso(NEW_FIRST + 90_000 * SECOND)),
  entry("new", iso(NEW_FIRST), iso(NEW_FIRST + 86_400 * SECOND)),
  entry("old", iso(OLD_LAST - 86_400 * SECOND), iso(OLD_LAST)),
];

describe("sender key retirement", () => {
  it("parses server timestamps to microseconds", () => {
    expect(published_at_us("2026-09-21T14:13:20.123456+00:00")).toBe(
      1_790_000_000_123_456,
    );
    expect(published_at_us("2026-09-21T14:13:20.123456Z")).toBe(
      1_790_000_000_123_456,
    );
    expect(published_at_us("2026-09-21T16:13:20+02:00")).toBe(OLD_LAST);
    expect(published_at_us("2026-09-21T14:13:20.123456789Z")).toBe(
      1_790_000_000_123_456,
    );
    expect(published_at_us("yesterday")).toBeNull();
    expect(published_at_us("")).toBeNull();
    expect(published_at_us(null)).toBeNull();
    expect(published_at_us("2026-02-30T00:00:00Z")).toBeNull();
  });

  it("retires a key when its successor is first published", () => {
    expect(retired_at_us("old", HISTORY)).toBe(NEW_FIRST);
    expect(retired_at_us("new", HISTORY)).toBe(NEW_FIRST + 86_400 * SECOND);
    expect(retired_at_us("old", [HISTORY[2]])).toBe(OLD_LAST);
    expect(retired_at_us("missing", HISTORY)).toBeNull();
  });

  it("skips a successor whose date cannot be read", () => {
    expect(
      retired_at_us("old", [entry("new", "soon", iso(NEW_FIRST)), HISTORY[2]]),
    ).toBe(OLD_LAST);
  });

  it("keeps a retired key valid only up to the grace window", () => {
    expect(history_standing("old", HISTORY, OLD_LAST - 1)).toBe("in_window");
    expect(
      history_standing("old", HISTORY, NEW_FIRST + RETIREMENT_GRACE_US),
    ).toBe("in_window");
    expect(
      history_standing("old", HISTORY, NEW_FIRST + RETIREMENT_GRACE_US + 1),
    ).toBe("retired");
  });

  it("retires a key received before its window opens", () => {
    const old_first = OLD_LAST - 86_400 * SECOND;

    expect(
      history_standing("old", HISTORY, old_first - RETIREMENT_GRACE_US),
    ).toBe("in_window");
    expect(
      history_standing("old", HISTORY, old_first - RETIREMENT_GRACE_US - 1),
    ).toBe("retired");
    expect(
      history_standing(
        "old",
        [entry("old", "soon", iso(OLD_LAST))],
        OLD_LAST - 1,
      ),
    ).toBe("undated");
  });

  it("treats an unknown date as undated and an unknown key as unlisted", () => {
    expect(history_standing("old", HISTORY, null)).toBe("undated");
    expect(
      history_standing(
        "old",
        [
          entry("new", iso(NEW_FIRST), iso(NEW_FIRST)),
          entry("old", iso(OLD_LAST), null),
        ],
        OLD_LAST,
      ),
    ).toBe("undated");
    expect(history_standing("stranger", HISTORY, OLD_LAST)).toBe("unlisted");
    expect(history_standing("old", [], OLD_LAST)).toBe("unlisted");
  });

  it("converts a server receive time in milliseconds", () => {
    expect(received_at_us(1_790_000_000_000)).toBe(OLD_LAST);
    expect(received_at_us(undefined)).toBeNull();
    expect(received_at_us(0)).toBeNull();
    expect(received_at_us(Number.NaN)).toBeNull();
  });

  it("confirms only current and in-window keys", () => {
    const all: SenderKeyStanding[] = [
      "current",
      "in_window",
      "retired",
      "undated",
      "unlisted",
      "unavailable",
    ];

    expect(all.filter(standing_confirms)).toEqual(["current", "in_window"]);
    expect(all.filter(standing_is_retired)).toEqual(["retired", "undated"]);
    expect(standing_confirms(null)).toBe(false);
    expect(standing_is_retired(null)).toBe(false);
  });
});
