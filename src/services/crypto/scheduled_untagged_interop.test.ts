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

const PHONE_IDS = ["a", "b"];
const EARLIER = "2026-10-30T00:00:00.000Z";
const WEB_LATER = {
  v: 1,
  at: "2026-11-05T00:00:00.000Z",
  ids: ["a", "b", "x"],
};

describe("scheduled snapshot written by the phone app", () => {
  it("opens an item listed in the phone snapshot", () => {
    expect(
      untagged_open_allowed(
        { scheduled_untagged_ids: PHONE_IDS },
        "a",
        EARLIER,
      ),
    ).toBe(true);
    expect(
      untagged_open_allowed(
        { scheduled_untagged_ids: PHONE_IDS },
        "x",
        EARLIER,
      ),
    ).toBe(false);
  });

  it("never widens the phone snapshot with a later web snapshot", () => {
    const vault = {
      scheduled_untagged: WEB_LATER,
      scheduled_untagged_ids: PHONE_IDS,
    };

    expect(untagged_open_allowed(vault, "x", EARLIER)).toBe(false);
    expect(untagged_open_allowed(vault, "a", EARLIER)).toBe(true);
  });

  it("keeps the phone snapshot through a vault write", () => {
    const merged = merge_vault_for_write(
      { identity_key: "k", scheduled_untagged_ids: PHONE_IDS } as never,
      { identity_key: "k" } as never,
      { identity_key: "k", scheduled_untagged: WEB_LATER } as never,
    );

    expect(untagged_open_allowed(merged, "x", EARLIER)).toBe(false);
    expect(untagged_open_allowed(merged, "b", EARLIER)).toBe(true);
  });
});
