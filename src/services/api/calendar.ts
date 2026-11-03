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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type {
  CalendarEventDraft,
  CalendarIconName,
  DecryptedCalendar,
  DecryptedCalendarEvent,
  RecurrenceEditScope,
  RecurrenceRule,
} from "@/types/calendar";

import { api_client } from "@/services/api/client";
import {
  MIGRATION_BATCH_SIZE,
  chunk_operations,
  migrate_legacy_calendar_blobs,
} from "@/services/calendar/blob_migration";
import {
  type CalendarBlob,
  type EncryptedBlobWithFormat,
  blob_to_event,
  draft_to_blob,
  encrypt_calendar_blob,
  encrypt_event_draft,
  event_to_draft,
  require_vault,
} from "@/services/calendar/calendar_codec";
import {
  type QueuedBatchOperation,
  type SubmitResult,
  calendar_mutation_queue,
  calendar_row_version,
  event_row_version,
  generate_temp_id,
} from "@/services/calendar/mutation_queue";
import {
  expand_events,
  occurrence_starts,
} from "@/services/calendar/recurrence";
import {
  CALENDARS_ENDPOINT,
  calendar_sync_engine,
  subscribe_calendar_sync,
} from "@/services/calendar/sync_engine";
import { AccountKeyUnavailableError } from "@/services/crypto/account_data_writer";

export { event_to_draft };

function require_write_floor(
  encrypted: EncryptedBlobWithFormat,
  id: string,
  is_calendar = false,
): void {
  if (encrypted.format < calendar_sync_engine.write_floor(id, is_calendar)) {
    throw new AccountKeyUnavailableError("calendar write key is not loaded");
  }
}

interface ListCalendarsApiResponse {
  calendars: unknown[];
  total: number;
}

interface MutationApiResponse {
  id: string;
  success: boolean;
  updated_at: string;
}

interface BatchCreateApiOperation {
  op: "create";
  server_id: string;
  client_ref: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
}

interface BatchUpdateApiOperation {
  op: "update";
  event_id: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  expected_version?: number;
}

interface BatchDeleteApiOperation {
  op: "delete";
  event_id: string;
  expected_version?: number;
}

export type EventBatchOperation =
  BatchCreateApiOperation | BatchUpdateApiOperation | BatchDeleteApiOperation;

export interface EventBatchResult {
  client_ref?: string;
  event_id: string;
  updated_at: string;
  version?: number;
}

export interface PlannedEventCreate {
  op: "create";
  client_ref: string;
  draft: CalendarEventDraft;
}

export interface PlannedEventUpdate {
  op: "update";
  event_id: string;
  draft: CalendarEventDraft;
}

export interface PlannedEventDelete {
  op: "delete";
  event_id: string;
}

export type PlannedEventOperation =
  PlannedEventCreate | PlannedEventUpdate | PlannedEventDelete;

export interface EventOperationPlan {
  operations: PlannedEventOperation[];
  primary_index: number;
}

const DETACHED_OCCURRENCE_REF = "detached";
const TAIL_SERIES_REF = "tail";

export const MAX_BATCH_OPERATIONS = MIGRATION_BATCH_SIZE;

const DEFAULT_CALENDAR_SEEDS: CalendarBlob[] = [
  { name: "Personal", color: "#3b82f6", icon: "calendar" },
  { name: "Work", color: "#14b8a6", icon: "briefcase" },
  { name: "Family", color: "#f59e0b", icon: "users" },
];

let default_calendar_names: string[] | null = null;

export function set_default_calendar_names(names: string[]): void {
  const cleaned = names
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  default_calendar_names =
    cleaned.length >= DEFAULT_CALENDAR_SEEDS.length ? cleaned : null;
}

function calendar_seeds(): CalendarBlob[] {
  return DEFAULT_CALENDAR_SEEDS.map((seed, index) => ({
    ...seed,
    name: default_calendar_names?.[index] ?? seed.name,
  }));
}

export function subscribe_calendar_changes(on_change: () => void): () => void {
  return subscribe_calendar_sync(on_change);
}

function now_iso(): string {
  return new Date().toISOString();
}

