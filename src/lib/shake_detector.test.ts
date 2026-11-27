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
import { describe, expect, it } from "vitest";

import { create_shake_tracker, detect_shake } from "./shake_detector";

function swings(
  amplitude: number,
  count: number,
  step_ms: number,
): { x: number; t: number }[] {
  const samples = [{ x: 0, t: 0 }];

  for (let i = 1; i <= count; i += 1) {
    samples.push({ x: i % 2 === 1 ? amplitude : 0, t: i * step_ms });
  }

  return samples;
}

describe("shake_detector", () => {
  it("detects a rapid back and forth drag", () => {
    expect(detect_shake(swings(80, 6, 120))).toBe(true);
  });

  it("ignores slow back and forth drags", () => {
    expect(detect_shake(swings(80, 6, 600))).toBe(false);
  });

  it("ignores small jitters", () => {
    expect(detect_shake(swings(20, 30, 40))).toBe(false);
  });

  it("ignores a long drag in one direction", () => {
    const samples = Array.from({ length: 40 }, (_, i) => ({
      x: i * 25,
      t: i * 16,
    }));

    expect(detect_shake(samples)).toBe(false);
  });

  it("starts over after a reset", () => {
    const tracker = create_shake_tracker();
    const samples = swings(80, 6, 120);

    samples.slice(0, 4).forEach((s) => tracker.push(s));
    tracker.reset();
    expect(samples.slice(4).some((s) => tracker.push(s))).toBe(false);
  });
});
