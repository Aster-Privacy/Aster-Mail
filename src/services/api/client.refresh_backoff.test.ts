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

import { refresh_backoff_ms } from "./client";

describe("refresh_backoff_ms", () => {
  it("does not wait before the first attempt", () => {
    expect(refresh_backoff_ms(0)).toBe(0);
  });

  it("doubles the wait after each consecutive failure", () => {
    expect(refresh_backoff_ms(1)).toBe(30_000);
    expect(refresh_backoff_ms(2)).toBe(60_000);
    expect(refresh_backoff_ms(3)).toBe(120_000);
    expect(refresh_backoff_ms(4)).toBe(240_000);
  });

  it("never waits longer than the regular refresh interval", () => {
    expect(refresh_backoff_ms(6)).toBe(600_000);
    expect(refresh_backoff_ms(1_000)).toBe(600_000);
  });
});
