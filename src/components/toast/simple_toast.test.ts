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

import { resolve_toast_duration } from "./simple_toast";

describe("resolve_toast_duration", () => {
  it("keeps success and info toasts short", () => {
    expect(resolve_toast_duration("success")).toBe(2000);
    expect(resolve_toast_duration("info")).toBe(2000);
    expect(resolve_toast_duration(undefined)).toBe(2000);
  });

  it("gives error toasts a longer lifetime", () => {
    expect(resolve_toast_duration("error")).toBe(6000);
  });

  it("honors an explicit duration over the default", () => {
    expect(resolve_toast_duration("error", 1000)).toBe(1000);
    expect(resolve_toast_duration("success", 8000)).toBe(8000);
  });
});