function acked_updated_at(result: SubmitResult, id: string): string {
  return result.acks[id]?.updated_at ?? now_iso();
}

function with_invite_identity(
  draft: CalendarEventDraft,
  existing: DecryptedCalendarEvent | null | undefined,
): CalendarEventDraft {
  if (!existing) {
    return draft;
  }

  return {
    ...draft,
    uid: draft.uid === undefined ? (existing.uid ?? null) : draft.uid,
    recurrence_id:
      draft.recurrence_id === undefined
        ? (existing.recurrence_id ?? null)
        : draft.recurrence_id,
    sequence: draft.sequence === undefined ? existing.sequence : draft.sequence,
    organizer_email:
      draft.organizer_email === undefined
        ? (existing.organizer_email ?? null)
        : draft.organizer_email,
    task_meta:
      draft.task_meta === undefined
        ? (existing.task_meta ?? null)
        : draft.task_meta,
  };
}

function is_undated_task(event: DecryptedCalendarEvent): boolean {
  return event.event_kind === "task" && event.task_meta?.has_date === false;
}

function bound_draft(draft: CalendarEventDraft): CalendarEventDraft {
  const calendar_id = calendar_mutation_queue.bound_id(draft.calendar_id);

  return calendar_id === draft.calendar_id ? draft : { ...draft, calendar_id };
}

async function create_calendar_row(
  blob: CalendarBlob,
  vault: EncryptedVault,
  is_default: boolean,
): Promise<void> {
  const server_id = crypto.randomUUID();
  const encrypted = await encrypt_calendar_blob(blob, vault, server_id);

  await api_client.post<MutationApiResponse>(CALENDARS_ENDPOINT, {
    id: server_id,
    encrypted_blob: encrypted.encrypted_blob,
    blob_nonce: encrypted.blob_nonce,
    is_default,
  });
}

let seed_promise: Promise<void> | null = null;

export function reset_calendar_seeding(): void {
  seed_promise = null;
}

async function ensure_seeded(vault: EncryptedVault): Promise<boolean> {
  if (calendar_sync_engine.calendar_count() > 0) {
    return false;
  }

  await calendar_sync_engine.pull_delta();

  if (calendar_sync_engine.calendar_count() > 0) {
    return false;
  }

  if (!seed_promise) {
    const started = (async () => {
      const [default_seed, ...extra_seeds] = calendar_seeds();

      await create_calendar_row(default_seed, vault, true);

      const refreshed = await api_client.get<ListCalendarsApiResponse>(
        CALENDARS_ENDPOINT,
        { skip_cache: true },
      );

      if (refreshed.error || !refreshed.data || refreshed.data.total !== 1) {
        return;
      }

      for (const seed of extra_seeds) {
        await create_calendar_row(seed, vault, false);
      }
    })();

    seed_promise = started;
    started.catch(() => {
      if (seed_promise === started) seed_promise = null;
    });
  }

  await seed_promise;

  return true;
}

export async function list_calendars(): Promise<{ data: DecryptedCalendar[] }> {
  const vault = require_vault();

  await calendar_sync_engine.ensure_loaded();

  if (await ensure_seeded(vault)) {
    await calendar_sync_engine.pull_delta();
  }

  return { data: calendar_sync_engine.get_calendars() };
}

export async function create_calendar(
  name: string,
  color: string,
  icon: CalendarIconName = "calendar",
): Promise<{ success: boolean }> {
  const vault = require_vault();
  const temp_id = generate_temp_id();
  const server_id = crypto.randomUUID();

  try {
    const encrypted = await encrypt_calendar_blob(
      { name, color, icon },
      vault,
      server_id,
    );
    const result = await calendar_mutation_queue.submit(
      {
        kind: "calendar_create",
        temp_id,
        server_id,
        client_ref: temp_id,
        encrypted_blob: encrypted.encrypted_blob,
        blob_nonce: encrypted.blob_nonce,
        is_default: false,
      },
      {
        calendar: {
          id: temp_id,
          name,
          color,
          icon,
          is_visible: true,
          is_default: false,
        },
      },
    );

    return { success: result.ok };
  } catch {
    return { success: false };
  }
}

