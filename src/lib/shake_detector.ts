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
export interface ShakeSample {
  x: number;
  t: number;
}

export interface ShakeOptions {
  min_reversals: number;
  min_distance_px: number;
  window_ms: number;
}

export const DEFAULT_SHAKE_OPTIONS: ShakeOptions = {
  min_reversals: 4,
  min_distance_px: 40,
  window_ms: 1200,
};

export interface ShakeTracker {
  push: (sample: ShakeSample) => boolean;
  reset: () => void;
}

export function create_shake_tracker(
  options: ShakeOptions = DEFAULT_SHAKE_OPTIONS,
): ShakeTracker {
  let anchor: number | null = null;
  let extreme = 0;
  let direction = 0;
  let reversals: number[] = [];

  const reset = () => {
    anchor = null;
    extreme = 0;
    direction = 0;
    reversals = [];
  };

  const push = ({ x, t }: ShakeSample): boolean => {
    if (anchor === null) {
      anchor = x;
      extreme = x;

      return false;
    }

    if (direction === 0) {
      if (Math.abs(x - anchor) >= options.min_distance_px) {
        direction = x > anchor ? 1 : -1;
        extreme = x;
      }

      return false;
    }

    const travelled_back = direction > 0 ? extreme - x : x - extreme;

    if ((direction > 0 && x > extreme) || (direction < 0 && x < extreme)) {
      extreme = x;
    } else if (travelled_back >= options.min_distance_px) {
      direction = -direction;
      extreme = x;
      reversals.push(t);
    }

    reversals = reversals.filter((at) => t - at <= options.window_ms);

    return reversals.length >= options.min_reversals;
  };

  return { push, reset };
}

export function detect_shake(
  samples: readonly ShakeSample[],
  options: ShakeOptions = DEFAULT_SHAKE_OPTIONS,
): boolean {
  const tracker = create_shake_tracker(options);

  return samples.some((sample) => tracker.push(sample));
}
