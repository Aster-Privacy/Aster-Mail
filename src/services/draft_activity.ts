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
export const DRAFT_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;

const last_activity = new Map<string, number>();
const in_flight = new Map<string, number>();
const open_checks = new Set<(draft_id: string) => boolean>();

export function note_draft_activity(draft_id: string, now = Date.now()): void {
  if (!draft_id) return;
  last_activity.set(draft_id, now);
}

export function begin_draft_write(draft_id: string, now = Date.now()): void {
  if (!draft_id) return;
  in_flight.set(draft_id, (in_flight.get(draft_id) ?? 0) + 1);
  note_draft_activity(draft_id, now);
}

export function end_draft_write(draft_id: string, now = Date.now()): void {
  if (!draft_id) return;
  const count = (in_flight.get(draft_id) ?? 0) - 1;

  if (count > 0) {
    in_flight.set(draft_id, count);
  } else {
    in_flight.delete(draft_id);
  }
  note_draft_activity(draft_id, now);
}

export function register_open_draft_check(
  check: (draft_id: string) => boolean,
): () => void {
  open_checks.add(check);

  return () => {
    open_checks.delete(check);
  };
}

export function is_draft_busy(draft_id: string, now = Date.now()): boolean {
  if (in_flight.has(draft_id)) return true;

  const last = last_activity.get(draft_id);

  if (last !== undefined) {
    if (now - last < DRAFT_ACTIVITY_WINDOW_MS) return true;
    last_activity.delete(draft_id);
  }

  for (const check of open_checks) {
    try {
      if (check(draft_id)) return true;
    } catch {
      return true;
    }
  }

  return false;
}

export function reset_draft_activity(): void {
  last_activity.clear();
  in_flight.clear();
}
