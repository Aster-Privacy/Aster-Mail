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

import { afterEach, describe, expect, it } from "vitest";

import { create_work_slicer } from "./work_slicer";

function busy_wait(ms: number): void {
  const until = performance.now() + ms;

  while (performance.now() < until) {
    continue;
  }
}

function next_task(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}

afterEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
});

describe("create_work_slicer", () => {
  it("runs tasks in submission order and resolves their results", async () => {
    const slicer = create_work_slicer(8);
    const order: number[] = [];

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        slicer.run(() => {
          order.push(n);

          return n * 10;
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([10, 20, 30]);
  });

  it("rejects only the task that throws", async () => {
    const slicer = create_work_slicer(8);

    const failing = slicer.run(() => {
      throw new Error("boom");
    });
    const passing = slicer.run(() => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(passing).resolves.toBe("ok");
  });

  it("pauses once the time budget is spent instead of running everything at once", async () => {
    let pauses = 0;
    const slicer = create_work_slicer(10, async () => {
      pauses++;
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    const runs_per_slice: number[] = [];

    await Promise.all(
      Array.from({ length: 12 }, () =>
        slicer.run(() => {
          runs_per_slice[pauses] = (runs_per_slice[pauses] ?? 0) + 1;
          busy_wait(4);
        }),
      ),
    );

    expect(pauses).toBeGreaterThanOrEqual(3);
    expect(Math.max(...runs_per_slice.filter(Boolean))).toBeLessThanOrEqual(3);
  });

  it("shares the budget between tasks queued from separate microtasks", async () => {
    let pauses = 0;
    const slicer = create_work_slicer(10, async () => {
      pauses++;
      await next_task();
    });
    const runs: Promise<void>[] = [];

    for (let i = 0; i < 12; i++) {
      runs.push(slicer.run(() => busy_wait(4)));
      await Promise.resolve();
    }

    await Promise.all(runs);

    expect(pauses).toBeGreaterThanOrEqual(3);
  });

  it("starts a fresh budget once a later task has run", async () => {
    let pauses = 0;
    const slicer = create_work_slicer(8, async () => {
      pauses++;
      await next_task();
    });

    await slicer.run(() => busy_wait(12));
    await next_task();
    await next_task();
    await slicer.run(() => undefined);

    expect(pauses).toBe(0);
  });

  it("keeps running queued tasks when the pause rejects", async () => {
    const slicer = create_work_slicer(1, () =>
      Promise.reject(new Error("pause failed")),
    );

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        slicer.run(() => {
          busy_wait(2);

          return n;
        }),
      ),
    );

    expect(results).toEqual([1, 2, 3]);
  });

  it("does not pause while the page is hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });

    const slicer = create_work_slicer(1);
    let ticks = 0;
    const ticker = setTimeout(() => ticks++, 0);

    await Promise.all(
      Array.from({ length: 6 }, () => slicer.run(() => busy_wait(2))),
    );

    expect(ticks).toBe(0);
    clearTimeout(ticker);
  });
});
