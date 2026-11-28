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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { is_deadline_exceeded, within_deadline } from "@/lib/deadline";

describe("within_deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects work that never settles once the deadline passes", async () => {
    const result = within_deadline(new Promise<number>(() => undefined), 500)
      .then(() => "resolved")
      .catch((error: unknown) =>
        is_deadline_exceeded(error) ? "expired" : "other",
      );

    await vi.advanceTimersByTimeAsync(500);

    expect(await result).toBe("expired");
  });

  it("passes through work that settles in time", async () => {
    const result = within_deadline(Promise.resolve(7), 500);

    expect(await result).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes through a rejection from the work itself", async () => {
    const failure = new Error("boom");

    await expect(within_deadline(Promise.reject(failure), 500)).rejects.toBe(
      failure,
    );
  });
});
