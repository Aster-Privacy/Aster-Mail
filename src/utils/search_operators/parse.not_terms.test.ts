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

import { parse_search_query } from "./parse";

describe("parse_search_query NOT terms", () => {
  it("captures every NOT term, not only the first", () => {
    const parsed = parse_search_query("invoice NOT draft NOT paid");

    expect(parsed.operators.map((op) => op.value)).toEqual(["draft", "paid"]);
    expect(parsed.operators.every((op) => op.negated)).toBe(true);
    expect(parsed.text_query).toBe("invoice");
  });
});
