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
const PENDING_MAX_AGE_MS = 30_000;
const ACKED_MAX_AGE_MS = 10 * 60_000;
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
  acked_at: number | null;
}

const intents = new Map<string, IntentEntry>();

let scope_read_at: number | null = null;

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

function read_entry(
  flag: keyof FlagIntents,
  id: string,
  fetched_at?: number,
  observed?: IntentValue,
): IntentValue | undefined {
  const key = intent_key(flag, id);
  const current = intents.get(key);

  if (!current) return undefined;

  const { acked_at } = current;
  const superseded =
    acked_at !== null && fetched_at !== undefined && fetched_at >= acked_at;
  const expired =
    acked_at === null
      ? now_ms() - current.at >= PENDING_MAX_AGE_MS
      : now_ms() - acked_at >= ACKED_MAX_AGE_MS;

  if (expired) {
    intents.delete(key);

    return undefined;
  }

  if (superseded) {
    if (observed !== undefined && observed !== current.value) {
      intents.delete(key);
    }

    return undefined;
  }

  return current.value;
}

function set_entry(key: string, entry: IntentEntry): void {
  intents.delete(key);
  intents.set(key, entry);
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

function intent_entries(
  updates: FlagIntents,
): Array<[keyof FlagIntents, IntentValue]> {
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
      set_entry(intent_key(flag, id), { value, at, acked_at: null });
    }
  }

  prune_oldest();
}

export function ack_flag_intents(
  ids: readonly string[],
  updates: FlagIntents,
): void {
  const entries = intent_entries(updates);
  const at = now_ms();

  for (const id of ids) {
    for (const [flag, value] of entries) {
      const current = intents.get(intent_key(flag, id));

      if (current && current.value === value) current.acked_at = at;
    }
  }
}

export function settle_flag_intents(
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
      const current = intents.get(key);

      if (current?.value === value && current.acked_at === null) continue;
      set_entry(key, { value, at, acked_at: at });
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
  fetched_at?: number,
  observed?: boolean,
): boolean | undefined {
  const value = read_entry(flag, id, fetched_at, observed);

  return typeof value === "boolean" ? value : undefined;
}

export function get_snooze_intent(
  id: string,
  fetched_at?: number,
  observed?: string | null,
): string | null | undefined {
  const value = read_entry("snoozed_until", id, fetched_at, observed);

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

export function get_read_intent(
  id: string,
  fetched_at?: number,
  observed?: boolean,
): boolean | undefined {
  return get_flag_intent(id, "is_read", fetched_at, observed);
}

export function note_scope_read_intent(): number {
  const at = now_ms();

  scope_read_at = at;

  return at;
}

export function clear_scope_read_intent(token?: number): void {
  if (token === undefined || scope_read_at === token) scope_read_at = null;
}

function active_scope_read_at(): number | null {
  if (scope_read_at === null) return null;
  if (now_ms() - scope_read_at >= PENDING_MAX_AGE_MS) {
    scope_read_at = null;

    return null;
  }

  return scope_read_at;
}

export function scope_read_applies(timestamp: string | undefined): boolean {
  const at = active_scope_read_at();

  if (at === null || !timestamp) return false;

  const message_ms = Date.parse(timestamp);

  return !Number.isNaN(message_ms) && message_ms <= at;
}

const read_tickets = new Map<string, number>();
let read_ticket_seq = 0;

export function begin_read_change(ids: readonly string[]): number {
  read_ticket_seq += 1;
  const ticket = read_ticket_seq;

  for (const id of ids) {
    if (!id) continue;
    read_tickets.delete(id);
    read_tickets.set(id, ticket);
  }

  while (read_tickets.size > MAX_INTENTS) {
    const oldest = read_tickets.keys().next().value;

    if (oldest === undefined) break;
    read_tickets.delete(oldest);
  }

  return ticket;
}

export function peek_read_ticket(id: string): number {
  return read_tickets.get(id) ?? 0;
}

export function is_read_ticket_current(id: string, ticket: number): boolean {
  return peek_read_ticket(id) === ticket;
}

export function claim_auto_read(
  id: string,
  armed_ticket: number,
): number | null {
  if (!is_read_ticket_current(id, armed_ticket)) return null;

  return begin_read_change([id]);
}

export function capture_read_tickets(
  ids: readonly string[],
): Map<string, number> {
  const captured = new Map<string, number>();

  for (const id of ids) captured.set(id, peek_read_ticket(id));

  return captured;
}

export function current_read_ids(
  ids: readonly string[],
  captured: ReadonlyMap<string, number> | number,
): string[] {
  return ids.filter((id) =>
    typeof captured === "number"
      ? peek_read_ticket(id) === captured
      : peek_read_ticket(id) === (captured.get(id) ?? 0),
  );
}

export function has_any_read_intent(): boolean {
  return intents.size > 0 || active_scope_read_at() !== null;
}

export function clear_all_read_intents(): void {
  intents.clear();
  scope_read_at = null;
}

export const clear_all_flag_intents = clear_all_read_intents;

interface ReadIntentRow {
  id: string;
  is_read: boolean;
  grouped_email_ids?: string[];
  item_type?: string;
  is_trashed?: boolean;
  raw_timestamp?: string;
}

export interface FlagIntentRow extends ReadIntentRow {
  is_starred?: boolean;
  is_pinned?: boolean;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_spam?: boolean;
  snoozed_until?: string;
}

export function resolve_read_intent(
  row: ReadIntentRow,
  fetched_at?: number,
): boolean | undefined {
  const own = get_read_intent(row.id, fetched_at, row.is_read);

  if (own !== undefined) return own;
  if (row.grouped_email_ids && row.grouped_email_ids.length >= 2) {
    for (const member_id of row.grouped_email_ids) {
      if (member_id === row.id) continue;
      if (get_read_intent(member_id, fetched_at) === false) return false;
    }
  }

  if (
    row.item_type === "received" &&
    !row.is_trashed &&
    scope_read_applies(row.raw_timestamp)
  ) {
    return true;
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

export function resolve_flag_intents<T extends FlagIntentRow>(
  row: T,
  fetched_at?: number,
): T {
  let next: T | null = null;
  const intended_read = resolve_read_intent(row, fetched_at);

  if (intended_read !== undefined && intended_read !== row.is_read) {
    next = { ...row, is_read: intended_read };
  }

  for (const flag of OVERLAY_FLAGS) {
    const intended = get_flag_intent(
      row.id,
      flag,
      fetched_at,
      row[flag] ?? false,
    );

    if (intended === undefined || intended === (row[flag] ?? false)) continue;
    next = { ...(next ?? row), [flag]: intended };
  }

  const snooze = get_snooze_intent(
    row.id,
    fetched_at,
    row.snoozed_until ?? null,
  );

  if (snooze !== undefined) {
    const intended = snooze || undefined;

    if (intended !== row.snoozed_until) {
      next = { ...(next ?? row), snoozed_until: intended };
    }
  }

  return next ?? row;
}

export function apply_flag_intents<T extends FlagIntentRow>(
  rows: T[],
  fetched_at?: number,
): T[] {
  if (!has_any_read_intent() || rows.length === 0) return rows;

  let changed = false;
  const next = rows.map((row) => {
    const resolved = resolve_flag_intents(row, fetched_at);

    if (resolved !== row) changed = true;

    return resolved;
  });

  return changed ? next : rows;
}

export const apply_read_intents = apply_flag_intents;
