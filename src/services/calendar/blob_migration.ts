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
import type { CalendarWriteKey } from "@/services/calendar/calendar_crypto";
import type {
  CachedCalendarRow,
  CachedEventRow,
} from "@/services/calendar/sync_store";
import type {
  QueuedBatchUpdate,
  QueuedCalendarUpdate,
} from "@/services/calendar/mutation_queue";

import {
  decode_calendar_row,
  decode_event_row,
  encrypt_calendar_blob,
  encrypt_event_draft,
  event_to_draft,
} from "@/services/calendar/calendar_codec";
import {
  CALENDAR_BLOB_FORMAT_V3,
  calendar_write_key,
} from "@/services/calendar/calendar_crypto";
import { calendar_mutation_queue } from "@/services/calendar/mutation_queue";
import { calendar_sync_engine } from "@/services/calendar/sync_engine";
import { is_temp_event_id } from "@/services/calendar/temp_id";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";

export const MIGRATION_BATCH_SIZE = 50;
export const MIGRATION_RERUN_INTERVAL_MS = 60_000;

let migrated_account: string | null = null;
let migrated_at_ms = 0;
let migration_promise: Promise<number> | null = null;

export async function plan_event_migration(
  rows: CachedEventRow[],
  vault: EncryptedVault,
  key: CalendarWriteKey,
  keys?: CryptoKey[],
): Promise<QueuedBatchUpdate[]> {
  const operations: QueuedBatchUpdate[] = [];

  for (const row of rows) {
    const decoded = await decode_event_row(row, vault, keys);

    if (!decoded) continue;

    const encrypted = await encrypt_event_draft(
      event_to_draft(decoded.event),
      vault,
      row.id,
      key,
      decoded.revision,
    );

    operations.push({
      op: "update",
      event_id: row.id,
      calendar_id: row.calendar_id,
      encrypted_blob: encrypted.encrypted_blob,
      blob_nonce: encrypted.blob_nonce,
      expected_version: row.version,
    });
  }

  return operations;
}

export async function plan_calendar_migration(
  rows: CachedCalendarRow[],
  vault: EncryptedVault,
  key: CalendarWriteKey,
  keys?: CryptoKey[],
): Promise<QueuedCalendarUpdate[]> {
  const operations: QueuedCalendarUpdate[] = [];

  for (const row of rows) {
    const decoded = await decode_calendar_row(row, vault, keys);

    if (!decoded) continue;

    const encrypted = await encrypt_calendar_blob(
      {
        name: decoded.calendar.name,
        color: decoded.calendar.color,
        icon: decoded.calendar.icon,
      },
      vault,
      row.id,
      key,
      decoded.revision,
    );

    operations.push({
      kind: "calendar_update",
      calendar_id: row.id,
      encrypted_blob: encrypted.encrypted_blob,
      blob_nonce: encrypted.blob_nonce,
      expected_version: row.version,
    });
  }

  return operations;
}

export function chunk_operations<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function is_server_row(id: string): boolean {
  return !is_temp_event_id(id);
}

async function run_migration(account_id: string): Promise<number> {
  const vault = get_vault_from_memory();
  const key = vault ? await calendar_write_key(vault) : null;

  if (!vault || !key) {
    migrated_account = null;

    return 0;
  }

  const event_rows = calendar_sync_engine
    .legacy_event_rows()
    .filter((row) => is_server_row(row.id));
  const calendar_rows = calendar_sync_engine
    .legacy_calendar_rows()
    .filter((row) => is_server_row(row.id));

  if (event_rows.length === 0 && calendar_rows.length === 0) return 0;

  let migrated = 0;

  for (const operation of await plan_calendar_migration(
    calendar_rows,
    vault,
    key,
  )) {
    if (calendar_sync_engine.current_account_id() !== account_id) break;
    await calendar_mutation_queue.submit(operation);
    migrated += 1;
  }

  const operations = await plan_event_migration(event_rows, vault, key);

  for (const chunk of chunk_operations(operations, MIGRATION_BATCH_SIZE)) {
    if (calendar_sync_engine.current_account_id() !== account_id) break;
    await calendar_mutation_queue.submit({
      kind: "event_batch",
      operations: chunk,
    });
    migrated += chunk.length;
  }

  return migrated;
}

export async function calendar_store_fully_v3(): Promise<boolean> {
  const vault = get_vault_from_memory();

  if (
    !vault ||
    !calendar_sync_engine.is_loaded() ||
    calendar_sync_engine.decrypt_failure_count() > 0 ||
    calendar_sync_engine.legacy_event_rows().length > 0 ||
    calendar_sync_engine.legacy_calendar_rows().length > 0
  ) {
    return false;
  }

  const key = await calendar_write_key(vault);

  return key?.format === CALENDAR_BLOB_FORMAT_V3;
}

export function migrate_legacy_calendar_blobs(): Promise<number> {
  const account_id = calendar_sync_engine.current_account_id();

  if (!account_id) return migration_promise ?? Promise.resolve(0);
  if (migration_promise) return migration_promise;

  const now_ms = Date.now();

  if (
    migrated_account === account_id &&
    now_ms - migrated_at_ms < MIGRATION_RERUN_INTERVAL_MS
  ) {
    return Promise.resolve(0);
  }

  migrated_account = account_id;
  migrated_at_ms = now_ms;
  migration_promise = run_migration(account_id)
    .catch(() => {
      migrated_account = null;

      return 0;
    })
    .finally(() => {
      migration_promise = null;
    });

  return migration_promise;
}

export function reset_blob_migration_state(): void {
  migrated_account = null;
  migrated_at_ms = 0;
  migration_promise = null;
}
