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
interface SchedulerWithYield {
  yield?: () => Promise<void>;
}

export function yield_to_browser(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerWithYield })
    .scheduler;

  if (typeof scheduler?.yield === "function") {
    return scheduler.yield();
  }

  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export const DEFAULT_MAP_CHUNK = 32;

export async function map_in_chunks<T, R>(
  items: readonly T[],
  handler: (item: T, index: number) => Promise<R>,
  chunk_size: number = DEFAULT_MAP_CHUNK,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = [];

  for (let start = 0; start < items.length; start += chunk_size) {
    if (signal?.aborted) break;

    const chunk = items.slice(start, start + chunk_size);
    const settled = await Promise.all(
      chunk.map((item, offset) => handler(item, start + offset)),
    );

    results.push(...settled);
    await yield_to_browser();
  }

  return results;
}

export async function for_each_yielding<T>(
  items: readonly T[],
  chunk_size: number,
  handler: (item: T, index: number) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<void> {
  for (let index = 0; index < items.length; index += 1) {
    if (signal?.aborted) return;

    await handler(items[index], index);

    if (index > 0 && index % chunk_size === 0) {
      await yield_to_browser();
    }
  }
}
