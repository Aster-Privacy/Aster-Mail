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

import { recipients_reducer } from "./compose_shared";

describe("recipients_reducer ADD", () => {
  const base = { to: ["a@x.example"], cc: [], bcc: ["c@x.example"] };

  it("adds a new address to the field", () => {
    const next = recipients_reducer(base, {
      type: "ADD",
      field: "cc",
      email: "b@x.example",
    });

    expect(next.cc).toEqual(["b@x.example"]);
  });

  it("ignores an address already present in another field", () => {
    expect(
      recipients_reducer(base, {
        type: "ADD",
        field: "cc",
        email: "A@x.example",
      }),
    ).toBe(base);
    expect(
      recipients_reducer(base, {
        type: "ADD",
        field: "to",
        email: "c@x.example",
      }),
    ).toBe(base);
  });
});
