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
const INTENT_TTL_MS = 30_000;
const MAX_INTENTS = 2000;

export const BOOLEAN_INTENT_FLAGS = [
  "is_read",
  "is_starred",
  "is_pinned",
  "is_trashed",
  "is_archived",
  "is_spam",
] as const;

export type BooleanIntentFlag = (typeof BOOLEAN_INTENT_FLAGS)[number];

export interface FlagIntents {
  is_read?: boolean;
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  snoozed_until?: string | null;
}

type IntentValue = boolean | string | null;

interface IntentEntry {
  value: IntentValue;
  at: number;
}

const intents = new Map<string, IntentEntry>();

function now_ms(): number {
  return Date.now();
}

function intent_key(flag: keyof FlagIntents, id: string): string {
  return `${flag}|${id}`;
}

function prune_oldest(): void {
  while (intents.size > MAX_INTENTS) {
    const oldest = intents.keys().next().value;

    if (oldest === undefined) return;
    intents.delete(oldest);
  }
}

function read_entry(flag: keyof FlagIntents, id: string): IntentValue | undefined {
  const key = intent_key(flag, id);
  const current = intents.get(key);

  if (!current) return undefined;
  if (now_ms() - current.at >= INTENT_TTL_MS) {
    intents.delete(key);

    return undefined;
  }

  return current.value;
}

export function pick_flag_intents(
  updates: object | null | undefined,
): FlagIntents {
  const picked: FlagIntents = {};

  if (!updates) return picked;

  const source = updates as Record<string, unknown>;

  for (const flag of BOOLEAN_INTENT_FLAGS) {
    const value = source[flag];

    if (typeof value === "boolean") picked[flag] = value;
  }

  if ("snoozed_until" in source) {
    const value = source.snoozed_until;

    if (typeof value === "string" || value === null) {
      picked.snoozed_until = value;
    }
  }

  return picked;
}

function intent_entries(updates: FlagIntents): Array<[keyof FlagIntents, IntentValue]> {
  const entries: Array<[keyof FlagIntents, IntentValue]> = [];

  for (const flag of BOOLEAN_INTENT_FLAGS) {
    const value = updates[flag];

    if (value !== undefined) entries.push([flag, value]);
  }

  if (updates.snoozed_until !== undefined) {
    entries.push(["snoozed_until", updates.snoozed_until]);
  }

  return entries;
}

export function note_flag_intents(
  ids: readonly string[],
  updates: FlagIntents,
): void {
  const entries = intent_entries(updates);

  if (entries.length === 0 || ids.length === 0) return;

  const at = now_ms();

  for (const id of ids) {
    if (!id) continue;

    for (const [flag, value] of entries) {
      const key = intent_key(flag, id);

      intents.delete(key);
      intents.set(key, { value, at });
    }
  }

  prune_oldest();
}

export function clear_flag_intents(
  ids: readonly string[],
  updates: FlagIntents,
): void {
  const entries = intent_entries(updates);

  for (const id of ids) {
    for (const [flag, value] of entries) {
      const key = intent_key(flag, id);
      const current = intents.get(key);

      if (!current || current.value !== value) continue;
      intents.delete(key);
    }
  }
}

export function get_flag_intent(
  id: string,
  flag: BooleanIntentFlag,
): boolean | undefined {
  const value = read_entry(flag, id);

  return typeof value === "boolean" ? value : undefined;
}

export function get_snooze_intent(id: string): string | null | undefined {
  const value = read_entry("snoozed_until", id);

  return typeof value === "boolean" ? undefined : value;
}

export function is_removal_intended(id: string): boolean {
  if (
    get_flag_intent(id, "is_trashed") === true ||
    get_flag_intent(id, "is_archived") === true ||
    get_flag_intent(id, "is_spam") === true
  ) {
    return true;
  }

  const snoozed_until = get_snooze_intent(id);

  return !!snoozed_until && Date.parse(snoozed_until) > now_ms();
}

export function note_read_intent(
  ids: readonly string[],
  is_read: boolean,
): void {
  note_flag_intents(ids, { is_read });
}

export function clear_read_intent(
  ids: readonly string[],
  only_if_is_read?: boolean,
): void {
  if (only_if_is_read !== undefined) {
    clear_flag_intents(ids, { is_read: only_if_is_read });

    return;
  }

  for (const id of ids) {
    intents.delete(intent_key("is_read", id));
  }
}

export function get_read_intent(id: string): boolean | undefined {
  return get_flag_intent(id, "is_read");
}

export function has_any_read_intent(): boolean {
  return intents.size > 0;
}

export function clear_all_read_intents(): void {
  intents.clear();
}

export const clear_all_flag_intents = clear_all_read_intents;

interface ReadIntentRow {
  id: string;
  is_read: boolean;
  grouped_email_ids?: string[];
}

export interface FlagIntentRow extends ReadIntentRow {
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  snoozed_until?: string;
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

const OVERLAY_FLAGS: BooleanIntentFlag[] = [
  "is_starred",
  "is_pinned",
  "is_trashed",
  "is_archived",
  "is_spam",
];

export function resolve_flag_intents<T extends FlagIntentRow>(row: T): T {
  let next: T | null = null;
  const intended_read = resolve_read_intent(row);

  if (intended_read !== undefined && intended_read !== row.is_read) {
    next = { ...row, is_read: intended_read };
  }

  for (const flag of OVERLAY_FLAGS) {
    const intended = get_flag_intent(row.id, flag);

    if (intended === undefined || intended === (row[flag] ?? false)) continue;
    next = { ...(next ?? row), [flag]: intended };
  }

  const snooze = get_snooze_intent(row.id);

  if (snooze !== undefined) {
    const intended = snooze || undefined;

    if (intended !== row.snoozed_until) {
      next = { ...(next ?? row), snoozed_until: intended };
    }
  }

  return next ?? row;
}

export function apply_flag_intents<T extends FlagIntentRow>(rows: T[]): T[] {
  if (intents.size === 0 || rows.length === 0) return rows;

  let changed = false;
  const next = rows.map((row) => {
    const resolved = resolve_flag_intents(row);

    if (resolved !== row) changed = true;

    return resolved;
  });

  return changed ? next : rows;
}

export const apply_read_intents = apply_flag_intents;