export async function update_calendar(
  calendar_id: string,
  name: string,
  color: string,
  icon?: CalendarIconName,
): Promise<{ success: boolean }> {
  const vault = require_vault();
  const bound_calendar_id = calendar_mutation_queue.bound_id(calendar_id);
  const current = calendar_sync_engine.get_calendar(calendar_id);
  const next_icon = icon ?? current?.icon ?? "calendar";
  const encrypted = await encrypt_calendar_blob(
    { name, color, icon: next_icon },
    vault,
    bound_calendar_id,
  );

  require_write_floor(encrypted, bound_calendar_id, true);
  const result = await calendar_mutation_queue.submit(
    {
      kind: "calendar_update",
      calendar_id,
      encrypted_blob: encrypted.encrypted_blob,
      blob_nonce: encrypted.blob_nonce,
      expected_version: calendar_row_version(calendar_id),
    },
    {
      calendar: current ? { ...current, name, color, icon: next_icon } : null,
    },
  );

  return { success: result.ok };
}

export async function delete_calendar(
  calendar_id: string,
): Promise<{ success: boolean }> {
  const result = await calendar_mutation_queue.submit({
    kind: "calendar_delete",
    calendar_id,
    expected_version: calendar_row_version(calendar_id),
  });

  return { success: result.ok };
}

export async function set_calendar_visibility(
  calendar_id: string,
  is_visible: boolean,
): Promise<{ success: boolean }> {
  const result = await calendar_mutation_queue.submit({
    kind: "calendar_visibility",
    calendar_id,
    is_visible,
    expected_version: calendar_row_version(calendar_id),
  });

  return { success: result.ok };
}

export async function list_events(
  range_start: Date,
  range_end: Date,
): Promise<{ data: DecryptedCalendarEvent[] }> {
  require_vault();
  await calendar_sync_engine.ensure_loaded();

  const start_ms = range_start.getTime();
  const end_ms = range_end.getTime();

  const events = expand_events(
    calendar_sync_engine
      .get_events()
      .filter((event) => !event.trashed_at && !is_undated_task(event)),
    range_start,
    range_end,
  ).filter((event) => {
    const event_start = new Date(event.starts_at).getTime();
    const event_end = new Date(event.ends_at).getTime();

    return event_end >= start_ms && event_start <= end_ms;
  });

  void migrate_legacy_calendar_blobs();

  return { data: events };
}

export async function list_event_masters(
  range_start: Date,
  range_end: Date,
): Promise<{ data: DecryptedCalendarEvent[] }> {
  require_vault();
  await calendar_sync_engine.ensure_loaded();

  const start_ms = range_start.getTime();
  const end_ms = range_end.getTime();

  const events = calendar_sync_engine
    .get_events()
    .filter((event) => !event.trashed_at && !is_undated_task(event))
    .filter((event) => {
      const event_start = new Date(event.starts_at).getTime();
      const event_end = new Date(event.ends_at).getTime();

      if (event_end >= start_ms && event_start <= end_ms) {
        return true;
      }

      return (
        event.recurrence !== null &&
        occurrence_starts(event, range_start, range_end).length > 0
      );
    });

  return { data: events };
}

export async function list_trashed_events(): Promise<DecryptedCalendarEvent[]> {
  require_vault();
  await calendar_sync_engine.ensure_loaded();

  return calendar_sync_engine
    .get_events()
    .filter((event) => Boolean(event.trashed_at))
    .sort((a, b) => String(b.trashed_at).localeCompare(String(a.trashed_at)));
}

async function set_event_trashed(
  event_id: string,
  trashed_at: string | null,
): Promise<{ data: DecryptedCalendarEvent | null }> {
  const master = await get_event_master(event_id);

  if (!master) return { data: null };

  return update_event(event_id, { ...event_to_draft(master), trashed_at });
}

export function trash_event(
  event_id: string,
): Promise<{ data: DecryptedCalendarEvent | null }> {
  return set_event_trashed(event_id, new Date().toISOString());
}

export function restore_trashed_event(
  event_id: string,
): Promise<{ data: DecryptedCalendarEvent | null }> {
  return set_event_trashed(event_id, null);
}

