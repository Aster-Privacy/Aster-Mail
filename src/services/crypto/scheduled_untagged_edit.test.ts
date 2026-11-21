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

import { untagged_open_allowed } from "./scheduled_untagged_snapshot";

const SNAPSHOT = { v: 1, at: "2026-11-01T00:00:00.000Z", ids: ["a"] };

describe("an untagged scheduled item changed after the snapshot", () => {
  it("opens while the item is unchanged since the snapshot", () => {
    expect(
      untagged_open_allowed(
        { scheduled_untagged: SNAPSHOT },
        "a",
        "2026-10-30T08:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      untagged_open_allowed(
        { scheduled_untagged: SNAPSHOT },
        "a",
        "2026-11-01T00:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("drops out of the allowlist once it changes after the snapshot", () => {
    expect(
      untagged_open_allowed(
        { scheduled_untagged: SNAPSHOT },
        "a",
        "2026-11-01T00:00:01.000Z",
      ),
    ).toBe(false);
  });

  it("refuses an unreadable change time", () => {
    expect(
      untagged_open_allowed({ scheduled_untagged: SNAPSHOT }, "a", "never"),
    ).toBe(false);
  });
});
