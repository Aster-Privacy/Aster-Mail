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

import {
  start_import_job_keepalive,
  type KeepaliveTouchResult,
} from "./job_keepalive";

const CHECK_MS = 1_000;
const IDLE_MS = 5_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

function start(touch: () => Promise<KeepaliveTouchResult>) {
  return start_import_job_keepalive(touch, {
    check_ms: CHECK_MS,
    idle_ms: IDLE_MS,
  });
}

describe("import job keepalive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("touches the job only after it has been idle", async () => {
    const touch = vi.fn(async (): Promise<KeepaliveTouchResult> => "alive");
    const keepalive = start(touch);

    await vi.advanceTimersByTimeAsync(IDLE_MS - CHECK_MS);
    expect(touch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CHECK_MS);
    expect(touch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(IDLE_MS - CHECK_MS);
    expect(touch).toHaveBeenCalledTimes(1);

    await keepalive.stop();
  });

  it("counts real job calls as activity", async () => {
    const touch = vi.fn(async (): Promise<KeepaliveTouchResult> => "alive");
    const keepalive = start(touch);

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(IDLE_MS - CHECK_MS);
      await keepalive.run(async () => "stored");
    }

    expect(touch).not.toHaveBeenCalled();
    await keepalive.stop();
  });

  it("never touches while a job call is in flight and runs calls in order", async () => {
    const touch = vi.fn(async (): Promise<KeepaliveTouchResult> => "alive");
    const keepalive = start(touch);
    const order: string[] = [];
    const slow = deferred<string>();

    const first = keepalive.run(async () => {
      order.push("first_start");
      const value = await slow.promise;

      order.push("first_end");

      return value;
    });
    const second = keepalive.run(async () => {
      order.push("second");

      return "second";
    });

    await vi.advanceTimersByTimeAsync(IDLE_MS * 3);
    expect(touch).not.toHaveBeenCalled();

    slow.resolve("first");
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual(["first_start", "first_end", "second"]);

    await keepalive.stop();
  });

  it("keeps the chain going after a failed call", async () => {
    const keepalive = start(async () => "alive");

    await expect(
      keepalive.run(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    await expect(keepalive.run(async () => "next")).resolves.toBe("next");

    await keepalive.stop();
  });

  it("reports a lost job and stops touching it", async () => {
    const touch = vi.fn(async (): Promise<KeepaliveTouchResult> => "lost");
    const keepalive = start(touch);

    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(keepalive.is_lost()).toBe(true);

    await vi.advanceTimersByTimeAsync(IDLE_MS * 3);
    expect(touch).toHaveBeenCalledTimes(1);

    await keepalive.stop();
  });

  it("does not mark the job lost on a transient error", async () => {
    const touch = vi.fn(async (): Promise<KeepaliveTouchResult> => "error");
    const keepalive = start(touch);

    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(keepalive.is_lost()).toBe(false);

    await keepalive.stop();
  });

  it("stops touching once stopped", async () => {
    const touch = vi.fn(async (): Promise<KeepaliveTouchResult> => "alive");
    const keepalive = start(touch);

    await keepalive.stop();
    await vi.advanceTimersByTimeAsync(IDLE_MS * 5);

    expect(touch).not.toHaveBeenCalled();
  });
});
