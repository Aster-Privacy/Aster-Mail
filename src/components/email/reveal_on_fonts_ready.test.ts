//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  reveal_on_fonts_ready,
  REVEAL_FALLBACK_MS,
} from "./reveal_on_fonts_ready";

describe("reveal_on_fonts_ready", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals immediately when fonts are already loaded", () => {
    const reveal = vi.fn();

    reveal_on_fonts_ready(
      { status: "loaded", ready: Promise.resolve() },
      reveal,
      vi.fn(),
    );

    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("reveals immediately when the document has no fonts api", () => {
    const reveal = vi.fn();

    reveal_on_fonts_ready(undefined, reveal, vi.fn());

    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("reveals via fallback timer when fonts.ready never resolves", () => {
    const reveal = vi.fn();
    const never = new Promise<void>(() => {});

    reveal_on_fonts_ready({ status: "loading", ready: never }, reveal, vi.fn());

    expect(reveal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REVEAL_FALLBACK_MS);

    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("reveals once via fonts.ready when it resolves before the fallback", async () => {
    const reveal = vi.fn();
    const remeasure = vi.fn();

    reveal_on_fonts_ready(
      { status: "loading", ready: Promise.resolve() },
      reveal,
      remeasure,
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(remeasure).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REVEAL_FALLBACK_MS * 4);

    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("remeasures when fonts.ready resolves after the fallback already revealed", async () => {
    const reveal = vi.fn();
    const remeasure = vi.fn();
    let resolve_ready: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      resolve_ready = resolve;
    });

    reveal_on_fonts_ready({ status: "loading", ready }, reveal, remeasure);

    vi.advanceTimersByTime(REVEAL_FALLBACK_MS);

    expect(reveal).toHaveBeenCalledTimes(1);

    resolve_ready();
    await vi.advanceTimersByTimeAsync(0);

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(remeasure).toHaveBeenCalledTimes(1);
  });

  it("reveals when fonts.ready rejects", async () => {
    const reveal = vi.fn();

    reveal_on_fonts_ready(
      { status: "loading", ready: Promise.reject(new Error("blocked")) },
      reveal,
      vi.fn(),
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("cancel stops the fallback timer without revealing", () => {
    const reveal = vi.fn();
    const never = new Promise<void>(() => {});

    const cancel = reveal_on_fonts_ready(
      { status: "loading", ready: never },
      reveal,
      vi.fn(),
    );

    cancel();
    vi.advanceTimersByTime(REVEAL_FALLBACK_MS * 4);

    expect(reveal).not.toHaveBeenCalled();
  });
});
