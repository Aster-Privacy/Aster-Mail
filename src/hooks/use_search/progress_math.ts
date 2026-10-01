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

export interface ProgressCounts {
  done: number;
  total: number;
}

export interface MailboxCountSource {
  total_items?: number;
  trash?: number;
}

export const PROGRESS_PUBLISH_INTERVAL_MS = 250;
export const MAX_ACTIVE_PERCENT = 99;

function whole_count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export function mailbox_index_total(
  stats: MailboxCountSource | null | undefined,
  cap: number,
): number {
  if (!stats || typeof stats.total_items !== "number") return 0;

  const total = whole_count(stats.total_items) + whole_count(stats.trash);

  return Math.min(total, whole_count(cap));
}

export function advance_counts(
  prev: ProgressCounts,
  reported: ProgressCounts,
): ProgressCounts {
  const done = Math.max(whole_count(prev.done), whole_count(reported.done));
  const known_total = Math.max(
    whole_count(prev.total),
    whole_count(reported.total),
  );
  const total = known_total > 0 ? Math.max(known_total, done) : 0;

  if (done === prev.done && total === prev.total) return prev;

  return { done, total };
}

export function progress_percent(
  counts: ProgressCounts,
  active: boolean,
): number {
  const total = whole_count(counts.total);

  if (total === 0) return 0;

  const done = Math.min(whole_count(counts.done), total);
  const percent = Math.floor((done / total) * 100);

  return active ? Math.min(percent, MAX_ACTIVE_PERCENT) : percent;
}

export function has_known_total(counts: ProgressCounts): boolean {
  return whole_count(counts.total) > 0;
}
