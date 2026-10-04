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
import { afterEach, describe, expect, it, vi } from "vitest";

const recovery = vi.hoisted(() => ({ trigger: vi.fn(() => true) }));

vi.mock("@/lib/chunk_recovery", async (import_original) => ({
  ...(await import_original<typeof import("@/lib/chunk_recovery")>()),
  trigger_chunk_recovery: recovery.trigger,
}));

const { import_with_retry, preload_when_idle } =
  await import("./lazy_with_retry");

const CHUNK_ERROR = new TypeError(
  "Failed to fetch dynamically imported module: /assets/compose_window.js",
);

afterEach(() => {
  recovery.trigger.mockClear();
  vi.unstubAllGlobals();
});

describe("import_with_retry", () => {
  it("retries a failed import and resolves with the module", async () => {
    const import_fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(CHUNK_ERROR)
      .mockResolvedValueOnce("module");

    await expect(import_with_retry(import_fn, 3, 0)).resolves.toBe("module");
    expect(import_fn).toHaveBeenCalledTimes(2);
    expect(recovery.trigger).not.toHaveBeenCalled();
  });

  it("reloads the app once when a chunk stays missing", async () => {
    const import_fn = vi.fn(() => Promise.reject(CHUNK_ERROR));
    const settled = vi.fn();

    void import_with_retry(import_fn, 2, 0).then(settled, settled);

    await vi.waitFor(() => expect(recovery.trigger).toHaveBeenCalledTimes(1));
    expect(import_fn).toHaveBeenCalledTimes(3);
    expect(settled).not.toHaveBeenCalled();
  });

  it("surfaces other errors without reloading", async () => {
    const import_fn = vi.fn(() => Promise.reject(new Error("render failed")));

    await expect(import_with_retry(import_fn, 1, 0)).rejects.toThrow(
      "render failed",
    );
    expect(import_fn).toHaveBeenCalledTimes(2);
    expect(recovery.trigger).not.toHaveBeenCalled();
  });
});

describe("preload_when_idle", () => {
  it("runs the preload when the browser is idle and can be cancelled", () => {
    const callbacks: Array<() => void> = [];
    const cancel = vi.fn();

    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: () => void) => callbacks.push(callback)),
    );
    vi.stubGlobal("cancelIdleCallback", cancel);

    const preload = vi.fn();
    const stop = preload_when_idle(preload);

    expect(preload).not.toHaveBeenCalled();
    callbacks.forEach((callback) => callback());
    expect(preload).toHaveBeenCalledTimes(1);

    stop();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
