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

import { is_composing } from "./ime";

describe("is_composing", () => {
  it("reports a react synthetic event that is mid-composition", () => {
    expect(is_composing({ nativeEvent: { isComposing: true } })).toBe(true);
  });

  it("reports a native event that is mid-composition", () => {
    expect(is_composing({ isComposing: true })).toBe(true);
  });

  it("treats keyCode 229 as composition for browsers without isComposing", () => {
    expect(is_composing({ nativeEvent: { keyCode: 229 } })).toBe(true);
  });

  it("does not report a plain keypress", () => {
    expect(
      is_composing({ nativeEvent: { isComposing: false, keyCode: 13 } }),
    ).toBe(false);
  });

  it("does not report an event that carries neither field", () => {
    expect(is_composing({ nativeEvent: {} })).toBe(false);
  });
});
