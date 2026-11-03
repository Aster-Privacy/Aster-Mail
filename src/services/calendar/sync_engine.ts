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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type {
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { api_client } from "@/services/api/client";
import {
  CALENDAR_BLOB_FORMAT_V2,
  CALENDAR_BLOB_FORMAT_V3,
  calendar_v3_floor,
} from "@/services/calendar/calendar_crypto";
import { vault_pq_secrets } from "@/services/calendar/calendar_crypto_v3";
import {
  decode_calendar_row,
  decode_event_row,
} from "@/services/calendar/calendar_codec";
import {
  get_vault_from_memory,
  on_keys_ready,
  wait_for_account_key_load,
} from "@/services/crypto/memory_key_store";
import {
  type CachedCalendarRow,
  type CachedEventRow,
  type SyncCursor,
  clear_sync_account,
  read_cached_calendars,
  read_cached_events,
  read_sync_meta,
  resolve_sync_account_id,
  write_sync_page,
} from "@/services/calendar/sync_store";
import {
  confirm_calendar_identity,
  reset_calendar_identity,
} from "@/services/calendar/identity_guard";
import { is_temp_event_id } from "@/services/calendar/temp_id";
import {
  accept_revision,
  is_rolled_back,
  load_revisions,
  observe_revision,
  reset_revisions,
  take_revision_snapshot,
} from "@/services/calendar/revision_ledger";

export const CALENDARS_ENDPOINT = "/calendar/v1/calendars";
export const EVENTS_ENDPOINT = "/calendar/v1/events";
export const CALENDAR_CHANGE_CHANNEL = "aster_calendar_changes";
export const CALENDAR_CHANGED_EVENT = "aster-calendar-changed";

const COALESCE_MS = 300;
const CURSOR_MAX_AGE_MS = 20 * 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [500, 1500, 4000];
const OWN_ECHO_WINDOW_MS = 30_000;
const ACCOUNT_KEY_WAIT_MS = 10_000;
const MAX_PAGES = 200;
const FULL_SYNC_PAGE_SIZE = 500;
const FULL_SYNC_MAX_PAGES = 400;
const HORIZON_FOLLOW_UP_MS = 125_000;

export interface CalendarMutationFrame {
  type: "calendar_mutation";
  action?: string;
  ids?: string[];
  origin_device?: string | null;
}

interface ServerEventRow {
  id: string;
  calendar_id?: string;
  encrypted_blob?: string;
  blob_nonce?: string;
  created_at?: string;
  updated_at: string;
  version?: number;
  deleted?: boolean;
}

interface ServerCalendarRow {
  id: string;
  encrypted_blob?: string;
  blob_nonce?: string;
  is_visible?: boolean;
  is_default?: boolean;
  created_at?: string;
  updated_at: string;
  version?: number;
  deleted?: boolean;
}

interface DeltaPage {
  total?: number;
  server_time?: string;
  has_more?: boolean;
  cursor_id?: string;
}

interface EventsDeltaPage extends DeltaPage {
  events?: ServerEventRow[];
  next_cursor?: string | null;
}

interface CalendarsDeltaPage extends DeltaPage {
  calendars?: ServerCalendarRow[];
}

type SyncListener = () => void;
type PendingLookup = (id: string) => boolean;

interface OwnEcho {
  ids: Set<string>;
  noted_at: number;
}

function is_retryable(response: ApiResponse<unknown> | undefined): boolean {
  if (!response) return false;
  if (response.code === "NETWORK_ERROR" || response.code === "TIMEOUT_ERROR") {
    return true;
  }

  return typeof response.status === "number" && response.status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cursor_expired(cursor: SyncCursor | undefined): boolean {
  if (!cursor) return true;

  const at = Date.parse(cursor.server_time);

  return !Number.isFinite(at) || Date.now() - at > CURSOR_MAX_AGE_MS;
}

function delta_query(
  cursor: SyncCursor | undefined,
  full_sync: boolean,
): string {
  if (full_sync || !cursor) return "";

  const params = new URLSearchParams({ since: cursor.server_time });

  if (cursor.cursor_id) params.set("since_id", cursor.cursor_id);
  params.set("include_deleted", "true");

  return `?${params.toString()}`;
}

function next_cursor(page: DeltaPage): SyncCursor | null {
  if (typeof page.server_time !== "string" || page.server_time.length === 0) {
    return null;
  }

  return {
    server_time: page.server_time,
    cursor_id: page.has_more && page.cursor_id ? page.cursor_id : null,
  };
}

function has_rows_past_horizon(
  rows: readonly { updated_at: string }[],
  server_time: string | undefined,
): boolean {
  if (typeof server_time !== "string") return false;

  const horizon = Date.parse(server_time);

  if (!Number.isFinite(horizon)) return false;

  return rows.some((row) => Date.parse(row.updated_at) > horizon);
}

function is_older_row(
  row: { version?: number },
  local: { version: number } | undefined,
): boolean {
  return (
    !!local && typeof row.version === "number" && row.version < local.version
  );
}

function is_temp_row(id: string): boolean {
  return is_temp_event_id(id);
}

type IdBinder = (id: string) => string;

type DecodeOutcome = "accepted" | "rejected" | "failed";

function same_blob(
  previous: { encrypted_blob: string; blob_nonce: string } | undefined,
  next: { encrypted_blob: string; blob_nonce: string },
): boolean {
  return (
    previous !== undefined &&
    previous.encrypted_blob === next.encrypted_blob &&
    previous.blob_nonce === next.blob_nonce
  );
}

interface DecodedLevel {
  format: number;
  bound: boolean;
  current: boolean;
}

function record_level(decoded: DecodedLevel): number {
  if (decoded.format === CALENDAR_BLOB_FORMAT_V3) return 3;
  if (decoded.format === CALENDAR_BLOB_FORMAT_V2 && decoded.bound) return 2;

  return 1;
}

function needs_rewrite(
  decoded: DecodedLevel,
  vault: EncryptedVault | null,
): boolean {
  if (vault && vault_pq_secrets(vault).all.length > 0) {
    return !(decoded.format === CALENDAR_BLOB_FORMAT_V3 && decoded.current);
  }

  return record_level(decoded) < 2;
}

export class CalendarSyncEngine {
  private account_id: string | null = null;
  private generation = 0;
  private loaded = false;
  private load_promise: Promise<void> | null = null;
  private pull_promise: Promise<boolean> | null = null;
  private pull_again = false;
  private coalesce_timer: ReturnType<typeof setTimeout> | null = null;
  private horizon_timer: ReturnType<typeof setTimeout> | null = null;
  private own_session_id: string | null | undefined;
  private own_session_promise: Promise<string | null> | null = null;
  private listeners_attached = false;
  private change_channel: BroadcastChannel | null = null;
  private readonly listeners = new Set<SyncListener>();
  private readonly own_echoes: OwnEcho[] = [];
  private pending_lookup: PendingLookup = () => false;
  private readonly event_rows = new Map<string, CachedEventRow>();
  private readonly events = new Map<string, DecryptedCalendarEvent>();
  private readonly calendar_rows = new Map<string, CachedCalendarRow>();
  private readonly calendars = new Map<string, DecryptedCalendar>();
  private readonly failed_event_ids = new Set<string>();
  private readonly failed_calendar_ids = new Set<string>();
  private readonly legacy_event_ids = new Set<string>();
  private readonly legacy_calendar_ids = new Set<string>();
  private readonly bound_event_ids = new Set<string>();
  private readonly bound_calendar_ids = new Set<string>();
  private readonly v3_event_ids = new Set<string>();
  private readonly v3_calendar_ids = new Set<string>();
  private bound_ledger_dirty = false;

  private id_binder: IdBinder = (id) => id;

  set_id_binder(binder: IdBinder): void {
    this.id_binder = binder;
  }

  private bound_event_row(row: CachedEventRow): CachedEventRow {
    const id = this.id_binder(row.id);
    const calendar_id = this.id_binder(row.calendar_id);

    if (id === row.id && calendar_id === row.calendar_id) return row;

    return { ...row, id, calendar_id };
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  set_pending_lookup(lookup: PendingLookup): void {
    this.pending_lookup = lookup;
  }

  is_loaded(): boolean {
    return this.loaded;
  }

  is_current(account_id: string | null, generation: number): boolean {
    return this.account_id === account_id && this.generation === generation;
  }

  current_generation(): number {
    return this.generation;
  }

  current_account_id(): string | null {
    return this.account_id;
  }

  get_events(): DecryptedCalendarEvent[] {
    return Array.from(this.events.values());
  }

  get_event(id: string): DecryptedCalendarEvent | undefined {
    return this.events.get(id);
  }

  write_floor(id: string, is_calendar = false): number {
    const v3 = is_calendar ? this.v3_calendar_ids : this.v3_event_ids;
    const bound = is_calendar ? this.bound_calendar_ids : this.bound_event_ids;

    if (v3.has(id)) return 3;

    return bound.has(id) ? 2 : 1;
  }

  get_bound_event(id: string): DecryptedCalendarEvent | undefined {
    return this.events.get(id) ?? this.events.get(this.id_binder(id));
  }

  get_event_row(id: string): CachedEventRow | undefined {
    return this.event_rows.get(id);
  }

  get_calendars(): DecryptedCalendar[] {
    return Array.from(this.calendars.values()).sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;

      return a.name.localeCompare(b.name);
    });
  }

  calendar_count(): number {
    return this.calendar_rows.size;
  }

  get_calendar(id: string): DecryptedCalendar | undefined {
    return this.calendars.get(id);
  }

  get_calendar_row(id: string): CachedCalendarRow | undefined {
    return this.calendar_rows.get(id);
  }

  decrypt_failure_count(): number {
    return this.failed_event_ids.size + this.failed_calendar_ids.size;
  }

  failed_decrypt_ids(): { event_ids: string[]; calendar_ids: string[] } {
    return {
      event_ids: Array.from(this.failed_event_ids),
      calendar_ids: Array.from(this.failed_calendar_ids),
    };
  }

  legacy_event_rows(): CachedEventRow[] {
    return Array.from(this.legacy_event_ids)
      .filter((id) => !is_temp_row(id) && !this.pending_lookup(id))
      .map((id) => this.event_rows.get(id))
      .filter((row): row is CachedEventRow => row !== undefined);
  }

  legacy_calendar_rows(): CachedCalendarRow[] {
    return Array.from(this.legacy_calendar_ids)
      .filter((id) => !is_temp_row(id) && !this.pending_lookup(id))
      .map((id) => this.calendar_rows.get(id))
      .filter((row): row is CachedCalendarRow => row !== undefined);
  }

  async retry_failed_decrypts(): Promise<number> {
    await wait_for_account_key_load(ACCOUNT_KEY_WAIT_MS);

    const event_ids = Array.from(this.failed_event_ids);
    const calendar_ids = Array.from(this.failed_calendar_ids);

    for (const id of calendar_ids) {
      const row = this.calendar_rows.get(id);

      if (row) await this.decode_calendar(row);
      else this.failed_calendar_ids.delete(id);
    }
    for (const id of event_ids) {
      const row = this.event_rows.get(id);

      if (row) await this.decode_event(row);
      else this.failed_event_ids.delete(id);
    }

    this.notify();

    return this.decrypt_failure_count();
  }

  async ensure_loaded(): Promise<void> {
    const account_id = await resolve_sync_account_id();

    if (account_id !== this.account_id) {
      this.reset_memory();
      this.account_id = account_id;
    }

    if (this.loaded) return;
    if (!this.load_promise) {
      this.load_promise = this.initial_load_inner().finally(() => {
        this.load_promise = null;
      });
    }

    await this.load_promise;
  }

  async initial_load(): Promise<void> {
    await this.ensure_loaded();
  }

  async pull_delta(): Promise<boolean> {
    if (this.pull_promise) {
      this.pull_again = true;

      return this.pull_promise;
    }

    this.pull_promise = this.pull_with_retries().finally(() => {
      this.pull_promise = null;
      if (this.pull_again) {
        this.pull_again = false;
        this.schedule_pull(0);
      }
    });

    return this.pull_promise;
  }

  schedule_pull(wait_ms: number = COALESCE_MS): void {
    if (this.coalesce_timer) clearTimeout(this.coalesce_timer);
    this.coalesce_timer = setTimeout(() => {
      this.coalesce_timer = null;
      void this.pull_delta();
    }, wait_ms);
  }

  private schedule_horizon_pull(): void {
    if (this.horizon_timer) return;

    const generation = this.generation;

    this.horizon_timer = setTimeout(() => {
      this.horizon_timer = null;
      if (this.generation === generation) void this.pull_delta();
    }, HORIZON_FOLLOW_UP_MS);
  }

  note_own_ids(ids: readonly string[]): void {
    const unique = new Set(ids.filter((id) => id.length > 0));

    if (unique.size === 0) return;
    this.own_echoes.push({ ids: unique, noted_at: Date.now() });
    this.prune_echoes();
  }

  async handle_realtime_frame(frame: CalendarMutationFrame): Promise<void> {
    if (frame.type !== "calendar_mutation") return;

    const own_session = await this.resolve_own_session_id();

    if (
      frame.origin_device &&
      own_session &&
      frame.origin_device === own_session
    ) {
      return;
    }

    const ids = Array.isArray(frame.ids) ? frame.ids : [];

    if (!frame.origin_device && ids.length > 0 && this.all_own_echo(ids)) {
      return;
    }

    this.schedule_pull();
  }

  async upsert_event_local(
    row: CachedEventRow,
    decrypted?: DecryptedCalendarEvent | null,
    is_own_write = true,
  ): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    const is_same_blob =
      !this.failed_event_ids.has(row.id) &&
      same_blob(this.event_rows.get(row.id), row);

    this.event_rows.set(row.id, row);
    if (decrypted && (is_same_blob || is_temp_row(row.id))) {
      this.events.set(row.id, decrypted);
      this.failed_event_ids.delete(row.id);
      this.legacy_event_ids.delete(row.id);
    } else {
      await this.decode_event(row, is_own_write || is_same_blob);
      if (!this.is_current(account_id, generation)) return;
      if (decrypted && this.events.has(row.id)) {
        this.events.set(row.id, decrypted);
      }
    }
    if (account_id) {
      await write_sync_page(account_id, { events: [row] });
    }
    if (!this.is_current(account_id, generation)) return;
    await this.persist_bound_ledger();
    this.notify();
  }

  async remove_event_local(id: string): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    this.event_rows.delete(id);
    this.events.delete(id);
    this.failed_event_ids.delete(id);
    this.legacy_event_ids.delete(id);
    if (account_id) {
      await write_sync_page(account_id, { event_deletes: [id] });
    }
    if (!this.is_current(account_id, generation)) return;
    await this.persist_bound_ledger();
    this.notify();
  }

  async remap_event_local(temp_id: string, row: CachedEventRow): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    const event = this.events.get(temp_id);

    this.event_rows.delete(temp_id);
    this.events.delete(temp_id);
    this.failed_event_ids.delete(temp_id);
    this.event_rows.set(row.id, row);
    if (event) {
      this.events.set(row.id, {
        ...event,
        id: row.id,
        updated_at: row.updated_at,
        created_at: row.created_at,
      });
    } else {
      await this.decode_event(row, true);
      if (!this.is_current(account_id, generation)) return;
    }
    if (account_id) {
      await write_sync_page(account_id, {
        events: [row],
        event_deletes: [temp_id],
      });
    }
    this.notify();
  }

  async upsert_calendar_local(
    row: CachedCalendarRow,
    decrypted?: DecryptedCalendar | null,
    is_own_write = true,
  ): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    const is_same_blob =
      !this.failed_calendar_ids.has(row.id) &&
      same_blob(this.calendar_rows.get(row.id), row);

    this.calendar_rows.set(row.id, row);
    if (decrypted && (is_same_blob || is_temp_row(row.id))) {
      this.calendars.set(row.id, decrypted);
      this.failed_calendar_ids.delete(row.id);
      this.legacy_calendar_ids.delete(row.id);
    } else {
      await this.decode_calendar(row, is_own_write || is_same_blob);
      if (!this.is_current(account_id, generation)) return;
      if (decrypted && this.calendars.has(row.id)) {
        this.calendars.set(row.id, decrypted);
      }
    }
    if (account_id) {
      await write_sync_page(account_id, { calendars: [row] });
    }
    if (!this.is_current(account_id, generation)) return;
    await this.persist_bound_ledger();
    this.notify();
  }

  async remove_calendar_local(id: string): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    this.calendar_rows.delete(id);
    this.calendars.delete(id);
    this.failed_calendar_ids.delete(id);
    this.legacy_calendar_ids.delete(id);
    const event_deletes: string[] = [];

    for (const [event_id, row] of Array.from(this.event_rows)) {
      if (row.calendar_id === id) {
        event_deletes.push(event_id);
        this.event_rows.delete(event_id);
        this.events.delete(event_id);
        this.failed_event_ids.delete(event_id);
        this.legacy_event_ids.delete(event_id);
      }
    }
    if (account_id) {
      await write_sync_page(account_id, {
        calendar_deletes: [id],
        event_deletes,
      });
    }
    if (!this.is_current(account_id, generation)) return;
    await this.persist_bound_ledger();
    this.notify();
  }

  async remap_calendar_local(
    temp_id: string,
    row: CachedCalendarRow,
  ): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    const calendar = this.calendars.get(temp_id);

    this.calendar_rows.delete(temp_id);
    this.calendars.delete(temp_id);
    this.failed_calendar_ids.delete(temp_id);
    this.calendar_rows.set(row.id, row);
    if (calendar) {
      this.calendars.set(row.id, { ...calendar, id: row.id });
    } else {
      await this.decode_calendar(row, true);
      if (!this.is_current(account_id, generation)) return;
    }
    const moved_events: CachedEventRow[] = [];

    for (const [event_id, event_row] of Array.from(this.event_rows)) {
      if (event_row.calendar_id === temp_id) {
        const moved = { ...event_row, calendar_id: row.id };

        moved_events.push(moved);
        this.event_rows.set(event_id, moved);
        const event = this.events.get(event_id);

        if (event) this.events.set(event_id, { ...event, calendar_id: row.id });
      }
    }
    if (account_id) {
      await write_sync_page(account_id, {
        calendars: [row],
        calendar_deletes: [temp_id],
        events: moved_events,
      });
    }
    this.notify();
  }

  async read_server_event(
    row: ServerEventRow,
    allow_older_revision = false,
  ): Promise<DecryptedCalendarEvent | null> {
    const cached = this.to_cached_event(row);

    if (!cached) return null;
    const decoded = await this.decode_server_event(
      cached,
      allow_older_revision,
    );

    if (!decoded) return null;

    return { ...decoded.event, id: cached.id, calendar_id: cached.calendar_id };
  }

  async read_server_calendar(
    row: ServerCalendarRow,
    allow_older_revision = false,
  ): Promise<DecryptedCalendar | null> {
    const cached = this.to_cached_calendar(row);

    if (!cached) return null;
    const decoded = await this.decode_server_calendar(
      cached,
      allow_older_revision,
    );

    if (!decoded) return null;

    return { ...decoded.calendar, id: cached.id };
  }

  private async decode_server_event(
    cached: CachedEventRow,
    allow_older_revision: boolean,
  ) {
    const vault = get_vault_from_memory();

    if (!vault) return null;
    const decoded = await decode_event_row(this.bound_event_row(cached), vault);

    if (!decoded) return null;
    const level = record_level(decoded);

    if (
      (level < 3 && this.v3_event_ids.has(cached.id)) ||
      (level < 2 && this.bound_event_ids.has(cached.id)) ||
      (!allow_older_revision &&
        is_rolled_back("event", this.id_binder(cached.id), decoded.revision))
    ) {
      return null;
    }

    return decoded;
  }

  private async decode_server_calendar(
    cached: CachedCalendarRow,
    allow_older_revision: boolean,
  ) {
    const vault = get_vault_from_memory();

    if (!vault) return null;
    const bound_id = this.id_binder(cached.id);
    const decoded = await decode_calendar_row(
      bound_id === cached.id ? cached : { ...cached, id: bound_id },
      vault,
    );

    if (!decoded) return null;
    const level = record_level(decoded);

    if (
      (level < 3 && this.v3_calendar_ids.has(cached.id)) ||
      (level < 2 && this.bound_calendar_ids.has(cached.id)) ||
      (!allow_older_revision &&
        is_rolled_back("calendar", bound_id, decoded.revision))
    ) {
      return null;
    }

    return decoded;
  }

  async request_full_sync(target: "event" | "calendar"): Promise<void> {
    const account_id = this.account_id;

    if (account_id) {
      await write_sync_page(account_id, {
        meta:
          target === "calendar"
            ? { calendars_cursor: undefined }
            : { events_cursor: undefined },
      });
    }
    this.schedule_pull(0);
  }

  async server_row_revision(
    target: "event" | "calendar",
    row: ServerEventRow | ServerCalendarRow,
  ): Promise<number | null> {
    if (target === "calendar") {
      const cached = this.to_cached_calendar(row as ServerCalendarRow);
      const decoded = cached
        ? await this.decode_server_calendar(cached, true)
        : null;

      return decoded ? decoded.revision : null;
    }

    const cached = this.to_cached_event(row as ServerEventRow);
    const decoded = cached ? await this.decode_server_event(cached, true) : null;

    return decoded ? decoded.revision : null;
  }

  async apply_server_event(
    row: ServerEventRow,
    accept_older_revision = false,
  ): Promise<void> {
    const cached = this.to_cached_event(row);

    if (!cached) return;
    if (accept_older_revision && !is_temp_row(cached.id)) {
      const decoded = await this.decode_server_event(cached, true);

      if (decoded) {
        accept_revision("event", this.id_binder(cached.id), decoded.revision);
      }
    }
    await this.upsert_event_local(cached, null, false);
  }

  async apply_server_calendar(
    row: ServerCalendarRow,
    accept_older_revision = false,
  ): Promise<void> {
    const cached = this.to_cached_calendar(row);

    if (!cached) return;
    if (accept_older_revision && !is_temp_row(cached.id)) {
      const decoded = await this.decode_server_calendar(cached, true);

      if (decoded) {
        accept_revision(
          "calendar",
          this.id_binder(cached.id),
          decoded.revision,
        );
      }
    }
    await this.upsert_calendar_local(cached, null, false);
  }

  async clear_local(): Promise<void> {
    const account_id = this.account_id;

    this.reset_memory();
    this.account_id = null;
    if (account_id) await clear_sync_account(account_id);
    this.notify();
  }

  reset(): void {
    this.reset_memory();
    this.account_id = null;
    this.own_session_id = undefined;
    this.own_session_promise = null;
  }

  notify(): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener();
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      }
    }
  }

  broadcast_cross_tab(): void {
    this.get_change_channel()?.postMessage({ kind: "calendar_changed" });
  }

  private reset_memory(): void {
    this.generation += 1;
    reset_calendar_identity();
    if (this.horizon_timer) {
      clearTimeout(this.horizon_timer);
      this.horizon_timer = null;
    }
    this.loaded = false;
    this.event_rows.clear();
    this.events.clear();
    this.calendar_rows.clear();
    this.calendars.clear();
    this.failed_event_ids.clear();
    this.failed_calendar_ids.clear();
    this.legacy_event_ids.clear();
    this.legacy_calendar_ids.clear();
    this.bound_event_ids.clear();
    this.bound_calendar_ids.clear();
    this.v3_event_ids.clear();
    this.v3_calendar_ids.clear();
    this.bound_ledger_dirty = false;
    this.own_echoes.length = 0;
    reset_revisions();
  }

  private async initial_load_inner(): Promise<void> {
    const account_id = this.account_id;
    const generation = this.generation;

    if (!account_id) return;

    const [event_rows, calendar_rows, meta] = await Promise.all([
      read_cached_events(account_id),
      read_cached_calendars(account_id),
      read_sync_meta(account_id),
    ]);

    if (!this.is_current(account_id, generation)) return;

    for (const id of meta.bound_event_ids ?? []) this.bound_event_ids.add(id);
    for (const id of meta.bound_calendar_ids ?? []) {
      this.bound_calendar_ids.add(id);
    }
    for (const id of meta.v3_event_ids ?? []) this.v3_event_ids.add(id);
    for (const id of meta.v3_calendar_ids ?? []) this.v3_calendar_ids.add(id);
    load_revisions(meta);

    await wait_for_account_key_load(ACCOUNT_KEY_WAIT_MS);
    if (!this.is_current(account_id, generation)) return;

    for (const row of calendar_rows) {
      this.calendar_rows.set(row.id, row);
      await this.decode_calendar(row);
      if (!this.is_current(account_id, generation)) return;
    }
    for (const row of event_rows) {
      this.event_rows.set(row.id, row);
      await this.decode_event(row);
      if (!this.is_current(account_id, generation)) return;
    }

    await this.persist_bound_ledger();
    if (!this.is_current(account_id, generation)) return;
    this.loaded = true;
    this.attach_listeners();
    this.notify();

    await this.pull_delta();
  }

  private async pull_with_retries(): Promise<boolean> {
    if (!this.account_id) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return false;
    }

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const outcome = await this.pull_once();

      if (outcome === "done") return true;
      if (outcome === "stop" || attempt === RETRY_DELAYS_MS.length) {
        return false;
      }

      await delay(RETRY_DELAYS_MS[attempt]);
    }

    return false;
  }

  private async pull_once(): Promise<"done" | "retry" | "stop"> {
    const account_id = this.account_id;

    if (!account_id) return "stop";
    if (!(await confirm_calendar_identity(account_id))) return "stop";
    if (this.account_id !== account_id) return "stop";

    const calendars_outcome = await this.pull_calendars(account_id);

    if (calendars_outcome !== "done") return calendars_outcome;

    return this.pull_events(account_id);
  }

  private async pull_calendars(
    account_id: string,
  ): Promise<"done" | "retry" | "stop"> {
    const generation = this.generation;
    const meta = await read_sync_meta(account_id);

    if (!this.is_current(account_id, generation)) return "stop";
    let cursor = meta.calendars_cursor;
    const full_sync = cursor_expired(cursor);
    const seen = new Set<string>();

    for (let page_index = 0; page_index < MAX_PAGES; page_index += 1) {
      const response = await api_client.get<CalendarsDeltaPage>(
        `${CALENDARS_ENDPOINT}${delta_query(cursor, full_sync && page_index === 0)}`,
        { skip_cache: true },
      );

      if (!this.is_current(account_id, generation)) return "stop";
      if (!response || response.error || !response.data) {
        return this.classify_failure(account_id, response);
      }

      const page = response.data;
      const upserts: CachedCalendarRow[] = [];
      const deletes: string[] = [];

      for (const row of page.calendars ?? []) {
        seen.add(row.id);
        if (this.pending_lookup(row.id)) continue;
        if (row.deleted) {
          const local = this.calendar_rows.get(row.id);

          if (local && (row.version ?? 0) < local.version) continue;
          deletes.push(row.id);
          continue;
        }

        if (is_older_row(row, this.calendar_rows.get(row.id))) continue;

        const cached = this.to_cached_calendar(row);

        if (cached) upserts.push(cached);
      }

      if (full_sync && !page.has_more) {
        for (const id of this.calendar_rows.keys()) {
          if (!seen.has(id) && !this.pending_lookup(id)) deletes.push(id);
        }
      }

      const new_cursor = next_cursor(page);

      await this.apply_calendar_page(account_id, upserts, deletes, new_cursor);

      if (!this.is_current(account_id, generation)) return "stop";
      if (has_rows_past_horizon(page.calendars ?? [], page.server_time)) {
        this.schedule_horizon_pull();
      }
      if (!page.has_more) return "done";
      cursor = new_cursor ?? cursor;
      if (!new_cursor) return "done";
    }

    return "done";
  }

  private async pull_events(
    account_id: string,
  ): Promise<"done" | "retry" | "stop"> {
    const generation = this.generation;
    const meta = await read_sync_meta(account_id);

    if (!this.is_current(account_id, generation)) return "stop";
    let cursor = meta.events_cursor;

    if (cursor_expired(cursor)) {
      return this.pull_all_events(account_id, generation);
    }

    for (let page_index = 0; page_index < MAX_PAGES; page_index += 1) {
      const response = await api_client.get<EventsDeltaPage>(
        `${EVENTS_ENDPOINT}${delta_query(cursor, false)}`,
        { skip_cache: true },
      );

      if (!this.is_current(account_id, generation)) return "stop";
      if (!response || response.error || !response.data) {
        return this.classify_failure(account_id, response);
      }

      const page = response.data;
      const upserts: CachedEventRow[] = [];
      const deletes: string[] = [];

      this.collect_event_rows(page.events ?? [], upserts, deletes);

      const new_cursor = next_cursor(page);

      await this.apply_event_page(account_id, upserts, deletes, new_cursor);

      if (!this.is_current(account_id, generation)) return "stop";
      if (has_rows_past_horizon(page.events ?? [], page.server_time)) {
        this.schedule_horizon_pull();
      }
      if (!page.has_more) return "done";
      cursor = new_cursor ?? cursor;
      if (!new_cursor) return "done";
    }

    return "done";
  }

  private collect_event_rows(
    rows: ServerEventRow[],
    upserts: CachedEventRow[],
    deletes: string[],
    seen?: Set<string>,
  ): void {
    for (const row of rows) {
      seen?.add(row.id);
      if (this.pending_lookup(row.id)) continue;
      if (row.deleted) {
        const local = this.event_rows.get(row.id);

        if (local && (row.version ?? 0) < local.version) continue;
        deletes.push(row.id);
        continue;
      }

      if (is_older_row(row, this.event_rows.get(row.id))) continue;

      const cached = this.to_cached_event(row);

      if (cached) upserts.push(cached);
    }
  }

  private async pull_all_events(
    account_id: string,
    generation: number,
  ): Promise<"done" | "retry" | "stop"> {
    const seen = new Set<string>();
    let page_cursor: string | null = null;
    let snapshot: string | null = null;

    for (
      let page_index = 0;
      page_index < FULL_SYNC_MAX_PAGES;
      page_index += 1
    ) {
      const params = new URLSearchParams({
        limit: String(FULL_SYNC_PAGE_SIZE),
      });

      if (page_cursor) params.set("cursor", page_cursor);
      const response = await api_client.get<EventsDeltaPage>(
        `${EVENTS_ENDPOINT}?${params.toString()}`,
        { skip_cache: true },
      );

      if (!this.is_current(account_id, generation)) return "stop";
      if (!response || response.error || !response.data) {
        return this.classify_failure(account_id, response);
      }

      const page = response.data;

      if (snapshot === null) {
        if (typeof page.server_time !== "string" || !page.server_time) {
          return "retry";
        }
        snapshot = page.server_time;
      }

      const upserts: CachedEventRow[] = [];
      const deletes: string[] = [];

      this.collect_event_rows(page.events ?? [], upserts, deletes, seen);
      const next =
        page.has_more &&
        typeof page.next_cursor === "string" &&
        page.next_cursor.length > 0
          ? page.next_cursor
          : null;

      if (!next) {
        for (const id of this.event_rows.keys()) {
          if (!seen.has(id) && !this.pending_lookup(id)) deletes.push(id);
        }
        await this.apply_event_page(account_id, upserts, deletes, {
          server_time: snapshot,
          cursor_id: null,
        });

        return this.is_current(account_id, generation) ? "done" : "stop";
      }

      await this.apply_event_page(account_id, upserts, deletes, null);
      if (!this.is_current(account_id, generation)) return "stop";
      page_cursor = next;
    }

    return "stop";
  }

  private async classify_failure(
    account_id: string,
    response: ApiResponse<unknown> | undefined,
  ): Promise<"retry" | "stop"> {
    if (is_retryable(response)) return "retry";
    if (response?.status === 400) {
      await write_sync_page(account_id, {
        meta: { events_cursor: undefined, calendars_cursor: undefined },
      });

      return "retry";
    }

    return "stop";
  }

  private async apply_calendar_page(
    account_id: string,
    upserts: CachedCalendarRow[],
    deletes: string[],
    cursor: SyncCursor | null,
  ): Promise<void> {
    if (this.account_id !== account_id) return;
    const generation = this.generation;

    const accepted: CachedCalendarRow[] = [];

    for (const row of upserts) {
      const previous = this.calendar_rows.get(row.id);
      const is_same_blob =
        !this.failed_calendar_ids.has(row.id) && same_blob(previous, row);

      this.calendar_rows.set(row.id, row);
      const outcome = await this.decode_calendar(row, is_same_blob);

      if (!this.is_current(account_id, generation)) return;
      if (outcome !== "rejected" || !previous) accepted.push(row);
    }

    await write_sync_page(account_id, {
      calendars: accepted,
      calendar_deletes: deletes,
      meta: cursor ? { calendars_cursor: cursor } : undefined,
    });
    if (!this.is_current(account_id, generation)) return;
    for (const id of deletes) {
      this.calendar_rows.delete(id);
      this.calendars.delete(id);
      this.failed_calendar_ids.delete(id);
      this.legacy_calendar_ids.delete(id);
    }
    await this.persist_bound_ledger();

    if (upserts.length > 0 || deletes.length > 0) this.notify();
  }

  private async apply_event_page(
    account_id: string,
    upserts: CachedEventRow[],
    deletes: string[],
    cursor: SyncCursor | null,
  ): Promise<void> {
    if (this.account_id !== account_id) return;
    const generation = this.generation;

    const accepted: CachedEventRow[] = [];

    for (const row of upserts) {
      const previous = this.event_rows.get(row.id);
      const is_same_blob =
        !this.failed_event_ids.has(row.id) && same_blob(previous, row);

      this.event_rows.set(row.id, row);
      const outcome = await this.decode_event(row, is_same_blob);

      if (!this.is_current(account_id, generation)) return;
      if (outcome !== "rejected" || !previous) accepted.push(row);
    }

    await write_sync_page(account_id, {
      events: accepted,
      event_deletes: deletes,
      meta: cursor ? { events_cursor: cursor } : undefined,
    });
    if (!this.is_current(account_id, generation)) return;
    for (const id of deletes) {
      this.event_rows.delete(id);
      this.events.delete(id);
      this.failed_event_ids.delete(id);
      this.legacy_event_ids.delete(id);
    }
    await this.persist_bound_ledger();

    if (upserts.length > 0 || deletes.length > 0) this.notify();
  }

  private to_cached_event(row: ServerEventRow): CachedEventRow | null {
    if (
      typeof row.id !== "string" ||
      row.id.length === 0 ||
      typeof row.encrypted_blob !== "string" ||
      typeof row.blob_nonce !== "string" ||
      typeof row.calendar_id !== "string"
    ) {
      return null;
    }

    return {
      id: row.id,
      calendar_id: row.calendar_id,
      encrypted_blob: row.encrypted_blob,
      blob_nonce: row.blob_nonce,
      version: typeof row.version === "number" ? row.version : 0,
      created_at: row.created_at ?? row.updated_at,
      updated_at: row.updated_at,
    };
  }

  private to_cached_calendar(row: ServerCalendarRow): CachedCalendarRow | null {
    if (
      typeof row.encrypted_blob !== "string" ||
      typeof row.blob_nonce !== "string"
    ) {
      return null;
    }

    return {
      id: row.id,
      encrypted_blob: row.encrypted_blob,
      blob_nonce: row.blob_nonce,
      is_visible: row.is_visible !== false,
      is_default: row.is_default === true,
      version: typeof row.version === "number" ? row.version : 0,
      updated_at: row.updated_at,
    };
  }

  private async decode_event(
    row: CachedEventRow,
    is_trusted = false,
  ): Promise<DecodeOutcome> {
    const generation = this.generation;
    const vault = get_vault_from_memory();
    const decoded = vault
      ? await decode_event_row(this.bound_event_row(row), vault)
      : null;

    if (generation !== this.generation) return "failed";
    const level = decoded ? record_level(decoded) : 0;
    const revision_id = this.id_binder(row.id);
    const is_downgraded =
      decoded !== null &&
      !is_trusted &&
      ((level < 3 && (calendar_v3_floor() || this.v3_event_ids.has(row.id))) ||
        (level < 2 && this.bound_event_ids.has(row.id)) ||
        is_rolled_back("event", revision_id, decoded.revision));

    if (!decoded || is_downgraded) {
      this.events.delete(row.id);
      this.legacy_event_ids.delete(row.id);
      this.failed_event_ids.add(row.id);

      return is_downgraded ? "rejected" : "failed";
    }

    this.events.set(row.id, {
      ...decoded.event,
      id: row.id,
      calendar_id: row.calendar_id,
    });
    this.failed_event_ids.delete(row.id);
    if (needs_rewrite(decoded, vault)) {
      this.legacy_event_ids.add(row.id);
    } else {
      this.legacy_event_ids.delete(row.id);
    }
    if (is_temp_row(row.id)) return "accepted";
    observe_revision("event", revision_id, decoded.revision);
    this.record_level(this.bound_event_ids, this.v3_event_ids, row.id, level);

    return "accepted";
  }

  private async decode_calendar(
    row: CachedCalendarRow,
    is_trusted = false,
  ): Promise<DecodeOutcome> {
    const generation = this.generation;
    const vault = get_vault_from_memory();
    const bound_id = this.id_binder(row.id);
    const decoded = vault
      ? await decode_calendar_row(
          bound_id === row.id ? row : { ...row, id: bound_id },
          vault,
        )
      : null;

    if (generation !== this.generation) return "failed";
    const level = decoded ? record_level(decoded) : 0;
    const is_downgraded =
      decoded !== null &&
      !is_trusted &&
      ((level < 3 &&
        (calendar_v3_floor() || this.v3_calendar_ids.has(row.id))) ||
        (level < 2 && this.bound_calendar_ids.has(row.id)) ||
        is_rolled_back("calendar", bound_id, decoded.revision));

    if (!decoded || is_downgraded) {
      this.calendars.delete(row.id);
      this.legacy_calendar_ids.delete(row.id);
      this.failed_calendar_ids.add(row.id);

      return is_downgraded ? "rejected" : "failed";
    }

    this.calendars.set(row.id, { ...decoded.calendar, id: row.id });
    this.failed_calendar_ids.delete(row.id);
    if (needs_rewrite(decoded, vault)) {
      this.legacy_calendar_ids.add(row.id);
    } else {
      this.legacy_calendar_ids.delete(row.id);
    }
    if (is_temp_row(row.id)) return "accepted";
    observe_revision("calendar", bound_id, decoded.revision);
    this.record_level(
      this.bound_calendar_ids,
      this.v3_calendar_ids,
      row.id,
      level,
    );

    return "accepted";
  }

  private record_level(
    bound: Set<string>,
    v3: Set<string>,
    id: string,
    level: number,
  ): void {
    const is_bound = level >= 2;
    const is_v3 = level >= 3;

    if (is_bound !== bound.has(id)) {
      if (is_bound) bound.add(id);
      else bound.delete(id);
      this.bound_ledger_dirty = true;
    }
    if (is_v3 !== v3.has(id)) {
      if (is_v3) v3.add(id);
      else v3.delete(id);
      this.bound_ledger_dirty = true;
    }
  }

  private async persist_bound_ledger(): Promise<void> {
    if (!this.account_id) return;
    const revisions = take_revision_snapshot();

    if (!this.bound_ledger_dirty && !revisions) return;
    const ledger = this.bound_ledger_dirty
      ? {
          bound_event_ids: Array.from(this.bound_event_ids),
          bound_calendar_ids: Array.from(this.bound_calendar_ids),
          v3_event_ids: Array.from(this.v3_event_ids),
          v3_calendar_ids: Array.from(this.v3_calendar_ids),
        }
      : {};

    this.bound_ledger_dirty = false;
    await write_sync_page(this.account_id, {
      meta: { ...ledger, ...revisions },
    });
  }

  private async resolve_own_session_id(): Promise<string | null> {
    if (this.own_session_id !== undefined) return this.own_session_id;
    if (!this.own_session_promise) {
      this.own_session_promise = (async () => {
        try {
          const { list_sessions } = await import("@/services/api/sessions");
          const response = await list_sessions();
          const id = response.data?.current_session_id;

          this.own_session_id = id ? id : null;
        } catch {
          this.own_session_id = null;
        }

        return this.own_session_id;
      })();
    }

    return this.own_session_promise;
  }

  private all_own_echo(ids: readonly string[]): boolean {
    this.prune_echoes();

    return ids.every((id) => this.own_echoes.some((echo) => echo.ids.has(id)));
  }

  private prune_echoes(): void {
    const now = Date.now();

    for (let index = this.own_echoes.length - 1; index >= 0; index -= 1) {
      if (now - this.own_echoes[index].noted_at > OWN_ECHO_WINDOW_MS) {
        this.own_echoes.splice(index, 1);
      }
    }
  }

  private get_change_channel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === "undefined") return null;
    if (!this.change_channel) {
      this.change_channel = new BroadcastChannel(CALENDAR_CHANGE_CHANNEL);
    }

    return this.change_channel;
  }

  private attach_listeners(): void {
    if (this.listeners_attached || typeof window === "undefined") return;
    this.listeners_attached = true;

    window.addEventListener("online", () => this.schedule_pull(0));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.schedule_pull(0);
    });
    this.get_change_channel()?.addEventListener("message", () =>
      this.schedule_pull(),
    );
    on_keys_ready(() => {
      if (this.decrypt_failure_count() > 0) void this.retry_failed_decrypts();
    });
  }
}

export const calendar_sync_engine = new CalendarSyncEngine();

export function subscribe_calendar_sync(listener: SyncListener): () => void {
  return calendar_sync_engine.subscribe(listener);
}

export function handle_calendar_mutation_frame(
  frame: CalendarMutationFrame,
): void {
  void calendar_sync_engine.handle_realtime_frame(frame);
}

export async function reset_calendar_session(): Promise<void> {
  try {
    const { calendar_mutation_queue } =
      await import("@/services/calendar/mutation_queue");

    calendar_mutation_queue.reset();
  } catch {
    return;
  }

  calendar_sync_engine.reset();
  calendar_sync_engine.notify();
}

export async function clear_calendar_sync_state(
  account_id?: string,
): Promise<void> {
  if (account_id && account_id !== calendar_sync_engine.current_account_id()) {
    await clear_sync_account(account_id);

    return;
  }

  try {
    const { calendar_mutation_queue } =
      await import("@/services/calendar/mutation_queue");

    calendar_mutation_queue.reset();
  } catch {
    return;
  }

  await calendar_sync_engine.clear_local();
  calendar_sync_engine.reset();
}
