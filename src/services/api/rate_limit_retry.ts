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
import type { ApiResponse } from "@/services/api/client";

const DEFAULT_MAX_ATTEMPTS = 4;
const FALLBACK_DELAY_MS = 2_000;
const MAX_DELAY_MS = 65_000;

export interface RateLimitRetryOptions {
  max_attempts?: number;
  signal?: AbortSignal;
  wait?: (ms: number) => Promise<void>;
}

function default_wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function is_rate_limited(
  response: ApiResponse<unknown> | null | undefined,
): boolean {
  if (!response) return false;

  return response.code === "RATE_LIMIT_EXCEEDED" || response.status === 429;
}

export function rate_limit_delay_ms(
  response: ApiResponse<unknown>,
  attempt: number,
): number {
  const hinted_secs = response.retry_after_secs;
  const delay =
    hinted_secs !== undefined && hinted_secs > 0
      ? hinted_secs * 1000
      : FALLBACK_DELAY_MS * 2 ** Math.max(0, attempt - 1);

  return Math.min(delay, MAX_DELAY_MS);
}

export async function with_rate_limit_retry<T>(
  request: () => Promise<ApiResponse<T>>,
  options: RateLimitRetryOptions = {},
): Promise<ApiResponse<T>> {
  const max_attempts = Math.max(
    1,
    options.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
  );
  const wait = options.wait ?? default_wait;
  let response = await request();

  for (let attempt = 1; attempt < max_attempts; attempt++) {
    if (!is_rate_limited(response) || options.signal?.aborted) {
      return response;
    }
    await wait(rate_limit_delay_ms(response, attempt));
    if (options.signal?.aborted) return response;
    response = await request();
  }

  return response;
}

export async function run_bounded<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;

      cursor += 1;
      await worker(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, next),
  );
}
