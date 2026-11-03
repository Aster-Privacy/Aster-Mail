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
import type { ApiResponse } from "@/services/api/client/helpers";
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { api_client } from "@/services/api/client";
import {
  CALENDARS_ENDPOINT,
  EVENTS_ENDPOINT,
  calendar_sync_engine,
} from "@/services/calendar/sync_engine";
import {
  type CachedCalendarRow,
  type CachedEventRow,
  type QueueRecord,
  read_queue,
  remove_queue_record,
  write_queue_record,
} from "@/services/calendar/sync_store";
import { confirm_calendar_identity } from "@/services/calendar/identity_guard";
import { TEMP_ID_PREFIX, is_temp_event_id } from "@/services/calendar/temp_id";
import { register_event_render_alias } from "@/services/calendar/event_render_key";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  known_revision,
  next_revision,
  observe_revision,
  release_revision,
  settle_revision,
} from "@/services/calendar/revision_ledger";
import {
  decode_calendar_row,
  decode_event_row,
  encrypt_calendar_blob,
  encrypt_event_draft,
  event_to_draft,
} from "@/services/calendar/calendar_codec";

export { TEMP_ID_PREFIX, is_temp_event_id };

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];
const UNREADABLE_CONFLICT_RETRIES = 3;
const IDENTITY_RETRY_MS = 30_000;

export interface QueuedEventCreate {
  kind: "event_create";
  temp_id: string;
  server_id?: string;
  client_ref: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
}

export interface QueuedEventUpdate {
  kind: "event_update";
  event_id: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  expected_version: number | null;
}

export interface QueuedEventDelete {
  kind: "event_delete";
  event_id: string;
  expected_version: number | null;
}

export interface QueuedBatchCreate {
  op: "create";
  temp_id: string;
  server_id?: string;
  client_ref: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
}

export interface QueuedBatchUpdate {
  op: "update";
  event_id: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  expected_version: number | null;
}

export interface QueuedBatchDelete {
  op: "delete";
  event_id: string;
  expected_version: number | null;
}

export type QueuedBatchOperation =
  QueuedBatchCreate | QueuedBatchUpdate | QueuedBatchDelete;

export interface QueuedEventBatch {
  kind: "event_batch";
  operations: QueuedBatchOperation[];
}

export interface QueuedCalendarCreate {
  kind: "calendar_create";
  temp_id: string;
  server_id?: string;
  client_ref: string;
  encrypted_blob: string;
  blob_nonce: string;
  is_default: boolean;
}

export interface QueuedCalendarUpdate {
  kind: "calendar_update";
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  expected_version: number | null;
}

export interface QueuedCalendarDelete {
  kind: "calendar_delete";
  calendar_id: string;
  expected_version: number | null;
}

export interface QueuedCalendarVisibility {
  kind: "calendar_visibility";
  calendar_id: string;
  is_visible: boolean;
  expected_version: number | null;
}

export type QueuedOperation =
  | QueuedEventCreate
  | QueuedEventUpdate
  | QueuedEventDelete
  | QueuedEventBatch
  | QueuedCalendarCreate
  | QueuedCalendarUpdate
  | QueuedCalendarDelete
  | QueuedCalendarVisibility;

interface QueueEntry {
  id: string;
  account_id: string;
  seq: number;
  op: QueuedOperation;
  maybe_sent: boolean;
  queued_offline: boolean;
}

interface StoredEntry {
  op: QueuedOperation;
  maybe_sent: boolean;
  queued_offline: boolean;
}

export interface AckRecord {
  updated_at: string;
  version: number;
}

export interface SubmitResult {
  ok: boolean;
  queued: boolean;
  id_map: Record<string, string>;
  acks: Record<string, AckRecord>;
}

export interface ConflictVersion {
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
  updated_at: string;
  deleted: boolean;
  unreadable?: boolean;
}

export interface SyncConflict {
  id: string;
  target: "event" | "calendar";
  target_id: string;
  local: ConflictVersion;
  server: ConflictVersion;
  server_version: number;
}

export type QueueEvent =
  | { type: "queued_offline" }
  | { type: "drained" }
  | {
      type: "dropped";
      target: "event" | "calendar";
      reason: "not_found" | "rejected" | "plan_limit";
    }
  | { type: "conflicts_changed" }
  | { type: "pending_changed"; count: number };

type QueueListener = (event: QueueEvent) => void;

type SendOutcome =
  | {
      kind: "ack";
      acks: Record<string, AckRecord>;
      id_map: Record<string, string>;
    }
  | {
      kind: "conflict";
      row: Record<string, unknown>;
      target: "event" | "calendar";
    }
  | { kind: "drop"; reason: "not_found" | "rejected" | "plan_limit" }
  | { kind: "retry" };

interface MutationResponse {
  id: string;
  success: boolean;
  updated_at: string;
  version?: number;
}

interface BatchResponse {
  results: Array<{
    client_ref?: string;
    event_id: string;
    updated_at: string;
    version?: number;
  }>;
}

interface ServerEventRowLike {
  id: string;
  calendar_id: string;
  encrypted_blob: string;
  blob_nonce: string;
  created_at?: string;
  updated_at: string;
  version?: number;
}

interface ServerCalendarRowLike {
  id: string;
  encrypted_blob: string;
  blob_nonce: string;
  is_visible?: boolean;
  is_default?: boolean;
  updated_at: string;
  version?: number;
}

