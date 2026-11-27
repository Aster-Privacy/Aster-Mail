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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PageResume = typeof import("./page_resume");

function set_visibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

async function load(): Promise<PageResume> {
  vi.resetModules();

  return import("./page_resume");
}

function fire_return(): void {
  set_visibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("focus"));
}

describe("page_resume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    set_visibility("visible");
  });

  afterEach(() => {
    set_visibility("visible");
    vi.useRealTimers();
  });

  it("coalesces visibility, focus and online into one run", async () => {
    const resume = await load();
    const handler = vi.fn();

    resume.subscribe_page_resume(handler);
    set_visibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);

    fire_return();
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(handler).toHaveBeenCalledTimes(1);

    const info = handler.mock.calls[0][0];

    expect([...info.reasons].sort()).toEqual(["focus", "online", "visible"]);
    expect(info.hidden_ms).toBeGreaterThanOrEqual(60_000);
  });

  it("ignores a burst inside the quiet window after a run", async () => {
    const resume = await load();
    const handler = vi.fn();

    resume.subscribe_page_resume(handler);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(resume.RESUME_QUIET_MS);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the page is hidden", async () => {
    const resume = await load();
    const handler = vi.fn();

    resume.subscribe_page_resume(handler);
    set_visibility("hidden");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(handler).not.toHaveBeenCalled();
  });

  it("skips a subscriber that ran inside its minimum interval", async () => {
    const resume = await load();
    const throttled = vi.fn();
    const eager = vi.fn();

    resume.subscribe_page_resume(throttled, { min_interval_ms: 30_000 });
    resume.subscribe_page_resume(eager);

    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(throttled).not.toHaveBeenCalled();
    expect(eager).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(throttled).toHaveBeenCalledTimes(1);
    expect(eager).toHaveBeenCalledTimes(2);
  });

  it("runs every subscriber when the connection comes back", async () => {
    const resume = await load();
    const throttled = vi.fn();

    resume.subscribe_page_resume(throttled, { min_interval_ms: 30_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(throttled).toHaveBeenCalledTimes(1);
  });

  it("yields to the browser between subscribers", async () => {
    const resume = await load();
    const order: string[] = [];

    resume.subscribe_page_resume(() => {
      order.push("first");
      setTimeout(() => order.push("task"), 0);
    });
    resume.subscribe_page_resume(() => {
      order.push("second");
    });

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(order).toEqual(["first", "task", "second"]);
  });

  it("keeps running later subscribers when one throws", async () => {
    const resume = await load();
    const after = vi.fn();

    resume.subscribe_page_resume(() => {
      throw new Error("boom");
    });
    resume.subscribe_page_resume(after);

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(after).toHaveBeenCalledTimes(1);
  });

  it("skips catch-up interval ticks while a return settles", async () => {
    const resume = await load();

    resume.subscribe_page_resume(() => undefined);

    expect(resume.should_skip_interval_tick()).toBe(false);

    window.dispatchEvent(new Event("focus"));

    expect(resume.should_skip_interval_tick()).toBe(true);

    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(resume.should_skip_interval_tick()).toBe(true);

    await vi.advanceTimersByTimeAsync(resume.RESUME_SETTLE_MS);

    expect(resume.should_skip_interval_tick()).toBe(false);

    set_visibility("hidden");

    expect(resume.should_skip_interval_tick()).toBe(true);
  });

  it("stops calling a subscriber after it unsubscribes", async () => {
    const resume = await load();
    const handler = vi.fn();
    const unsubscribe = resume.subscribe_page_resume(handler);

    unsubscribe();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(resume.RESUME_DEBOUNCE_MS + 10);

    expect(handler).not.toHaveBeenCalled();
  });
});
