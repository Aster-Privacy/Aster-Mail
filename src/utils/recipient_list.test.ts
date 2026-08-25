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

import { split_recipient_list } from "./recipient_list";

describe("split_recipient_list", () => {
  it("keeps a comma inside a quoted display name", () => {
    const parts = split_recipient_list(
      '"Doe, John" <john@example.com>, "Roe, Jane" <jane@example.com>',
    );

    expect(parts).toEqual([
      '"Doe, John" <john@example.com>',
      '"Roe, Jane" <jane@example.com>',
    ]);
  });

  it("splits on the separators a pasted list uses", () => {
    expect(
      split_recipient_list("a@example.com; b@example.com\nc@example.com"),
    ).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
  });

  it("ignores a separator inside angle brackets", () => {
    expect(split_recipient_list("Team <team@example.com>")).toEqual([
      "Team <team@example.com>",
    ]);
  });

  it("drops empty fragments and trims each part", () => {
    expect(split_recipient_list("  a@example.com , , b@example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("keeps an escaped quote inside a display name", () => {
    expect(
      split_recipient_list(
        '"Jo \\\"Jay\\\", Doe" <jo@example.com>, b@example.com',
      ),
    ).toEqual(['"Jo \\\"Jay\\\", Doe" <jo@example.com>', "b@example.com"]);
  });
});