export async function get_event_master(
  master_id: string,
): Promise<DecryptedCalendarEvent | null> {
  require_vault();
  await calendar_sync_engine.ensure_loaded();

  const cached = calendar_sync_engine.get_event(master_id);

  if (cached) {
    return cached;
  }

  await calendar_sync_engine.pull_delta();

  return calendar_sync_engine.get_event(master_id) ?? null;
}

export function draft_to_optimistic_event(
  draft: CalendarEventDraft,
  temp_id: string,
): DecryptedCalendarEvent {
  return blob_to_event(
    draft_to_blob(draft),
    temp_id,
    draft.calendar_id,
    now_iso(),
  );
}

export { generate_temp_id };

export async function create_event(
  draft: CalendarEventDraft,
  options: { temp_id?: string } = {},
): Promise<{ data: DecryptedCalendarEvent | null }> {
  const vault = require_vault();
  const blob = draft_to_blob(draft);
  const server_id = crypto.randomUUID();
  const encrypted = await encrypt_event_draft(
    bound_draft(draft),
    vault,
    server_id,
  );
  const temp_id = options.temp_id ?? generate_temp_id();
  const now = now_iso();
  const result = await calendar_mutation_queue.submit(
    {
      kind: "event_create",
      temp_id,
      server_id,
      client_ref: temp_id,
      calendar_id: draft.calendar_id,
      encrypted_blob: encrypted.encrypted_blob,
      blob_nonce: encrypted.blob_nonce,
    },
    { event: blob_to_event(blob, temp_id, draft.calendar_id, now) },
  );

  if (!result.ok) {
    return { data: null };
  }

  const id = result.id_map[temp_id] ?? temp_id;

  return {
    data: blob_to_event(
      blob,
      id,
      draft.calendar_id,
      acked_updated_at(result, id),
    ),
  };
}

export async function update_event(
  event_id: string,
  input_draft: CalendarEventDraft,
): Promise<{ data: DecryptedCalendarEvent | null }> {
  const vault = require_vault();
  const existing = calendar_sync_engine.get_event(event_id);
  const draft = with_invite_identity(input_draft, existing);
  const blob = draft_to_blob(draft);
  const expected_version = event_row_version(event_id);
  const bound_event_id = calendar_mutation_queue.bound_id(event_id);
  const encrypted = await encrypt_event_draft(
    bound_draft(draft),
    vault,
    bound_event_id,
  );

  require_write_floor(encrypted, bound_event_id);
  const now = now_iso();
  const result = await calendar_mutation_queue.submit(
    {
      kind: "event_update",
      event_id,
      calendar_id: draft.calendar_id,
      encrypted_blob: encrypted.encrypted_blob,
      blob_nonce: encrypted.blob_nonce,
      expected_version,
    },
    {
      event: blob_to_event(
        blob,
        event_id,
        draft.calendar_id,
        now,
        existing?.created_at ?? now,
      ),
    },
  );

  if (!result.ok) {
    return { data: null };
  }

  return {
    data: blob_to_event(
      blob,
      event_id,
      draft.calendar_id,
      acked_updated_at(result, event_id),
      existing?.created_at,
    ),
  };
}

