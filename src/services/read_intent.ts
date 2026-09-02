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
const READ_INTENT_TTL_MS = 30_000;
const MAX_READ_INTENTS = 2000;

interface ReadIntent {
  is_read: boolean;
  at: number;
}

const intents = new Map<string, ReadIntent>();

function now_ms(): number {
  return Date.now();
}

function prune_oldest(): void {
  while (intents.size > MAX_READ_INTENTS) {
    const oldest = intents.keys().next().value;

    if (oldest === undefined) return;
    intents.delete(oldest);
  }
}

export function note_read_intent(
  ids: readonly string[],
  is_read: boolean,
): void {
  const at = now_ms();

  for (const id of ids) {
    if (!id) continue;
    intents.delete(id);
    intents.set(id, { is_read, at });
  }

  prune_oldest();
}

export function clear_read_intent(
  ids: readonly string[],
  only_if_is_read?: boolean,
): void {
  for (const id of ids) {
    const current = intents.get(id);

    if (!current) continue;
    if (only_if_is_read !== undefined && current.is_read !== only_if_is_read) {
      continue;
    }
    intents.delete(id);
  }
}

export function get_read_intent(id: string): boolean | undefined {
  const current = intents.get(id);

  if (!current) return undefined;
  if (now_ms() - current.at >= READ_INTENT_TTL_MS) {
    intents.delete(id);

    return undefined;
  }

  return current.is_read;
}

export function has_any_read_intent(): boolean {
  return intents.size > 0;
}

export function clear_all_read_intents(): void {
  intents.clear();
}

interface ReadIntentRow {
  id: string;
  is_read: boolean;
  grouped_email_ids?: string[];
}

export function resolve_read_intent(row: ReadIntentRow): boolean | undefined {
  const own = get_read_intent(row.id);

  if (own !== undefined) return own;
  if (!row.grouped_email_ids || row.grouped_email_ids.length < 2) {
    return undefined;
  }

  for (const member_id of row.grouped_email_ids) {
    if (member_id === row.id) continue;
    if (get_read_intent(member_id) === false) return false;
  }

  return undefined;
}

export function apply_read_intents<T extends ReadIntentRow>(rows: T[]): T[] {
  if (intents.size === 0 || rows.length === 0) return rows;

  let changed = false;
  const next = rows.map((row) => {
    const intended = resolve_read_intent(row);

    if (intended === undefined || intended === row.is_read) return row;
    changed = true;

    return { ...row, is_read: intended };
  });

  return changed ? next : rows;
}
