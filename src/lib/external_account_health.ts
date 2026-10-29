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
export const EXTERNAL_ACCOUNT_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;

export type ExternalAccountHealthState =
  | "paused"
  | "needs_reauth"
  | "syncing"
  | "failing"
  | "never_synced"
  | "healthy";

export interface ExternalAccountHealthInput {
  is_enabled: boolean;
  needs_reauth: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  created_at: string | null;
}

export interface ExternalAccountHealthRecord extends ExternalAccountHealthInput {
  id: string;
  email: string;
  protocol: string;
  problem_since: number | null;
}

export interface ExternalAccountHealth {
  state: ExternalAccountHealthState;
  failing_since: number | null;
  needs_attention: boolean;
}

const FAILED_STATUSES = new Set(["error", "failed", "quota_exceeded"]);
const ACTIVE_STATUSES = new Set(["syncing", "pending", "purging"]);

export function parse_timestamp(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string" || value.length === 0) return null;

  const ms = Date.parse(value);

  return Number.isFinite(ms) ? ms : null;
}

export function get_external_account_state(
  account: ExternalAccountHealthInput,
): ExternalAccountHealthState {
  if (account.needs_reauth) return "needs_reauth";
  if (!account.is_enabled) return "paused";

  const status = account.last_sync_status ?? "";

  if (ACTIVE_STATUSES.has(status)) return "syncing";
  if (FAILED_STATUSES.has(status)) return "failing";
  if (parse_timestamp(account.last_sync_at) === null) return "never_synced";

  return "healthy";
}

export function is_problem_state(state: ExternalAccountHealthState): boolean {
  return state === "needs_reauth" || state === "failing";
}

export function classify_external_account(
  account: ExternalAccountHealthInput,
  now: number,
  problem_since: number | null = null,
): ExternalAccountHealth {
  const state = get_external_account_state(account);

  if (state === "needs_reauth") {
    return {
      state,
      failing_since: null,
      needs_attention: account.is_enabled,
    };
  }

  if (state !== "failing") {
    return { state, failing_since: null, needs_attention: false };
  }

  const candidates = [
    parse_timestamp(account.last_sync_at) ??
      parse_timestamp(account.created_at),
    problem_since,
  ].filter((value): value is number => Number.isFinite(value));

  const failing_since = candidates.length > 0 ? Math.min(...candidates) : null;
  const needs_attention =
    failing_since !== null &&
    Number.isFinite(now) &&
    now - failing_since >= EXTERNAL_ACCOUNT_ALERT_AFTER_MS;

  return { state, failing_since, needs_attention };
}

export interface ExternalAccountAlert {
  record: ExternalAccountHealthRecord;
  state: ExternalAccountHealthState;
}

export function get_external_account_alerts(
  records: ExternalAccountHealthRecord[],
  now: number,
): ExternalAccountAlert[] {
  const alerts: ExternalAccountAlert[] = [];

  for (const record of records) {
    const health = classify_external_account(record, now, record.problem_since);

    if (health.needs_attention) alerts.push({ record, state: health.state });
  }

  return alerts;
}

export function build_alert_signature(alerts: ExternalAccountAlert[]): string {
  return alerts
    .map(({ record, state }) => `${record.id}:${state}`)
    .sort()
    .join("|");
}