export async function batch_events(
  operations: EventBatchOperation[],
): Promise<{ data: EventBatchResult[] | null }> {
  if (operations.length === 0) {
    return { data: [] };
  }

  const queued: QueuedBatchOperation[] = operations.map((operation) => {
    if (operation.op === "create") {
      return {
        op: "create",
        temp_id: generate_temp_id(),
        server_id: operation.server_id,
        client_ref: operation.client_ref,
        calendar_id: operation.calendar_id,
        encrypted_blob: operation.encrypted_blob,
        blob_nonce: operation.blob_nonce,
      };
    }

    const expected_version =
      operation.expected_version ?? event_row_version(operation.event_id);

    if (operation.op === "update") {
      return {
        op: "update",
        event_id: operation.event_id,
        calendar_id: operation.calendar_id,
        encrypted_blob: operation.encrypted_blob,
        blob_nonce: operation.blob_nonce,
        expected_version,
      };
    }

    return { op: "delete", event_id: operation.event_id, expected_version };
  });

  const result: SubmitResult = {
    ok: true,
    queued: false,
    id_map: {},
    acks: {},
  };

  for (const chunk of chunk_operations(queued, MAX_BATCH_OPERATIONS)) {
    const chunk_result = await calendar_mutation_queue.submit({
      kind: "event_batch",
      operations: chunk,
    });

    if (!chunk_result.ok) {
      return { data: null };
    }

    result.queued = result.queued || chunk_result.queued;
    Object.assign(result.id_map, chunk_result.id_map);
    Object.assign(result.acks, chunk_result.acks);
  }

  return {
    data: queued.map((operation) => {
      if (operation.op === "create") {
        const event_id = result.id_map[operation.temp_id] ?? operation.temp_id;

        return {
          client_ref: operation.client_ref,
          event_id,
          updated_at: acked_updated_at(result, event_id),
          version: result.acks[event_id]?.version,
        };
      }

      return {
        event_id: operation.event_id,
        updated_at: acked_updated_at(result, operation.event_id),
        version: result.acks[operation.event_id]?.version,
      };
    }),
  };
}

async function encrypt_operation(
  operation: PlannedEventOperation,
  vault: EncryptedVault,
): Promise<EventBatchOperation> {
  if (operation.op === "delete") {
    return operation;
  }

  const event_id =
    operation.op === "update"
      ? calendar_mutation_queue.bound_id(operation.event_id)
      : crypto.randomUUID();
  const draft =
    operation.op === "update"
      ? with_invite_identity(
          operation.draft,
          calendar_sync_engine.get_event(operation.event_id),
        )
      : operation.draft;
  const encrypted = await encrypt_event_draft(
    bound_draft(draft),
    vault,
    event_id,
  );

  require_write_floor(encrypted, event_id);

  if (operation.op === "create") {
    return {
      op: "create",
      server_id: event_id,
      client_ref: operation.client_ref,
      calendar_id: operation.draft.calendar_id,
      encrypted_blob: encrypted.encrypted_blob,
      blob_nonce: encrypted.blob_nonce,
    };
  }

  return {
    op: "update",
    event_id: operation.event_id,
    calendar_id: operation.draft.calendar_id,
    encrypted_blob: encrypted.encrypted_blob,
    blob_nonce: encrypted.blob_nonce,
  };
}

async function run_plan(
  operations: PlannedEventOperation[],
  vault: EncryptedVault,
): Promise<EventBatchResult[] | null> {
  const encrypted = await Promise.all(
    operations.map((operation) => encrypt_operation(operation, vault)),
  );

  return (await batch_events(encrypted)).data;
}

function truncated_master(
  master: DecryptedCalendarEvent,
  boundary: Date,
): PlannedEventUpdate {
  return {
    op: "update",
    event_id: master.id,
    draft: {
      ...event_to_draft(master),
      recurrence: master.recurrence
        ? { ...master.recurrence, count: null, until: boundary.toISOString() }
        : null,
    },
  };
}

function master_with_exception(
  master: DecryptedCalendarEvent,
  occurrence_start: string,
): PlannedEventUpdate {
  return {
    op: "update",
    event_id: master.id,
    draft: {
      ...event_to_draft(master),
      recurrence_exceptions: [
        ...master.recurrence_exceptions,
        occurrence_start,
      ],
    },
  };
}

function occurrence_boundary(occurrence_start: string): Date {
  return new Date(new Date(occurrence_start).getTime() - 1);
}

function shift_iso(value: string, delta: number): string {
  const ms = Date.parse(value);

  return Number.isNaN(ms) ? value : new Date(ms + delta).toISOString();
}

export function shift_exceptions(
  exceptions: string[],
  delta: number,
  is_all_day: boolean,
): string[] {
  if (delta === 0 || is_all_day) {
    return exceptions;
  }

  return exceptions.map((value) => shift_iso(value, delta));
}

