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

import { spoken_secret } from "./spoken_secret";

describe("spoken_secret", () => {
  it("spaces every character and groups by four", () => {
    expect(spoken_secret("ABCDEFGH")).toBe("A B C D, E F G H");
  });

  it("keeps a trailing partial group", () => {
    expect(spoken_secret("ABCDEF")).toBe("A B C D, E F");
  });

  it("strips whitespace before grouping", () => {
    expect(spoken_secret(" AB CD ")).toBe("A B C D");
  });

  it("returns an empty string for empty input", () => {
    expect(spoken_secret("")).toBe("");
  });
});
