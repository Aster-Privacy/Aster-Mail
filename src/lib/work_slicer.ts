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

export interface WorkSlicer {
  run<T>(task: () => T): Promise<T>;
}

export function yield_to_main(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}

export function create_work_slicer(
  budget_ms: number,
  pause: () => Promise<void> = yield_to_main,
): WorkSlicer {
  const queue: Array<() => void> = [];
  let slice_started_at = performance.now();
  let draining = false;

  const drain = async (): Promise<void> => {
    draining = true;

    try {
      while (queue.length > 0) {
        if (performance.now() - slice_started_at >= budget_ms) {
          await pause();
          slice_started_at = performance.now();
          continue;
        }

        queue.shift()!();
      }
    } finally {
      draining = false;
    }
  };

  return {
    run<T>(task: () => T): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          try {
            resolve(task());
          } catch (error) {
            reject(error);
          }
        });

        if (!draining) void drain();
      });
    },
  };
}
