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
import type {
  EncryptedVault,
  ScheduledUntaggedSnapshot,
} from "./key_manager_core";

export const SCHEDULED_UNTAGGED_SNAPSHOT_VERSION = 1;
export const MAX_SNAPSHOT_IDS = 5000;

const EMPTY_SNAPSHOT_AT = "1970-01-01T00:00:00.000Z";
const MAX_OFFSET_MINUTES = 18 * 60;

const SNAPSHOT_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const CHANGE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

type UntaggedVault = Pick<
  EncryptedVault,
  "scheduled_untagged" | "scheduled_untagged_ids"
>;

function strict_utc_ms(parts: string[]): number {
  const [year, month, day, hour, minute, second] = parts
    .slice(0, 6)
    .map(Number);
  const fraction = (parts[6] ?? "").slice(0, 3).padEnd(3, "0");
  const date = new Date(0);

  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number(fraction));

  const matches =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;

  return matches ? date.getTime() : NaN;
}

function snapshot_time(at: unknown): number {
  if (typeof at !== "string") return NaN;

  const match = SNAPSHOT_TIME_PATTERN.exec(at);

  return match ? strict_utc_ms(match.slice(1)) : NaN;
}

function change_time(value: unknown): number {
  if (typeof value !== "string") return NaN;

  const match = CHANGE_TIME_PATTERN.exec(value);

  if (!match) return NaN;

  const local_ms = strict_utc_ms(match.slice(1, 8));
  const sign = match[8];

  if (!sign) return local_ms;

  const offset_hours = Number(match[9]);
  const offset_minutes = Number(match[10]);
  const offset = offset_hours * 60 + offset_minutes;

  if (offset_hours > 23 || offset_minutes > 59 || offset > MAX_OFFSET_MINUTES) {
    return NaN;
  }

  return local_ms - (sign === "-" ? -offset : offset) * 60_000;
}

function is_valid_id_list(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SNAPSHOT_IDS &&
    value.every((id) => typeof id === "string" && id.length > 0)
  );
}

export function is_valid_untagged_snapshot(
  value: unknown,
): value is ScheduledUntaggedSnapshot {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;

  return (
    record.v === SCHEDULED_UNTAGGED_SNAPSHOT_VERSION &&
    !Number.isNaN(snapshot_time(record.at)) &&
    is_valid_id_list(record.ids)
  );
}

export function has_untagged_snapshot(
  vault: UntaggedVault | null | undefined,
): boolean {
  return vault?.scheduled_untagged !== undefined;
}

export function create_untagged_snapshot(
  ids: Iterable<string>,
  now: number,
): ScheduledUntaggedSnapshot {
  return {
    v: SCHEDULED_UNTAGGED_SNAPSHOT_VERSION,
    at: new Date(now).toISOString(),
    ids: [...new Set(ids)],
  };
}

function legacy_untagged_ids(
  vault: UntaggedVault | null | undefined,
): string[] | undefined {
  const legacy_ids: unknown = vault?.scheduled_untagged_ids;

  if (legacy_ids === undefined) return undefined;

  return is_valid_id_list(legacy_ids) ? legacy_ids : [];
}

export function read_untagged_snapshot(
  vault: UntaggedVault | null | undefined,
  now: number = Date.now(),
): ScheduledUntaggedSnapshot | undefined {
  const legacy_ids = legacy_untagged_ids(vault);

  if (has_untagged_snapshot(vault)) {
    const snapshot: unknown = vault?.scheduled_untagged;

    if (!is_valid_untagged_snapshot(snapshot)) {
      return {
        v: SCHEDULED_UNTAGGED_SNAPSHOT_VERSION,
        at: EMPTY_SNAPSHOT_AT,
        ids: [],
      };
    }

    const ids = legacy_ids
      ? snapshot.ids.filter((id) => legacy_ids.includes(id))
      : snapshot.ids;

    return { v: snapshot.v, at: snapshot.at, ids: [...new Set(ids)] };
  }

  return legacy_ids ? create_untagged_snapshot(legacy_ids, now) : undefined;
}

export function merge_untagged_snapshot(
  ...snapshots: unknown[]
): ScheduledUntaggedSnapshot | undefined {
  let earliest: ScheduledUntaggedSnapshot | undefined;

  for (const snapshot of snapshots) {
    if (!is_valid_untagged_snapshot(snapshot)) continue;
    if (!earliest || snapshot_time(snapshot.at) < snapshot_time(earliest.at)) {
      earliest = { v: snapshot.v, at: snapshot.at, ids: [...snapshot.ids] };
    }
  }

  return earliest;
}

export function untagged_open_allowed(
  vault: UntaggedVault | null | undefined,
  email_id: string,
  updated_at: unknown,
  now: number = Date.now(),
): boolean {
  const snapshot = read_untagged_snapshot(vault, now);

  if (!snapshot || !snapshot.ids.includes(email_id)) return false;

  const changed = change_time(updated_at);
  const taken = snapshot_time(snapshot.at);

  if (Number.isNaN(changed) || Number.isNaN(taken)) return false;

  return changed <= taken;
}
