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

import { merge_vault_for_write } from "./vault_cas_write";
import { untagged_open_allowed } from "./scheduled_untagged_snapshot";

const SNAPSHOT = { v: 1, at: "2026-11-01T00:00:00.000Z", ids: ["a"] };
const NEWER_FORMAT = { v: 2, at: "2026-11-01T00:00:00.000Z", ids: ["a"] };
const EARLIER = "2026-10-30T00:00:00.000Z";

function opens(updated_at: unknown): boolean {
  return untagged_open_allowed(
    { scheduled_untagged: SNAPSHOT },
    "a",
    updated_at,
  );
}

describe("strict change times for untagged scheduled items", () => {
  it("refuses an item without a change time", () => {
    expect(opens(undefined)).toBe(false);
    expect(opens(null)).toBe(false);
    expect(opens(1_700_000_000_000)).toBe(false);
  });

  it("refuses change times without a time zone offset", () => {
    expect(opens("2026-10-30")).toBe(false);
    expect(opens("2026-10-30T00:00:00")).toBe(false);
    expect(opens("2026-10-30 00:00:00Z")).toBe(false);
  });

  it("reads change times with an offset the same way as the phone app", () => {
    expect(opens("2026-10-31T23:59:59.999999+00:00")).toBe(true);
    expect(opens("2026-11-01T01:00:00+02:00")).toBe(true);
    expect(opens("2026-10-31T18:00:00-05:00")).toBe(true);
    expect(opens("2026-10-31T20:00:01-04:00")).toBe(false);
  });

  it("refuses impossible dates and times", () => {
    expect(opens("2026-02-30T00:00:00Z")).toBe(false);
    expect(opens("2026-10-30T24:00:00Z")).toBe(false);
    expect(opens("2026-10-30T00:00:00+19:00")).toBe(false);
    expect(
      untagged_open_allowed(
        { scheduled_untagged: { ...SNAPSHOT, at: "2026-02-30T00:00:00.000Z" } },
        "a",
        EARLIER,
      ),
    ).toBe(false);
  });
});

describe("unreadable scheduled snapshot fields", () => {
  it("treats a damaged phone id list as empty", () => {
    expect(
      untagged_open_allowed(
        {
          scheduled_untagged: SNAPSHOT,
          scheduled_untagged_ids: "a" as never,
        },
        "a",
        EARLIER,
      ),
    ).toBe(false);
  });

  it("opens nothing from a snapshot it cannot read", () => {
    expect(
      untagged_open_allowed(
        {
          scheduled_untagged: NEWER_FORMAT as never,
          scheduled_untagged_ids: ["a"],
        },
        "a",
        EARLIER,
      ),
    ).toBe(false);
  });

  it("keeps a snapshot it cannot read through a vault write", () => {
    const merged = merge_vault_for_write(
      { identity_key: "k", scheduled_untagged: NEWER_FORMAT } as never,
      { identity_key: "k", scheduled_untagged: NEWER_FORMAT } as never,
      { identity_key: "k", scheduled_untagged: SNAPSHOT } as never,
    );

    expect(merged.scheduled_untagged).toEqual(NEWER_FORMAT);
  });
});
