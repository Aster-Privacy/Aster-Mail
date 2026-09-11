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
export const SEARCH_DEBOUNCE_MS = 450;
export const SEARCH_MIN_START_GAP_MS = 1000;
export const SEARCH_DEFAULT_THROTTLE_MS = 60_000;
export const SEARCH_MAX_THROTTLE_MS = 300_000;
export const SEARCH_MIN_THROTTLE_MS = 1000;
export const SEARCH_MAX_GAP_RETRIES = 3;
export const SEARCH_SHORT_RETRY_MAX_SECS = 2;
export const DOMAIN_SEARCH_RATE_LIMITED = "DOMAIN_SEARCH_RATE_LIMITED";

export type search_failure_kind =
  | "throttled"
  | "slow_down"
  | "not_released"
  | "failed";

export interface search_failure_response {
  code?: string;
  server_code?: string;
  resets_at?: string;
  details?: Record<string, unknown>;
  retry_after_secs?: number;
}

function clamp_throttle_ms(ms: number): number {
  return Math.min(
    SEARCH_MAX_THROTTLE_MS,
    Math.max(SEARCH_MIN_THROTTLE_MS, Math.ceil(ms)),
  );
}

function positive_secs(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\s*\d+(\.\d+)?\s*$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function retry_after_hint_secs(
  response: search_failure_response,
): number | null {
  return (
    positive_secs(response.details?.retry_after_secs) ??
    positive_secs(response.retry_after_secs)
  );
}

export function classify_search_failure(
  response: search_failure_response,
): search_failure_kind {
  if (response.server_code === DOMAIN_SEARCH_RATE_LIMITED) return "throttled";
  if (response.code === "RATE_LIMIT_EXCEEDED") {
    const hint = retry_after_hint_secs(response);

    return hint !== null && hint > SEARCH_SHORT_RETRY_MAX_SECS
      ? "throttled"
      : "slow_down";
  }
  if (response.code === "NOT_FOUND") return "not_released";

  return "failed";
}

export function throttle_wait_ms(
  response: search_failure_response,
  now: number,
): number {
  const hint = retry_after_hint_secs(response);

  if (hint !== null) return clamp_throttle_ms(hint * 1000);
  if (response.resets_at) {
    const resets_at = Date.parse(response.resets_at);

    if (Number.isFinite(resets_at) && resets_at > now) {
      return clamp_throttle_ms(resets_at - now);
    }
  }

  return SEARCH_DEFAULT_THROTTLE_MS;
}

export function search_start_delay(
  now: number,
  last_started_at: number | null,
  blocked_until: number,
): number {
  const gap =
    last_started_at === null
      ? 0
      : last_started_at + SEARCH_MIN_START_GAP_MS - now;

  return Math.max(0, gap, blocked_until - now);
}
