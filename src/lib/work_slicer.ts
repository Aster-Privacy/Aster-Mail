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

import { ignore_error } from "@/lib/ignore_error";
import { yield_to_visible_page } from "@/lib/scheduling";

export interface WorkSlicer {
  run<T>(task: () => T): Promise<T>;
}

export function create_work_slicer(
  budget_ms: number,
  pause: () => Promise<void> = yield_to_visible_page,
): WorkSlicer {
  const queue: Array<() => void> = [];
  let slice_started_at = performance.now();
  let draining = false;
  let later_task_seen = false;
  let idle_timer: ReturnType<typeof setTimeout> | null = null;

  const start_slice = (): void => {
    slice_started_at = performance.now();
    later_task_seen = false;
  };

  const watch_for_later_task = (): void => {
    if (idle_timer !== null) return;

    idle_timer = setTimeout(() => {
      idle_timer = null;
      later_task_seen = true;
    }, 0);
  };

  const drain = async (): Promise<void> => {
    draining = true;

    try {
      while (queue.length > 0) {
        if (performance.now() - slice_started_at >= budget_ms) {
          try {
            await pause();
          } catch (caught) {
            ignore_error("lib/work_slicer:pause", caught);
          }
          start_slice();
          continue;
        }

        queue.shift()!();
      }
    } finally {
      draining = false;
      watch_for_later_task();
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

        if (draining) return;
        if (later_task_seen) start_slice();

        void drain();
      });
    },
  };
}
