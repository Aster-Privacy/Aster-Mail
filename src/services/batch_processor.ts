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
const DEFAULT_BATCH_DELAY_MS = 0;

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  failed_ids: string[];
  was_cancelled: boolean;
}

export interface BatchProcessorConfig {
  ids: string[];
  batch_size: number;
  delay_ms?: number;
  process_batch: (batch_ids: string[]) => Promise<boolean>;
  on_progress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

function chunk_array<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) return items.length ? [items] : [];

  const chunk_count = Math.ceil(items.length / size);
  const chunks: T[][] = new Array(chunk_count);

  for (let i = 0; i < chunk_count; i++) {
    chunks[i] = items.slice(i * size, (i + 1) * size);
  }

  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function process_batches(
  config: BatchProcessorConfig,
): Promise<BatchResult> {
  const {
    ids,
    batch_size,
    delay_ms = DEFAULT_BATCH_DELAY_MS,
    process_batch,
    on_progress,
    signal,
  } = config;

  if (ids.length === 0) {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      failed_ids: [],
      was_cancelled: false,
    };
  }

  const chunks = chunk_array(ids, batch_size);
  const result: BatchResult = {
    total: ids.length,
    succeeded: 0,
    failed: 0,
    failed_ids: [],
    was_cancelled: false,
  };

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) {
      result.was_cancelled = true;
      break;
    }

    const batch = chunks[i];

    try {
      const success = await process_batch(batch);

      if (success) {
        result.succeeded += batch.length;
      } else {
        result.failed += batch.length;
        result.failed_ids.push(...batch);
      }
    } catch {
      result.failed += batch.length;
      result.failed_ids.push(...batch);
    }

    on_progress?.(result.succeeded + result.failed, ids.length);

    const is_last_batch = i === chunks.length - 1;

    if (!is_last_batch && delay_ms > 0 && !signal?.aborted) {
      await delay(delay_ms);
    }
  }

  return result;
}
