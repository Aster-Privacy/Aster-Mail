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

const REMOVAL_MEMORY_MS = 300_000;
const RECENT_REMOVAL_MS = 20_000;

const removed_at = new Map<string, number>();

function prune(now: number): void {
  if (removed_at.size === 0) return;

  const cutoff = now - REMOVAL_MEMORY_MS;

  for (const [id, at] of removed_at) {
    if (at <= cutoff) removed_at.delete(id);
  }
}

export function note_removed_ids(ids: string[]): void {
  const now = Date.now();

  prune(now);

  for (const id of ids) {
    if (id) removed_at.set(id, now);
  }
}

export function forget_removed_ids(ids: string[]): void {
  for (const id of ids) removed_at.delete(id);
}

export function clear_removed_items(): void {
  removed_at.clear();
}

export function was_removed_after(id: string, since: number): boolean {
  const at = removed_at.get(id);

  return at !== undefined && at >= since;
}

export function is_recently_removed(id: string): boolean {
  const at = removed_at.get(id);

  return at !== undefined && Date.now() - at < RECENT_REMOVAL_MS;
}

export function drop_removed_after<T extends { id: string }>(
  rows: T[],
  since: number,
): T[] {
  if (removed_at.size === 0) return rows;

  const kept = rows.filter((row) => !was_removed_after(row.id, since));

  return kept.length === rows.length ? rows : kept;
}