export function detached_children(
  master: DecryptedCalendarEvent,
): DecryptedCalendarEvent[] {
  if (!master.uid) {
    return [];
  }

  return calendar_sync_engine
    .get_events()
    .filter(
      (event) =>
        event.id !== master.id &&
        !event.trashed_at &&
        event.uid === master.uid &&
        typeof event.recurrence_id === "string" &&
        event.recurrence_id.length > 0,
    );
}

function resolved_recurrence(
  draft: CalendarEventDraft,
  master: DecryptedCalendarEvent,
): RecurrenceRule | null {
  if (draft.recurrence_cleared) {
    return null;
  }

  return draft.recurrence ?? master.recurrence;
}

export function plan_occurrence_update(
  master: DecryptedCalendarEvent,
  occurrence: DecryptedCalendarEvent,
  draft: CalendarEventDraft,
  scope: RecurrenceEditScope,
  children: DecryptedCalendarEvent[] = detached_children(master),
): EventOperationPlan {
  const occurrence_start = occurrence.occurrence_start ?? occurrence.starts_at;
  const delta =
    new Date(draft.starts_at).getTime() -
    new Date(occurrence.starts_at).getTime();
  const cleared = draft.recurrence_cleared === true;

  if (scope === "series") {
    const duration =
      new Date(draft.ends_at).getTime() - new Date(draft.starts_at).getTime();
    const next_start = new Date(new Date(master.starts_at).getTime() + delta);
    const child_updates: PlannedEventUpdate[] =
      cleared || delta === 0 || master.is_all_day
        ? []
        : children.map((child) => ({
            op: "update",
            event_id: child.id,
            draft: {
              ...event_to_draft(child),
              recurrence_id: shift_iso(child.recurrence_id as string, delta),
            },
          }));

    return {
      operations: [
        {
          op: "update",
          event_id: master.id,
          draft: {
            ...with_invite_identity(draft, master),
            starts_at: next_start.toISOString(),
            ends_at: new Date(next_start.getTime() + duration).toISOString(),
            recurrence: resolved_recurrence(draft, master),
            recurrence_exceptions: cleared
              ? []
              : shift_exceptions(
                  master.recurrence_exceptions,
                  delta,
                  master.is_all_day,
                ),
          },
        },
        ...child_updates,
      ],
      primary_index: 0,
    };
  }

  if (scope === "single") {
    return {
      operations: [
        master_with_exception(master, occurrence_start),
        {
          op: "create",
          client_ref: DETACHED_OCCURRENCE_REF,
          draft: {
            ...draft,
            recurrence: null,
            recurrence_exceptions: [],
            uid: master.uid ?? null,
            recurrence_id: occurrence_start,
            sequence: master.sequence,
            organizer_email: master.organizer_email ?? null,
          },
        },
      ],
      primary_index: 1,
    };
  }

  const boundary = occurrence_boundary(occurrence_start);
  const rule = resolved_recurrence(draft, master);

  if (boundary.getTime() < new Date(master.starts_at).getTime()) {
    return {
      operations: [
        {
          op: "update",
          event_id: master.id,
          draft: {
            ...with_invite_identity(draft, master),
            recurrence: rule,
            recurrence_exceptions: cleared
              ? []
              : shift_exceptions(
                  master.recurrence_exceptions,
                  delta,
                  master.is_all_day,
                ),
          },
        },
      ],
      primary_index: 0,
    };
  }

  const occurrence_ms = new Date(occurrence_start).getTime();
  const tail_exceptions = master.recurrence_exceptions.filter(
    (value) => new Date(value).getTime() >= occurrence_ms,
  );

  return {
    operations: [
      truncated_master(master, boundary),
      {
        op: "create",
        client_ref: TAIL_SERIES_REF,
        draft: {
          ...draft,
          recurrence: tail_recurrence(rule, master, boundary),
          recurrence_exceptions: cleared
            ? []
            : shift_exceptions(tail_exceptions, delta, master.is_all_day),
        },
      },
    ],
    primary_index: 1,
  };
}

