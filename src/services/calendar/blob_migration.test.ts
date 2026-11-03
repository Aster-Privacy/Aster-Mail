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
import { describe, expect, it } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { CachedEventRow } from "@/services/calendar/sync_store";
import type { CalendarEventDraft } from "@/types/calendar";

import {
  MIGRATION_BATCH_SIZE,
  chunk_operations,
  plan_calendar_migration,
  plan_event_migration,
} from "@/services/calendar/blob_migration";
import {
  decode_calendar_row,
  decode_event_row,
  draft_to_blob,
} from "@/services/calendar/calendar_codec";
import type { CalendarWriteKey } from "@/services/calendar/calendar_crypto";

import {
  CALENDAR_BLOB_FORMAT_V2,
  encrypt_calendar_payload_v2,
} from "@/services/calendar/calendar_crypto";

const vault = { identity_key: "migration-identity-key" } as EncryptedVault;

async function test_key(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("migration-v2-key"),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function write_key(key: CryptoKey): CalendarWriteKey {
  return { format: CALENDAR_BLOB_FORMAT_V2, key };
}

function make_draft(title: string): CalendarEventDraft {
  return {
    calendar_id: "cal-1",
    title,
    description: "",
    location: "",
    starts_at: "2026-10-10T09:00:00.000Z",
    ends_at: "2026-10-10T10:00:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    tags: [],
    reminder_minutes: null,
    color: null,
    availability: "busy",
    visibility: "default",
    event_kind: "default",
    is_completed: false,
    working_location: null,
    conference_url: "",
    guests_can_modify: false,
    guests_can_invite: false,
    guests_can_see_guests: true,
    recurrence: null,
    recurrence_exceptions: [],
  };
}

function make_row(
  id: string,
  blob: { encrypted_blob: string; blob_nonce: string },
  version: number,
): CachedEventRow {
  return {
    id,
    calendar_id: "cal-1",
    encrypted_blob: blob.encrypted_blob,
    blob_nonce: blob.blob_nonce,
    version,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

async function legacy_event_row(index: number): Promise<CachedEventRow> {
  const record = await encrypt_calendar_payload_v2(
    draft_to_blob(make_draft(`Legacy ${index}`)),
    await test_key(),
    { calendar_id: "cal-1", event_id: `evt-${index}` },
  );

  return make_row(
    `evt-${index}`,
    { encrypted_blob: record.ciphertext, blob_nonce: record.nonce },
    index + 1,
  );
}

describe("legacy calendar blob migration", () => {
  it("keeps the original revision so a stale copy stays older than newer edits", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload_v2(
      { ...draft_to_blob(make_draft("Stale")), rev_at: 1_700_000_000_000 },
      key,
      { calendar_id: "cal-1", event_id: "evt-stale" },
    );
    const row = make_row(
      "evt-stale",
      { encrypted_blob: record.ciphertext, blob_nonce: record.nonce },
      1,
    );
    const [operation] = await plan_event_migration(
      [row],
      vault,
      write_key(key),
      [key],
    );
    const decoded = await decode_event_row(
      make_row("evt-stale", operation, 2),
      vault,
      [key],
    );

    expect(decoded?.revision).toBe(1_700_000_000_000);
  });

  it("re-encrypts legacy event rows as bound batch updates", async () => {
    const key = await test_key();
    const rows = await Promise.all([0, 1, 2].map(legacy_event_row));
    const operations = await plan_event_migration(rows, vault, write_key(key), [key]);

    expect(operations).toHaveLength(3);
    operations.forEach((operation, index) => {
      expect(operation.op).toBe("update");
      expect(operation.event_id).toBe(rows[index].id);
      expect(operation.calendar_id).toBe("cal-1");
      expect(operation.expected_version).toBe(rows[index].version);
    });

    const decoded = await decode_event_row(
      make_row("evt-1", operations[1], 2),
      vault,
      [key],
    );

    expect(decoded?.event.title).toBe("Legacy 1");
    expect(decoded?.format).toBe(CALENDAR_BLOB_FORMAT_V2);
    expect(decoded?.bound).toBe(true);
  });

  it("skips rows that cannot be decrypted", async () => {
    const key = await test_key();
    const rows = await Promise.all([0, 1].map(legacy_event_row));
    const broken = { ...rows[0], encrypted_blob: "AAAA" };
    const operations = await plan_event_migration(
      [broken, rows[1]],
      vault,
      write_key(key),
      [key],
    );

    expect(operations.map((operation) => operation.event_id)).toEqual([
      "evt-1",
    ]);
  });

  it("skips a v2 blob that is not bound to its server id", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload_v2(
      draft_to_blob(make_draft("Unbound")),
      key,
      { calendar_id: "cal-1" },
    );
    const row = make_row(
      "evt-7",
      { encrypted_blob: record.ciphertext, blob_nonce: record.nonce },
      1,
    );
    const before = await decode_event_row(row, vault, [key]);
    const operations = await plan_event_migration(
      [row],
      vault,
      write_key(key),
      [key],
    );

    expect(before).toBeNull();
    expect(operations).toEqual([]);
  });

  it("re-encrypts legacy calendar rows as calendar updates", async () => {
    const key = await test_key();
    const record = await encrypt_calendar_payload_v2(
      { name: "Work", color: "#1a73e8" },
      key,
      { calendar_id: "cal-1" },
    );
    const row = {
      id: "cal-1",
      encrypted_blob: record.ciphertext,
      blob_nonce: record.nonce,
      is_visible: true,
      is_default: true,
      version: 4,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    };
    const [operation] = await plan_calendar_migration(
      [row],
      vault,
      write_key(key),
      [key],
    );
    const decoded = await decode_calendar_row(
      {
        ...row,
        encrypted_blob: operation.encrypted_blob,
        blob_nonce: operation.blob_nonce,
      },
      vault,
      [key],
    );

    expect(operation.kind).toBe("calendar_update");
    expect(operation.expected_version).toBe(4);
    expect(decoded?.calendar.name).toBe("Work");
    expect(decoded?.bound).toBe(true);
  });

  it("chunks operations to the batch endpoint limit", () => {
    const items = Array.from({ length: 120 }, (_, index) => index);
    const chunks = chunk_operations(items, MIGRATION_BATCH_SIZE);

    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
    expect(MIGRATION_BATCH_SIZE).toBe(50);
  });
});
