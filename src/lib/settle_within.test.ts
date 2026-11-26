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
import { describe, it, expect, vi, afterEach } from "vitest";

import { settle_within } from "./settle_within";

describe("settle_within", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value when the work finishes in time", async () => {
    await expect(settle_within(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("returns undefined when the work rejects", async () => {
    await expect(
      settle_within(Promise.reject(new Error("x")), 1000),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when the work never settles", async () => {
    vi.useFakeTimers();
    const pending = settle_within(new Promise<number>(() => {}), 3000);

    vi.advanceTimersByTime(3000);
    await expect(pending).resolves.toBeUndefined();
  });
});
