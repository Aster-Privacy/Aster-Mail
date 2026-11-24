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
import {
  merge_untagged_snapshot,
  untagged_open_allowed,
} from "./scheduled_untagged_snapshot";

const FIRST = { v: 1, at: "2026-11-01T00:00:00.000Z", ids: ["a", "b"] };
const LATER = { v: 1, at: "2026-11-05T00:00:00.000Z", ids: ["a", "b", "x"] };
const EARLIER = "2026-10-30T00:00:00.000Z";

describe("untagged scheduled snapshot", () => {
  it("keeps the first snapshot when two devices record one", () => {
    expect(merge_untagged_snapshot(LATER, FIRST)).toEqual(FIRST);
    expect(merge_untagged_snapshot(undefined, LATER)).toEqual(LATER);
  });

  it("ignores damaged snapshots", () => {
    expect(
      merge_untagged_snapshot({ v: 1, at: "x", ids: [3] }, { v: 2 }, null),
    ).toBeUndefined();
    expect(
      untagged_open_allowed(
        { scheduled_untagged: { v: 1, at: "x", ids: "a" } as never },
        "a",
        EARLIER,
      ),
    ).toBe(false);
  });

  it("allows only ids from the snapshot", () => {
    expect(
      untagged_open_allowed({ scheduled_untagged: FIRST }, "a", EARLIER),
    ).toBe(true);
    expect(
      untagged_open_allowed({ scheduled_untagged: FIRST }, "x", EARLIER),
    ).toBe(false);
    expect(untagged_open_allowed({}, "a", EARLIER)).toBe(false);
  });

  it("never lets a later vault write widen the snapshot", () => {
    const merged = merge_vault_for_write(
      { identity_key: "k", scheduled_untagged: FIRST } as never,
      { identity_key: "k" } as never,
      { identity_key: "k", scheduled_untagged: LATER } as never,
    );

    expect(merged.scheduled_untagged).toEqual(FIRST);
  });
});