export function plan_occurrence_delete(
  master: DecryptedCalendarEvent,
  occurrence: DecryptedCalendarEvent,
  scope: RecurrenceEditScope,
): PlannedEventOperation[] {
  if (scope === "series") {
    return [{ op: "delete", event_id: master.id }];
  }

  const occurrence_start = occurrence.occurrence_start ?? occurrence.starts_at;

  if (scope === "single") {
    return [master_with_exception(master, occurrence_start)];
  }

  const boundary = occurrence_boundary(occurrence_start);

  if (boundary.getTime() < new Date(master.starts_at).getTime()) {
    return [{ op: "delete", event_id: master.id }];
  }

  return [truncated_master(master, boundary)];
}

export async function update_event_occurrence(
  occurrence: DecryptedCalendarEvent,
  draft: CalendarEventDraft,
  scope: RecurrenceEditScope,
): Promise<{ data: DecryptedCalendarEvent | null }> {
  const master_id = occurrence.recurrence_master_id;

  if (!master_id || !occurrence.occurrence_start) {
    return update_event(occurrence.id, draft);
  }

  const vault = require_vault();
  const master = await get_event_master(master_id);

  if (!master) {
    return { data: null };
  }

  const plan = plan_occurrence_update(master, occurrence, draft, scope);
  const results = await run_plan(plan.operations, vault);
  const primary = plan.operations[plan.primary_index];
  const outcome = results?.[plan.primary_index];

  if (!outcome || !primary || primary.op === "delete") {
    return { data: null };
  }

  const primary_draft =
    primary.op === "update"
      ? with_invite_identity(primary.draft, master)
      : primary.draft;

  return {
    data: blob_to_event(
      draft_to_blob(primary_draft),
      outcome.event_id,
      primary_draft.calendar_id,
      outcome.updated_at,
    ),
  };
}

export function tail_recurrence(
  rule: RecurrenceRule | null,
  master: DecryptedCalendarEvent,
  boundary: Date,
): RecurrenceRule | null {
  if (!rule) {
    return null;
  }

  const master_count = master.recurrence?.count ?? null;

  if (
    rule.count === null ||
    master_count === null ||
    rule.count !== master_count ||
    !master.recurrence
  ) {
    return { ...rule };
  }

  const consumed = occurrence_starts(
    {
      ...master,
      recurrence: { ...master.recurrence, extra_dates: [] },
      recurrence_exceptions: [],
    },
    new Date(master.starts_at),
    boundary,
  ).length;

  return { ...rule, count: Math.max(1, master_count - consumed) };
}

export async function delete_event_occurrence(
  occurrence: DecryptedCalendarEvent,
  scope: RecurrenceEditScope,
): Promise<{ success: boolean }> {
  const master_id = occurrence.recurrence_master_id;
  const occurrence_start = occurrence.occurrence_start;

  if (!master_id || !occurrence_start) {
    return delete_event(occurrence.id);
  }

  if (scope === "series") {
    return delete_event(master_id);
  }

  const vault = require_vault();
  const master = await get_event_master(master_id);

  if (!master) {
    return { success: false };
  }

  const results = await run_plan(
    plan_occurrence_delete(master, occurrence, scope),
    vault,
  );

  return { success: results !== null };
}

export async function delete_event(
  event_id: string,
): Promise<{ success: boolean }> {
  const result = await calendar_mutation_queue.submit({
    kind: "event_delete",
    event_id,
    expected_version: event_row_version(event_id),
  });

  return { success: result.ok };
}

export async function create_events_batch(
  drafts: CalendarEventDraft[],
): Promise<{ data: EventBatchResult[] | null }> {
  if (drafts.length === 0) {
    return { data: [] };
  }

  const vault = require_vault();
  const operations: PlannedEventOperation[] = drafts.map((draft, index) => ({
    op: "create",
    client_ref: `import-${index}`,
    draft,
  }));

  return { data: await run_plan(operations, vault) };
}

export async function delete_events_batch(
  event_ids: string[],
): Promise<{ data: EventBatchResult[] | null }> {
  if (event_ids.length === 0) {
    return { data: [] };
  }

  const vault = require_vault();
  const operations: PlannedEventOperation[] = event_ids.map((event_id) => ({
    op: "delete",
    event_id,
  }));

  return { data: await run_plan(operations, vault) };
}
