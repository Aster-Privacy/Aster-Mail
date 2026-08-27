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
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 65_000;

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  failed_ids: string[];
  was_cancelled: boolean;
}

export interface BatchAttemptOutcome {
  ok: boolean;
  retry_after_ms?: number;
}

export type BatchOutcome = boolean | BatchAttemptOutcome;

export const RATE_LIMIT_RETRY_MS = 60_000;

export function batch_retry_after_ms(response: {
  code?: string;
}): number | undefined {
  return response.code === "RATE_LIMIT_EXCEEDED"
    ? RATE_LIMIT_RETRY_MS
    : undefined;
}

export interface BatchProcessorConfig {
  ids: string[];
  batch_size: number;
  delay_ms?: number;
  max_attempts?: number;
  retry_base_delay_ms?: number;
  process_batch: (batch_ids: string[]) => Promise<BatchOutcome>;
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

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();

      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const on_abort = (): void => {
      if (timer !== null) clearTimeout(timer);
      resolve();
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", on_abort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", on_abort, { once: true });
  });
}

function normalize_outcome(outcome: BatchOutcome): BatchAttemptOutcome {
  return typeof outcome === "boolean" ? { ok: outcome } : outcome;
}

function retry_delay_ms(
  attempt: number,
  base_delay_ms: number,
  retry_after_ms?: number,
): number {
  const backoff = base_delay_ms * 2 ** (attempt - 1);

  return Math.min(Math.max(retry_after_ms ?? backoff, 0), MAX_RETRY_DELAY_MS);
}

export async function process_batches(
  config: BatchProcessorConfig,
): Promise<BatchResult> {
  const {
    ids,
    batch_size,
    delay_ms = DEFAULT_BATCH_DELAY_MS,
    max_attempts = DEFAULT_MAX_ATTEMPTS,
    retry_base_delay_ms = DEFAULT_RETRY_BASE_DELAY_MS,
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
  const attempts_allowed = Math.max(1, max_attempts);
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
    let settled = false;

    for (let attempt = 1; attempt <= attempts_allowed; attempt++) {
      let outcome: BatchAttemptOutcome;

      try {
        outcome = normalize_outcome(await process_batch(batch));
      } catch {
        outcome = { ok: false };
      }

      if (outcome.ok) {
        result.succeeded += batch.length;
        settled = true;
        break;
      }

      if (attempt === attempts_allowed || signal?.aborted) break;

      await delay(
        retry_delay_ms(attempt, retry_base_delay_ms, outcome.retry_after_ms),
        signal,
      );
    }

    if (!settled) {
      if (signal?.aborted) result.was_cancelled = true;
      result.failed += batch.length;
      result.failed_ids.push(...batch);
    }

    on_progress?.(result.succeeded + result.failed, ids.length);

    const is_last_batch = i === chunks.length - 1;

    if (!is_last_batch && delay_ms > 0 && !signal?.aborted) {
      await delay(delay_ms, signal);
    }
  }

  return result;
}