export function generate_temp_id(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${TEMP_ID_PREFIX}${random}`;
}

export function is_temp_id(id: string): boolean {
  return is_temp_event_id(id);
}

function is_online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function now_iso(): string {
  return new Date().toISOString();
}

function expected_version_for(
  row: { version: number } | undefined,
): number | null {
  return row && row.version >= 1 ? row.version : null;
}

function with_expected(
  body: Record<string, unknown>,
  expected_version: number | null,
): Record<string, unknown> {
  return expected_version === null ? body : { ...body, expected_version };
}

function query_expected(expected_version: number | null): string {
  return expected_version === null
    ? ""
    : `?expected_version=${expected_version}`;
}

function classify_failure(
  response: ApiResponse<unknown> | undefined,
): SendOutcome {
  if (!response) return { kind: "drop", reason: "rejected" };
  if (response.status === 409) {
    const body = response.body ?? {};
    const event = body.event;
    const calendar = body.calendar;

    if (event && typeof event === "object") {
      return {
        kind: "conflict",
        row: event as Record<string, unknown>,
        target: "event",
      };
    }
    if (calendar && typeof calendar === "object") {
      return {
        kind: "conflict",
        row: calendar as Record<string, unknown>,
        target: "calendar",
      };
    }

    return { kind: "drop", reason: "rejected" };
  }
  if (response.status === 404) return { kind: "drop", reason: "not_found" };
  if (response.code === "NETWORK_ERROR" || response.code === "TIMEOUT_ERROR") {
    return { kind: "retry" };
  }
  if (typeof response.status === "number") {
    if (response.status >= 500) return { kind: "retry" };
    if (
      response.status === 403 &&
      response.server_code === "PLAN_LIMIT_EXCEEDED"
    ) {
      return { kind: "drop", reason: "plan_limit" };
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429
    ) {
      return { kind: "retry" };
    }

    return { kind: "drop", reason: "rejected" };
  }

  return { kind: "drop", reason: "rejected" };
}

function operation_ids(op: QueuedOperation): string[] {
  switch (op.kind) {
    case "event_create":
      return [op.temp_id];
    case "event_update":
    case "event_delete":
      return [op.event_id];
    case "event_batch":
      return op.operations.map((item) =>
        item.op === "create" ? item.temp_id : item.event_id,
      );
    case "calendar_create":
      return [op.temp_id];
    case "calendar_update":
    case "calendar_delete":
    case "calendar_visibility":
      return [op.calendar_id];
  }
}

function pending_server_ids(op: QueuedOperation): string[] {
  if (op.kind === "event_create" || op.kind === "calendar_create") {
    return op.server_id ? [op.server_id] : [];
  }
  if (op.kind === "event_batch") {
    return op.operations.flatMap((item) =>
      item.op === "create" && item.server_id ? [item.server_id] : [],
    );
  }

  return [];
}

function remap_op(
  op: QueuedOperation,
  temp_id: string,
  real_id: string,
  version: number | null,
): boolean {
  let changed = false;

  if (op.kind === "event_update" && op.event_id === temp_id) {
    op.event_id = real_id;
    if (version !== null) op.expected_version = version;
    changed = true;
  }
  if (op.kind === "event_delete" && op.event_id === temp_id) {
    op.event_id = real_id;
    if (version !== null) op.expected_version = version;
    changed = true;
  }
  if (
    (op.kind === "event_create" || op.kind === "event_update") &&
    op.calendar_id === temp_id
  ) {
    op.calendar_id = real_id;
    changed = true;
  }
  if (op.kind === "event_batch") {
    for (const item of op.operations) {
      if (item.op !== "create" && item.event_id === temp_id) {
        item.event_id = real_id;
        if (version !== null) item.expected_version = version;
        changed = true;
      }
      if (item.op !== "delete" && item.calendar_id === temp_id) {
        item.calendar_id = real_id;
        changed = true;
      }
    }
  }
  if (
    (op.kind === "calendar_update" ||
      op.kind === "calendar_delete" ||
      op.kind === "calendar_visibility") &&
    op.calendar_id === temp_id
  ) {
    op.calendar_id = real_id;
    if (version !== null) op.expected_version = version;
    changed = true;
  }

  return changed;
}

function conflict_target(op: QueuedOperation): "event" | "calendar" {
  return op.kind.startsWith("calendar") ? "calendar" : "event";
}

function blob_matches(
  row: Record<string, unknown>,
  sent: { encrypted_blob: string; blob_nonce: string },
): boolean {
  return (
    row.encrypted_blob === sent.encrypted_blob &&
    row.blob_nonce === sent.blob_nonce
  );
}

function created_server_id(op: QueuedOperation): string | null {
  if (op.kind === "event_create" || op.kind === "calendar_create") {
    return op.server_id ?? null;
  }
  if (op.kind === "event_batch" && op.operations.length === 1) {
    const item = op.operations[0];

    return item.op === "create" ? (item.server_id ?? null) : null;
  }

  return null;
}

function created_row_moved(
  op: QueuedOperation,
  row: Record<string, unknown>,
): boolean {
  const server_id = created_server_id(op);

  if (server_id === null || row.id !== server_id || row.deleted === true) {
    return false;
  }
  if (op.kind === "event_create" || op.kind === "calendar_create") {
    return !blob_matches(row, op);
  }
  if (op.kind === "event_batch" && op.operations[0]?.op === "create") {
    return !blob_matches(row, op.operations[0]);
  }

  return false;
}

function conflict_row_is_deleted_create(
  op: QueuedOperation,
  row: Record<string, unknown>,
): boolean {
  const server_id = created_server_id(op);

  return server_id !== null && row.id === server_id && row.deleted === true;
}

function conflict_row_is_applied(
  op: QueuedOperation,
  row: Record<string, unknown>,
): boolean {
  const server_id = created_server_id(op);

  if (server_id !== null && row.id === server_id) {
    return row.deleted !== true;
  }

  switch (op.kind) {
    case "event_create":
    case "event_update":
    case "calendar_create":
    case "calendar_update":
      return blob_matches(row, op);
    case "event_delete":
    case "calendar_delete":
      return row.deleted === true;
    case "calendar_visibility":
      return row.is_visible === op.is_visible;
    case "event_batch": {
      if (op.operations.length !== 1) return false;

      const item = op.operations[0];

      if (item.op === "delete") return row.deleted === true;

      return blob_matches(row, item);
    }
  }
}

function conflict_as_ack(
  op: QueuedOperation,
  row: Record<string, unknown>,
): Extract<SendOutcome, { kind: "ack" }> | null {
  if (typeof row.id !== "string" || !conflict_row_is_applied(op, row)) {
    return null;
  }

  const local_id = operation_ids(op)[0];
  const id_map: Record<string, string> = {};

  if (local_id !== row.id) id_map[local_id] = row.id;

  const version = created_row_moved(op, row)
    ? 1
    : typeof row.version === "number"
      ? row.version
      : 0;

  return {
    kind: "ack",
    id_map,
    acks: {
      [row.id]: {
        updated_at:
          typeof row.updated_at === "string" ? row.updated_at : now_iso(),
        version,
      },
    },
  };
}

function deleted_outcome(
  response: ApiResponse<MutationResponse> | undefined,
  id: string,
): Extract<SendOutcome, { kind: "ack" }> | null {
  if (response?.status !== 404) return null;

  return {
    kind: "ack",
    id_map: {},
    acks: { [id]: { updated_at: now_iso(), version: 0 } },
  };
}

export class CalendarMutationQueue {
  private account_id: string | null = null;
  private entries: QueueEntry[] = [];
  private next_seq = 1;
  private load_promise: Promise<void> | null = null;
  private flush_promise: Promise<void> | null = null;
  private recovering: QueueEntry | null = null;
  private flush_again = false;
  private retry_timer: ReturnType<typeof setTimeout> | null = null;
  private retry_attempt = 0;
  private offline_notice_pending = false;
  private listeners_attached = false;
  private readonly listeners = new Set<QueueListener>();
  private readonly conflicts: SyncConflict[] = [];
  private readonly applying_ops = new Set<QueuedOperation>();
  private readonly server_rows = new Map<string, Record<string, unknown>>();
  private readonly unreadable_attempts = new Map<string, number>();
  private readonly foreign_conflict_attempts = new Map<string, number>();
  private readonly resolved_ids = new Map<string, string>();
  private readonly waiters = new Map<
    string,
    Array<(result: SubmitResult) => void>
  >();

  constructor() {
    calendar_sync_engine.set_pending_lookup((id) => this.is_pending(id));
    calendar_sync_engine.set_id_binder((id) => this.bound_id(id));
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  pending_count(): number {
    return this.entries.length;
  }

  get_conflicts(): SyncConflict[] {
    return [...this.conflicts];
  }

  is_pending(id: string): boolean {
    return this.entries.some(
      (entry) =>
        operation_ids(entry.op).includes(id) ||
        (entry !== this.recovering &&
          pending_server_ids(entry.op).includes(id)),
    );
  }

  async ensure_loaded(): Promise<void> {
    await calendar_sync_engine.ensure_loaded();

    const account_id = calendar_sync_engine.current_account_id();

    if (account_id === this.account_id && this.load_promise) {
      return this.load_promise;
    }

    this.account_id = account_id;
    this.entries = [];
    this.conflicts.length = 0;
    this.next_seq = 1;

    const load = this.load_entries(account_id);

    this.load_promise = load;
    load.catch(() => {
      if (this.load_promise !== load) return;
      this.load_promise = null;
      this.account_id = null;
    });

    return load;
  }

  private async load_entries(account_id: string | null): Promise<void> {
    if (!account_id) return;

    const records = await read_queue(account_id);

    if (this.account_id !== account_id) return;

    for (const record of records) {
      const stored = record.payload as StoredEntry | undefined;

      if (!stored || typeof stored !== "object" || !stored.op) continue;
      this.entries.push({
        id: record.id,
        account_id,
        seq: record.seq,
        op: stored.op,
        maybe_sent: stored.maybe_sent === true,
        queued_offline: stored.queued_offline === true,
      });
      this.next_seq = Math.max(this.next_seq, record.seq + 1);
    }

    for (const entry of this.entries) {
      if (this.account_id !== account_id) return;
      await this.apply_optimistic(entry.op);
    }

    this.attach_listeners();
    this.emit({ type: "pending_changed", count: this.entries.length });
    if (this.entries.length > 0) this.schedule_flush(0);
  }

  bound_id(id: string): string {
    if (!is_temp_id(id)) return id;

    const ops = [
      ...this.applying_ops,
      ...this.entries.map((entry) => entry.op),
    ];

    for (const op of ops) {
      if (
        (op.kind === "event_create" || op.kind === "calendar_create") &&
        op.temp_id === id &&
        op.server_id
      ) {
        return op.server_id;
      }
      if (op.kind === "event_batch") {
        for (const item of op.operations) {
          if (item.op === "create" && item.temp_id === id && item.server_id) {
            return item.server_id;
          }
        }
      }
    }

    return this.resolved_ids.get(id) ?? id;
  }

  async submit(
    op: QueuedOperation,
    optimistic?: {
      event?: DecryptedCalendarEvent | null;
      calendar?: DecryptedCalendar | null;
    },
  ): Promise<SubmitResult> {
    await this.ensure_loaded();

    const account_id = this.account_id;

    if (!account_id) {
      return { ok: false, queued: false, id_map: {}, acks: {} };
    }

    const cancelled = this.cancel_unsynced_create(this.resolve_acked(op));

    if (cancelled === null) {
      return { ok: true, queued: false, id_map: {}, acks: {} };
    }

    this.applying_ops.add(cancelled);
    try {
      await this.apply_optimistic(cancelled, optimistic);
    } finally {
      this.applying_ops.delete(cancelled);
    }

    const prepared = this.resolve_acked(cancelled);

    if (this.account_id !== account_id) {
      return { ok: false, queued: false, id_map: {}, acks: {} };
    }

    const entry: QueueEntry = {
      id: generate_temp_id(),
      account_id,
      seq: this.next_seq,
      op: prepared,
      maybe_sent: false,
      queued_offline: !is_online(),
    };

    this.next_seq += 1;
    this.entries.push(entry);
    await this.persist(entry);
    this.emit({ type: "pending_changed", count: this.entries.length });

    if (!is_online()) {
      this.note_offline_queue();

      return { ok: true, queued: true, id_map: {}, acks: {} };
    }

    const waiter = new Promise<SubmitResult>((resolve) => {
      const list = this.waiters.get(entry.id) ?? [];

      list.push(resolve);
      this.waiters.set(entry.id, list);
    });

    void this.flush();

    const result = await Promise.race([
      waiter,
      this.flush_promise?.then(() => null) ?? Promise.resolve(null),
    ]);

    if (result) return result;

    this.waiters.delete(entry.id);

    return { ok: true, queued: true, id_map: {}, acks: {} };
  }

  async flush(): Promise<void> {
    if (this.flush_promise) {
      this.flush_again = true;

      return this.flush_promise;
    }

    this.flush_promise = this.flush_inner().finally(() => {
      this.flush_promise = null;
      if (this.flush_again) {
        this.flush_again = false;
        this.schedule_flush(0);
      }
    });

    return this.flush_promise;
  }

  async resolve_conflict(
    conflict_id: string,
    choice: "keep_mine" | "use_theirs",
  ): Promise<void> {
    const index = this.conflicts.findIndex((item) => item.id === conflict_id);

    if (index === -1) return;

    const conflict = this.conflicts[index];
    const entry = this.entries.find((item) => item.id === conflict.id);

    this.conflicts.splice(index, 1);

    if (choice === "keep_mine") {
      if (entry) {
        this.rebase_entry(entry, conflict.target_id, conflict.server_version);
        await this.reseal_entry(entry, conflict);
        await this.persist(entry);
      }
      this.server_rows.delete(conflict.id);
    } else {
      await this.remove_target(conflict.target_id);
      release_revision(conflict.target, this.bound_id(conflict.target_id));
      await this.apply_server_row(conflict);
    }

    this.emit({ type: "conflicts_changed" });
    this.schedule_flush(0);
  }

  reset(): void {
    this.account_id = null;
    this.load_promise = null;
    this.entries = [];
    this.conflicts.length = 0;
    this.server_rows.clear();
    this.unreadable_attempts.clear();
    this.foreign_conflict_attempts.clear();
    this.waiters.clear();
    if (this.retry_timer) clearTimeout(this.retry_timer);
    this.retry_timer = null;
    this.retry_attempt = 0;
    this.flush_again = false;
    this.offline_notice_pending = false;
  }

  private emit(event: QueueEvent): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      }
    }
  }

  private note_offline_queue(): void {
    if (this.offline_notice_pending) return;
    this.offline_notice_pending = true;
    this.emit({ type: "queued_offline" });
  }

  private attach_listeners(): void {
    if (this.listeners_attached || typeof window === "undefined") return;
    this.listeners_attached = true;
    window.addEventListener("online", () => {
      this.retry_attempt = 0;
      this.schedule_flush(0);
    });
  }

  private schedule_flush(wait_ms: number): void {
    if (this.retry_timer) clearTimeout(this.retry_timer);
    this.retry_timer = setTimeout(() => {
      this.retry_timer = null;
      void this.flush();
    }, wait_ms);
  }

  private owns(entry: QueueEntry): boolean {
    return (
      entry.account_id === this.account_id &&
      entry.account_id === calendar_sync_engine.current_account_id()
    );
  }

  private async persist(entry: QueueEntry): Promise<void> {
    const record: QueueRecord = {
      id: entry.id,
      seq: entry.seq,
      payload: {
        op: entry.op,
        maybe_sent: entry.maybe_sent,
        queued_offline: entry.queued_offline,
      } satisfies StoredEntry,
    };

    await write_queue_record(entry.account_id, record);
  }

  private async drop_entry(entry: QueueEntry): Promise<void> {
    const index = this.entries.indexOf(entry);

    if (index !== -1) this.entries.splice(index, 1);
    await remove_queue_record(entry.account_id, entry.id);
    this.emit({ type: "pending_changed", count: this.entries.length });
  }

  private settle(entry: QueueEntry, result: SubmitResult): void {
    const waiters = this.waiters.get(entry.id);

    if (!waiters) return;
    this.waiters.delete(entry.id);
    for (const resolve of waiters) resolve(result);
  }

  private create_may_have_landed(temp_id: string): boolean {
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      const op = entry.op;
      const creates =
        ((op.kind === "event_create" || op.kind === "calendar_create") &&
          op.temp_id === temp_id) ||
        (op.kind === "event_batch" &&
          op.operations.some(
            (item) => item.op === "create" && item.temp_id === temp_id,
          ));

      if (creates) {
        return entry.maybe_sent || (index === 0 && this.flush_promise !== null);
      }
    }

    return false;
  }

  private cancel_unsynced_create(op: QueuedOperation): QueuedOperation | null {
    if (op.kind === "event_delete" && is_temp_id(op.event_id)) {
      if (this.create_may_have_landed(op.event_id)) return op;
      void this.remove_target(op.event_id);
      void calendar_sync_engine.remove_event_local(op.event_id);

      return null;
    }
    if (op.kind === "calendar_delete" && is_temp_id(op.calendar_id)) {
      if (this.create_may_have_landed(op.calendar_id)) return op;
      void this.remove_target(op.calendar_id);
      void calendar_sync_engine.remove_calendar_local(op.calendar_id);

      return null;
    }

    return op;
  }

  private async moved_row_is_current(
    entry: QueueEntry,
    row: Record<string, unknown>,
  ): Promise<boolean> {
    const target = conflict_target(entry.op);
    const revision = await calendar_sync_engine.server_row_revision(
      target,
      row as unknown as ServerEventRowLike & ServerCalendarRowLike,
    );

    if (revision === null) return false;

    return (
      revision >=
      known_revision(
        target,
        created_server_id(entry.op) ??
          this.bound_id(operation_ids(entry.op)[0]),
      )
    );
  }

  private finish_revisions(entry: QueueEntry, is_released: boolean): void {
    const target = conflict_target(entry.op);

    for (const id of operation_ids(entry.op)) {
      const bound = this.bound_id(id);
      const is_shared = this.entries.some(
        (other) =>
          other !== entry &&
          conflict_target(other.op) === target &&
          operation_ids(other.op).some(
            (other_id) => other_id === id || this.bound_id(other_id) === bound,
          ),
      );

      if (is_shared) continue;
      if (is_released) release_revision(target, bound);
      else settle_revision(target, bound);
    }
  }

  private async reseal_entry(
    entry: QueueEntry,
    conflict: SyncConflict,
  ): Promise<void> {
    const vault = get_vault_from_memory();
    const row = this.server_rows.get(conflict.id);

    if (!vault) return;

    const target = conflict.target;
    const target_id = this.bound_id(conflict.target_id);
    const server_revision = row
      ? await calendar_sync_engine.server_row_revision(
          target,
          row as unknown as ServerEventRowLike & ServerCalendarRowLike,
        )
      : null;

    if (server_revision !== null) {
      observe_revision(target, target_id, server_revision);
    }

    const revision = (): number =>
      Math.max(next_revision(target, target_id), (server_revision ?? 0) + 1);
    const reseal_event = async (item: {
      calendar_id: string;
      encrypted_blob: string;
      blob_nonce: string;
    }): Promise<void> => {
      const decoded = await decode_event_row(
        {
          id: target_id,
          calendar_id: this.bound_id(item.calendar_id),
          encrypted_blob: item.encrypted_blob,
          blob_nonce: item.blob_nonce,
          updated_at: now_iso(),
        },
        vault,
      );

      if (!decoded) return;

      const sealed = await encrypt_event_draft(
        event_to_draft(decoded.event),
        vault,
        target_id,
        null,
        revision(),
      );

      await this.replace_local_blob(target, conflict.target_id, item, sealed);
      item.encrypted_blob = sealed.encrypted_blob;
      item.blob_nonce = sealed.blob_nonce;
    };
    const op = entry.op;

    if (
      (op.kind === "event_update" || op.kind === "event_create") &&
      this.bound_id(op.kind === "event_update" ? op.event_id : op.temp_id) ===
        target_id
    ) {
      await reseal_event(op);
    }
    if (op.kind === "event_batch") {
      for (const item of op.operations) {
        if (item.op === "delete") continue;
        if (
          this.bound_id(item.op === "update" ? item.event_id : item.temp_id) !==
          target_id
        ) {
          continue;
        }
        await reseal_event(item);
      }
    }
    if (
      (op.kind === "calendar_update" || op.kind === "calendar_create") &&
      this.bound_id(
        op.kind === "calendar_update" ? op.calendar_id : op.temp_id,
      ) === target_id
    ) {
      const decoded = await decode_calendar_row(
        {
          id: target_id,
          is_visible: true,
          is_default: false,
          encrypted_blob: op.encrypted_blob,
          blob_nonce: op.blob_nonce,
        },
        vault,
      );

      if (!decoded) return;

      const sealed = await encrypt_calendar_blob(
        {
          name: decoded.calendar.name,
          color: decoded.calendar.color,
          icon: decoded.calendar.icon,
        },
        vault,
        target_id,
        null,
        revision(),
      );

      await this.replace_local_blob(target, conflict.target_id, op, sealed);
      op.encrypted_blob = sealed.encrypted_blob;
      op.blob_nonce = sealed.blob_nonce;
    }
  }

  private async replace_local_blob(
    target: "event" | "calendar",
    id: string,
    previous: { encrypted_blob: string; blob_nonce: string },
    sealed: { encrypted_blob: string; blob_nonce: string },
  ): Promise<void> {
    const blob = {
      encrypted_blob: sealed.encrypted_blob,
      blob_nonce: sealed.blob_nonce,
    };

    if (target === "calendar") {
      const row = calendar_sync_engine.get_calendar_row(id);

      if (!row || !blob_matches({ ...row }, previous)) return;
      await calendar_sync_engine.upsert_calendar_local(
        { ...row, ...blob },
        calendar_sync_engine.get_calendar(id),
      );

      return;
    }

    const row = calendar_sync_engine.get_event_row(id);

    if (!row || !blob_matches({ ...row }, previous)) return;
    await calendar_sync_engine.upsert_event_local(
      { ...row, ...blob },
      calendar_sync_engine.get_event(id),
    );
  }

  private async remove_target(target_id: string): Promise<void> {
    for (const entry of [...this.entries]) {
      if (entry.op.kind === "event_batch") {
        entry.op.operations = entry.op.operations.filter(
          (item) =>
            (item.op === "create" ? item.temp_id : item.event_id) !== target_id,
        );
        if (entry.op.operations.length === 0) await this.drop_entry(entry);
        else await this.persist(entry);
        continue;
      }
      if (operation_ids(entry.op).includes(target_id)) {
        await this.drop_entry(entry);
      }
    }
  }

  private async apply_optimistic(
    op: QueuedOperation,
    optimistic?: {
      event?: DecryptedCalendarEvent | null;
      calendar?: DecryptedCalendar | null;
    },
  ): Promise<void> {
    const now = now_iso();

    switch (op.kind) {
      case "event_create":
        await calendar_sync_engine.upsert_event_local(
          {
            id: op.temp_id,
            calendar_id: op.calendar_id,
            encrypted_blob: op.encrypted_blob,
            blob_nonce: op.blob_nonce,
            version: 0,
            created_at: now,
            updated_at: now,
          },
          optimistic?.event,
        );

        return;
      case "event_update": {
        const row = calendar_sync_engine.get_event_row(op.event_id);

        await calendar_sync_engine.upsert_event_local(
          {
            id: op.event_id,
            calendar_id: op.calendar_id,
            encrypted_blob: op.encrypted_blob,
            blob_nonce: op.blob_nonce,
            version: row?.version ?? 0,
            created_at: row?.created_at ?? now,
            updated_at: now,
          },
          optimistic?.event,
        );

        return;
      }
      case "event_delete":
        await calendar_sync_engine.remove_event_local(op.event_id);

        return;
      case "event_batch":
        for (const item of op.operations) {
          if (item.op === "create") {
            await calendar_sync_engine.upsert_event_local({
              id: item.temp_id,
              calendar_id: item.calendar_id,
              encrypted_blob: item.encrypted_blob,
              blob_nonce: item.blob_nonce,
              version: 0,
              created_at: now,
              updated_at: now,
            });
          } else if (item.op === "update") {
            const row = calendar_sync_engine.get_event_row(item.event_id);

            await calendar_sync_engine.upsert_event_local({
              id: item.event_id,
              calendar_id: item.calendar_id,
              encrypted_blob: item.encrypted_blob,
              blob_nonce: item.blob_nonce,
              version: row?.version ?? 0,
              created_at: row?.created_at ?? now,
              updated_at: now,
            });
          } else {
            await calendar_sync_engine.remove_event_local(item.event_id);
          }
        }

        return;
      case "calendar_create":
        await calendar_sync_engine.upsert_calendar_local(
          {
            id: op.temp_id,
            encrypted_blob: op.encrypted_blob,
            blob_nonce: op.blob_nonce,
            is_visible: true,
            is_default: op.is_default,
            version: 0,
            updated_at: now,
          },
          optimistic?.calendar,
        );

        return;
      case "calendar_update": {
        const row = calendar_sync_engine.get_calendar_row(op.calendar_id);

        await calendar_sync_engine.upsert_calendar_local(
          {
            id: op.calendar_id,
            encrypted_blob: op.encrypted_blob,
            blob_nonce: op.blob_nonce,
            is_visible: row?.is_visible ?? true,
            is_default: row?.is_default ?? false,
            version: row?.version ?? 0,
            updated_at: now,
          },
          optimistic?.calendar,
        );

        return;
      }
      case "calendar_delete":
        await calendar_sync_engine.remove_calendar_local(op.calendar_id);

        return;
      case "calendar_visibility": {
        const row = calendar_sync_engine.get_calendar_row(op.calendar_id);
        const current = calendar_sync_engine.get_calendar(op.calendar_id);

        if (!row) return;
        await calendar_sync_engine.upsert_calendar_local(
          { ...row, is_visible: op.is_visible, updated_at: now },
          current ? { ...current, is_visible: op.is_visible } : null,
        );
      }
    }
  }

  private async flush_inner(): Promise<void> {
    await this.ensure_loaded();

    const account_id = this.account_id;

    if (
      account_id &&
      this.entries.length > 0 &&
      is_online() &&
      !(await confirm_calendar_identity(account_id))
    ) {
      if (this.account_id === account_id && is_online()) {
        this.schedule_flush(IDENTITY_RETRY_MS);
      }

      return;
    }

    let drained_offline = false;

    while (this.entries.length > 0) {
      if (!is_online()) return;
      if (this.conflicts.length > 0) return;

      const entry = this.entries[0];

      if (!this.owns(entry)) return;

      const outcome = await this.send(entry);

      if (!this.owns(entry)) return;

      if (outcome.kind === "ack") {
        if (entry.queued_offline) drained_offline = true;
        await this.handle_ack(entry, outcome);
        this.retry_attempt = 0;
        continue;
      }
      if (outcome.kind === "conflict") {
        const applied =
          created_row_moved(entry.op, outcome.row) &&
          !(await this.moved_row_is_current(entry, outcome.row))
            ? null
            : conflict_as_ack(entry.op, outcome.row);

        if (applied) {
          if (entry.queued_offline) drained_offline = true;
          await this.handle_ack(entry, applied);
          if (this.owns(entry) && created_row_moved(entry.op, outcome.row)) {
            await this.apply_row(conflict_target(entry.op), outcome.row);
          }
          this.retry_attempt = 0;
          continue;
        }
        if (conflict_row_is_deleted_create(entry.op, outcome.row)) {
          await this.handle_drop(entry, "not_found");
          continue;
        }

        await this.register_conflict(entry, outcome);

        return;
      }
      if (outcome.kind === "drop") {
        await this.handle_drop(entry, outcome.reason);
        continue;
      }

      entry.maybe_sent =
        entry.maybe_sent || this.could_have_reached_server(entry);
      await this.persist(entry);
      const wait =
        RETRY_DELAYS_MS[
          Math.min(this.retry_attempt, RETRY_DELAYS_MS.length - 1)
        ];

      this.retry_attempt += 1;
      if (is_online()) this.schedule_flush(wait);

      return;
    }

    if (drained_offline || this.offline_notice_pending) {
      this.offline_notice_pending = false;
      if (drained_offline) this.emit({ type: "drained" });
    }
  }

  private could_have_reached_server(entry: QueueEntry): boolean {
    return (
      entry.op.kind === "event_create" ||
      entry.op.kind === "calendar_create" ||
      (entry.op.kind === "event_batch" &&
        entry.op.operations.some((item) => item.op === "create"))
    );
  }

  private async send(entry: QueueEntry): Promise<SendOutcome> {
    if (entry.maybe_sent) {
      const recovered = await this.recover_sent_create(entry);

      if (recovered) return recovered;
      if (!this.owns(entry)) return { kind: "retry" };
    }

    const op = entry.op;

    switch (op.kind) {
      case "event_create": {
        const response = await api_client.post<MutationResponse>(
          EVENTS_ENDPOINT,
          {
            ...(op.server_id ? { id: op.server_id } : {}),
            calendar_id: op.calendar_id,
            encrypted_blob: op.encrypted_blob,
            blob_nonce: op.blob_nonce,
            client_ref: op.client_ref,
          },
        );

        return this.mutation_outcome(response, op.temp_id, op.server_id);
      }
      case "event_update": {
        const response = await api_client.put<MutationResponse>(
          `${EVENTS_ENDPOINT}/${op.event_id}`,
          with_expected(
            {
              calendar_id: op.calendar_id,
              encrypted_blob: op.encrypted_blob,
              blob_nonce: op.blob_nonce,
            },
            op.expected_version,
          ),
        );

        return this.mutation_outcome(response, op.event_id);
      }
      case "event_delete": {
        if (is_temp_id(op.event_id)) {
          return { kind: "ack", id_map: {}, acks: {} };
        }

        const response = await api_client.delete<MutationResponse>(
          `${EVENTS_ENDPOINT}/${op.event_id}${query_expected(op.expected_version)}`,
        );

        return (
          deleted_outcome(response, op.event_id) ??
          this.mutation_outcome(response, op.event_id)
        );
      }
      case "event_batch": {
        const response = await api_client.post<BatchResponse>(
          `${EVENTS_ENDPOINT}/batch`,
          {
            operations: op.operations.map((item) => {
              if (item.op === "create") {
                return {
                  op: "create",
                  ...(item.server_id ? { id: item.server_id } : {}),
                  client_ref: item.client_ref,
                  calendar_id: item.calendar_id,
                  encrypted_blob: item.encrypted_blob,
                  blob_nonce: item.blob_nonce,
                };
              }
              if (item.op === "update") {
                return with_expected(
                  {
                    op: "update",
                    event_id: item.event_id,
                    calendar_id: item.calendar_id,
                    encrypted_blob: item.encrypted_blob,
                    blob_nonce: item.blob_nonce,
                  },
                  item.expected_version,
                );
              }

              return with_expected(
                { op: "delete", event_id: item.event_id },
                item.expected_version,
              );
            }),
          },
        );

        if (!response || response.error || !response.data) {
          return classify_failure(response);
        }

        const acks: Record<string, AckRecord> = {};
        const id_map: Record<string, string> = {};
        const results = response.data.results ?? [];
        const echo_mismatch = op.operations.some((item, index) => {
          if (item.op !== "create" || !item.server_id) return false;
          const matched =
            results.find(
              (candidate) => candidate.client_ref === item.client_ref,
            ) ?? results[index];

          return !!matched && matched.event_id !== item.server_id;
        });

        if (echo_mismatch) return { kind: "drop", reason: "rejected" };

        op.operations.forEach((item, index) => {
          const result = results[index];

          if (!result) return;
          if (item.op === "create") {
            const matched =
              results.find(
                (candidate) => candidate.client_ref === item.client_ref,
              ) ?? result;

            id_map[item.temp_id] = matched.event_id;
            acks[matched.event_id] = {
              updated_at: matched.updated_at,
              version: matched.version ?? 1,
            };
          } else {
            acks[item.event_id] = {
              updated_at: result.updated_at,
              version: result.version ?? 0,
            };
          }
        });

        return { kind: "ack", acks, id_map };
      }
      case "calendar_create": {
        const response = await api_client.post<MutationResponse>(
          CALENDARS_ENDPOINT,
          {
            ...(op.server_id ? { id: op.server_id } : {}),
            encrypted_blob: op.encrypted_blob,
            blob_nonce: op.blob_nonce,
            is_default: op.is_default,
          },
        );

        return this.mutation_outcome(response, op.temp_id, op.server_id);
      }
      case "calendar_update": {
        const response = await api_client.put<MutationResponse>(
          `${CALENDARS_ENDPOINT}/${op.calendar_id}`,
          with_expected(
            { encrypted_blob: op.encrypted_blob, blob_nonce: op.blob_nonce },
            op.expected_version,
          ),
        );

        return this.mutation_outcome(response, op.calendar_id);
      }
      case "calendar_delete": {
        if (is_temp_id(op.calendar_id)) {
          return { kind: "ack", id_map: {}, acks: {} };
        }

        const response = await api_client.delete<MutationResponse>(
          `${CALENDARS_ENDPOINT}/${op.calendar_id}${query_expected(op.expected_version)}`,
        );

        return (
          deleted_outcome(response, op.calendar_id) ??
          this.mutation_outcome(response, op.calendar_id)
        );
      }
      case "calendar_visibility": {
        const response = await api_client.patch<MutationResponse>(
          `${CALENDARS_ENDPOINT}/${op.calendar_id}/visibility`,
          with_expected({ is_visible: op.is_visible }, op.expected_version),
        );

        return this.mutation_outcome(response, op.calendar_id);
      }
    }
  }

  private mutation_outcome(
    response: ApiResponse<MutationResponse> | undefined,
    local_id: string,
    expected_id?: string,
  ): SendOutcome {
    if (!response || response.error || !response.data) {
      return classify_failure(response);
    }

    const data = response.data;
    const returned_id = typeof data.id === "string" && data.id ? data.id : null;

    if (expected_id && returned_id !== null && returned_id !== expected_id) {
      return { kind: "drop", reason: "rejected" };
    }

    const real_id = returned_id ?? expected_id ?? local_id;
    const id_map: Record<string, string> = {};

    if (real_id !== local_id) id_map[local_id] = real_id;

    return {
      kind: "ack",
      id_map,
      acks: {
        [real_id]: {
          updated_at: data.updated_at ?? now_iso(),
          version: typeof data.version === "number" ? data.version : 0,
        },
      },
    };
  }

  private async recover_sent_create(
    entry: QueueEntry,
  ): Promise<SendOutcome | null> {
    this.recovering = entry;
    try {
      await calendar_sync_engine.pull_delta();
    } finally {
      this.recovering = null;
    }

    const op = entry.op;

    if (op.kind === "event_create") {
      const match = calendar_sync_engine
        .get_events()
        .map((event) => calendar_sync_engine.get_event_row(event.id))
        .find(
          (row) =>
            row &&
            row.blob_nonce === op.blob_nonce &&
            row.encrypted_blob === op.encrypted_blob &&
            !is_temp_id(row.id),
        );

      if (!match) return null;

      return {
        kind: "ack",
        id_map: { [op.temp_id]: match.id },
        acks: {
          [match.id]: { updated_at: match.updated_at, version: match.version },
        },
      };
    }
    if (op.kind === "calendar_create") {
      const match = calendar_sync_engine
        .get_calendars()
        .map((calendar) => calendar_sync_engine.get_calendar_row(calendar.id))
        .find(
          (row) =>
            row &&
            row.blob_nonce === op.blob_nonce &&
            row.encrypted_blob === op.encrypted_blob &&
            !is_temp_id(row.id),
        );

      if (!match) return null;

      return {
        kind: "ack",
        id_map: { [op.temp_id]: match.id },
        acks: {
          [match.id]: { updated_at: match.updated_at, version: match.version },
        },
      };
    }

    return null;
  }

  private async handle_ack(
    entry: QueueEntry,
    outcome: Extract<SendOutcome, { kind: "ack" }>,
  ): Promise<void> {
    const is_calendar = conflict_target(entry.op) === "calendar";

    this.finish_revisions(entry, false);

    for (const [temp_id, real_id] of Object.entries(outcome.id_map)) {
      const ack = outcome.acks[real_id];

      this.resolved_ids.set(temp_id, real_id);

      if (!is_calendar) register_event_render_alias(real_id, temp_id);

      if (is_calendar) {
        const row = calendar_sync_engine.get_calendar_row(temp_id);

        if (row) {
          await calendar_sync_engine.remap_calendar_local(temp_id, {
            ...row,
            id: real_id,
            version: ack?.version ?? 1,
            updated_at: ack?.updated_at ?? row.updated_at,
          });
          if (!this.owns(entry)) return;
        }
      } else {
        const row = calendar_sync_engine.get_event_row(temp_id);

        if (row) {
          await calendar_sync_engine.remap_event_local(temp_id, {
            ...row,
            id: real_id,
            version: ack?.version ?? 1,
            updated_at: ack?.updated_at ?? row.updated_at,
          });
          if (!this.owns(entry)) return;
        }
      }
      this.rewrite_references(temp_id, real_id, ack?.version ?? 1);
    }

    for (const [id, ack] of Object.entries(outcome.acks)) {
      if (outcome.id_map[id] !== undefined) continue;
      if (Object.values(outcome.id_map).includes(id)) continue;
      if (is_calendar) {
        const row = calendar_sync_engine.get_calendar_row(id);

        if (row) {
          await calendar_sync_engine.upsert_calendar_local(
            { ...row, version: ack.version, updated_at: ack.updated_at },
            calendar_sync_engine.get_calendar(id),
          );
          if (!this.owns(entry)) return;
        }
      } else {
        const row = calendar_sync_engine.get_event_row(id);

        if (row) {
          await calendar_sync_engine.upsert_event_local(
            { ...row, version: ack.version, updated_at: ack.updated_at },
            calendar_sync_engine.get_event(id),
          );
          if (!this.owns(entry)) return;
        }
      }
      this.rebase_following(entry, id, ack.version);
    }

    calendar_sync_engine.note_own_ids([
      ...Object.keys(outcome.acks),
      ...Object.values(outcome.id_map),
    ]);
    await this.drop_entry(entry);
    calendar_sync_engine.broadcast_cross_tab();
    this.settle(entry, {
      ok: true,
      queued: false,
      id_map: outcome.id_map,
      acks: outcome.acks,
    });
  }

  private rewrite_references(
    temp_id: string,
    real_id: string,
    version: number,
  ): void {
    for (const entry of this.entries) {
      if (remap_op(entry.op, temp_id, real_id, version)) {
        void this.persist(entry);
      }
    }
  }

  private resolve_acked(op: QueuedOperation): QueuedOperation {
    let resolved = op;

    for (const [temp_id, real_id] of this.resolved_ids) {
      const copy: QueuedOperation =
        resolved === op ? structuredClone(op) : resolved;
      const version =
        conflict_target(op) === "calendar"
          ? calendar_row_version(real_id)
          : event_row_version(real_id);

      if (remap_op(copy, temp_id, real_id, version)) resolved = copy;
    }

    return resolved;
  }

  private rebase_following(
    acked: QueueEntry,
    id: string,
    version: number,
  ): void {
    for (const entry of this.entries) {
      if (entry === acked) continue;
      this.rebase_entry(entry, id, version);
      if (operation_ids(entry.op).includes(id)) void this.persist(entry);
    }
  }

  private rebase_entry(entry: QueueEntry, id: string, version: number): void {
    const op = entry.op;

    if (
      (op.kind === "event_update" || op.kind === "event_delete") &&
      op.event_id === id
    ) {
      op.expected_version = version;
    }
    if (op.kind === "event_batch") {
      for (const item of op.operations) {
        if (item.op !== "create" && item.event_id === id) {
          item.expected_version = version;
        }
      }
    }
    if (
      (op.kind === "calendar_update" ||
        op.kind === "calendar_delete" ||
        op.kind === "calendar_visibility") &&
      op.calendar_id === id
    ) {
      op.expected_version = version;
    }
  }

  private async handle_drop(
    entry: QueueEntry,
    reason: "not_found" | "rejected" | "plan_limit",
  ): Promise<void> {
    const target = conflict_target(entry.op);
    const ids = operation_ids(entry.op);

    this.finish_revisions(entry, true);

    for (const id of ids) {
      if (is_temp_id(id)) {
        if (target === "calendar")
          await calendar_sync_engine.remove_calendar_local(id);
        else await calendar_sync_engine.remove_event_local(id);
      }
    }
    this.unreadable_attempts.delete(entry.id);
    this.foreign_conflict_attempts.delete(entry.id);
    await this.drop_entry(entry);
    this.settle(entry, { ok: false, queued: false, id_map: {}, acks: {} });
    this.emit({ type: "dropped", target, reason });
    if (ids.some((id) => !is_temp_id(id))) {
      await calendar_sync_engine.request_full_sync(target);
    } else {
      calendar_sync_engine.schedule_pull(0);
    }
  }

  private async register_conflict(
    entry: QueueEntry,
    outcome: Extract<SendOutcome, { kind: "conflict" }>,
  ): Promise<void> {
    const row = outcome.row;
    const local_ids = operation_ids(entry.op);
    const allowed_ids = new Set([
      ...local_ids,
      ...local_ids.map((id) => this.bound_id(id)),
    ]);

    if (typeof row.id === "string" && !allowed_ids.has(row.id)) {
      const attempts = (this.foreign_conflict_attempts.get(entry.id) ?? 0) + 1;

      if (attempts > UNREADABLE_CONFLICT_RETRIES) {
        await this.handle_drop(entry, "rejected");

        return;
      }
      this.foreign_conflict_attempts.set(entry.id, attempts);
      this.settle(entry, { ok: true, queued: true, id_map: {}, acks: {} });
      this.schedule_flush(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);

      return;
    }

    this.foreign_conflict_attempts.delete(entry.id);

    const target_id = typeof row.id === "string" ? row.id : local_ids[0];
    const server_version = typeof row.version === "number" ? row.version : 0;
    let server = await this.describe_server(outcome.target, row);
    const local = this.describe_local(entry, target_id);
    const has_server_copy =
      row.deleted !== true && typeof row.encrypted_blob === "string";

    if (!server && !has_server_copy) {
      this.unreadable_attempts.delete(entry.id);
      this.rebase_entry(entry, target_id, server_version);
      await this.persist(entry);
      this.schedule_flush(0);

      return;
    }

    if (!server && !get_vault_from_memory()) {
      this.settle(entry, { ok: true, queued: true, id_map: {}, acks: {} });
      this.schedule_flush(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);

      return;
    }

    if (!server) {
      const attempts = (this.unreadable_attempts.get(entry.id) ?? 0) + 1;

      if (attempts <= UNREADABLE_CONFLICT_RETRIES) {
        this.unreadable_attempts.set(entry.id, attempts);
        this.settle(entry, { ok: true, queued: true, id_map: {}, acks: {} });
        this.schedule_flush(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);

        return;
      }

      server = {
        title: "",
        starts_at: null,
        ends_at: null,
        is_all_day: false,
        updated_at:
          typeof row.updated_at === "string" ? row.updated_at : now_iso(),
        deleted: false,
        unreadable: true,
      };
    }

    this.unreadable_attempts.delete(entry.id);

    this.server_rows.set(entry.id, row);
    this.conflicts.push({
      id: entry.id,
      target: outcome.target,
      target_id,
      local,
      server,
      server_version,
    });
    this.settle(entry, { ok: true, queued: true, id_map: {}, acks: {} });
    this.emit({ type: "conflicts_changed" });
  }

  private describe_local(
    entry: QueueEntry,
    target_id: string,
  ): ConflictVersion {
    const op = entry.op;
    const deleted =
      (op.kind === "event_delete" && op.event_id === target_id) ||
      (op.kind === "calendar_delete" && op.calendar_id === target_id) ||
      (op.kind === "event_batch" &&
        op.operations.some(
          (item) => item.op === "delete" && item.event_id === target_id,
        ));

    if (conflict_target(op) === "calendar") {
      const calendar = calendar_sync_engine.get_calendar(target_id);

      return {
        title: calendar?.name ?? "",
        starts_at: null,
        ends_at: null,
        is_all_day: false,
        updated_at:
          calendar_sync_engine.get_calendar_row(target_id)?.updated_at ??
          now_iso(),
        deleted,
      };
    }

    const event = calendar_sync_engine.get_event(target_id);

    return {
      title: event?.title ?? "",
      starts_at: event?.starts_at ?? null,
      ends_at: event?.ends_at ?? null,
      is_all_day: event?.is_all_day ?? false,
      updated_at: event?.updated_at ?? now_iso(),
      deleted,
    };
  }

  private async describe_server(
    target: "event" | "calendar",
    row: Record<string, unknown>,
  ): Promise<ConflictVersion | null> {
    if (
      typeof row.id !== "string" ||
      typeof row.encrypted_blob !== "string" ||
      typeof row.blob_nonce !== "string"
    ) {
      return null;
    }

    const updated_at =
      typeof row.updated_at === "string" ? row.updated_at : now_iso();

    if (target === "calendar") {
      const calendar = await calendar_sync_engine.read_server_calendar(
        row as unknown as ServerCalendarRowLike,
        true,
      );

      if (!calendar) return null;

      return {
        title: calendar.name,
        starts_at: null,
        ends_at: null,
        is_all_day: false,
        updated_at,
        deleted: row.deleted === true,
      };
    }

    const event = await calendar_sync_engine.read_server_event(
      row as unknown as ServerEventRowLike,
      true,
    );

    if (!event) return null;

    return {
      title: event.title,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      is_all_day: event.is_all_day,
      updated_at,
      deleted: row.deleted === true,
    };
  }

  private async apply_row(
    target: "event" | "calendar",
    row: Record<string, unknown>,
  ): Promise<void> {
    if (target === "calendar") {
      await calendar_sync_engine.apply_server_calendar(
        row as unknown as ServerCalendarRowLike,
        true,
      );
    } else {
      await calendar_sync_engine.apply_server_event(
        row as unknown as ServerEventRowLike,
        true,
      );
    }
  }

  private async apply_server_row(conflict: SyncConflict): Promise<void> {
    const row = this.server_rows.get(conflict.id);

    this.server_rows.delete(conflict.id);
    if (!row) {
      calendar_sync_engine.schedule_pull(0);

      return;
    }
    await this.apply_row(conflict.target, row);
  }
}

export const calendar_mutation_queue = new CalendarMutationQueue();

export function subscribe_calendar_queue(listener: QueueListener): () => void {
  return calendar_mutation_queue.subscribe(listener);
}

export function event_row_version(id: string): number | null {
  return expected_version_for(calendar_sync_engine.get_event_row(id));
}

export function calendar_row_version(id: string): number | null {
  return expected_version_for(calendar_sync_engine.get_calendar_row(id));
}

export type { CachedCalendarRow, CachedEventRow };
