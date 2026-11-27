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
import { is_state_changing_method } from "../csrf";

export const RATE_LIMIT_MAX_ATTEMPTS = 3;
export const RATE_LIMIT_RETRY_MAX_HOLD_MS = 10_000;
export const RATE_LIMIT_RETRY_JITTER_MS = 400;

export interface RateLimitRetryInput {
  method: string;
  retries_so_far: number;
  hold_ms: number;
}

export function should_retry_rate_limited({
  method,
  retries_so_far,
  hold_ms,
}: RateLimitRetryInput): boolean {
  if (is_state_changing_method(method)) return false;
  if (retries_so_far >= RATE_LIMIT_MAX_ATTEMPTS - 1) return false;

  return hold_ms <= RATE_LIMIT_RETRY_MAX_HOLD_MS;
}

export function rate_limit_retry_jitter_ms(
  random: () => number = Math.random,
): number {
  const sample = Math.min(Math.max(random(), 0), 1);

  return Math.round(sample * RATE_LIMIT_RETRY_JITTER_MS);
}
