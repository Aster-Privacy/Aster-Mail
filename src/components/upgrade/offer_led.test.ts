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

import { layout_led, led_text } from "./offer_led";

describe("led_text", () => {
  it("shows the real discount as a whole percent", () => {
    expect(led_text(40)).toBe("-40%");
    expect(led_text(12.5)).toBe("-13%");
  });
});

describe("layout_led", () => {
  it("returns nothing when no canvas is available", () => {
    expect(layout_led("-40%", () => null)).toBeNull();
  });
});
