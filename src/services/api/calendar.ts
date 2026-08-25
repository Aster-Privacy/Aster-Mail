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
  DecryptedCalendar,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import {
  decrypt_calendar_payload,
  encrypt_calendar_payload,
} from "@/services/calendar/calendar_crypto";

const EVENTS_STORAGE_KEY = "aster_calendar_events_v1";
const CALENDARS_STORAGE_KEY = "aster_calendar_calendars_v1";
const CHANGE_CHANNEL_NAME = "aster_calendar_changes";

interface EncryptedRow {
  id: string;
  ciphertext: string;
  nonce: string;
}

const DEFAULT_CALENDARS: DecryptedCalendar[] = [
  {
    id: "personal",
    name: "Personal",
    color: "#6366f1",
    is_visible: true,
    is_default: true,
  },
  {
    id: "work",
    name: "Work",
    color: "#0ea5e9",
    is_visible: true,
    is_default: false,
  },
  {
    id: "family",
    name: "Family",
    color: "#10b981",
    is_visible: true,
    is_default: false,
  },
];

let change_channel: BroadcastChannel | null = null;

function get_change_channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!change_channel) {
    change_channel = new BroadcastChannel(CHANGE_CHANNEL_NAME);
  }

  return change_channel;
}

export function subscribe_calendar_changes(on_change: () => void): () => void {
  const channel = get_change_channel();

  const handle_message = () => {
    on_change();
  };

  const handle_storage = (event: StorageEvent) => {
    if (
      event.key === EVENTS_STORAGE_KEY ||
      event.key === CALENDARS_STORAGE_KEY
    ) {
      on_change();
    }
  };

  channel?.addEventListener("message", handle_message);
  window.addEventListener("storage", handle_storage);

  return () => {
    channel?.removeEventListener("message", handle_message);
    window.removeEventListener("storage", handle_storage);
  };
}

function broadcast_change(): void {
  get_change_channel()?.postMessage({ kind: "calendar_changed" });
  window.dispatchEvent(new CustomEvent("aster-calendar-changed"));
}

function read_rows(storage_key: string): EncryptedRow[] {
  try {
    const raw = localStorage.getItem(storage_key);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write_rows(storage_key: string, rows: EncryptedRow[]): void {
  try {
    localStorage.setItem(storage_key, JSON.stringify(rows));
  } catch {
    return;
  }

  broadcast_change();
}

async function encrypt_row<T extends { id: string }>(
  record: T,
  vault: EncryptedVault,
): Promise<EncryptedRow> {
  const encrypted = await encrypt_calendar_payload(record, vault);

  return { id: record.id, ...encrypted };
}

async function decrypt_rows<T>(
  rows: EncryptedRow[],
  vault: EncryptedVault,
): Promise<T[]> {
  const results: T[] = [];

  for (const row of rows) {
    try {
      results.push(await decrypt_calendar_payload<T>(row, vault));
    } catch {
      continue;
    }
  }

  return results;
}

function iso_at(day_offset: number, hour: number, minute: number): string {
  const date = new Date();

  date.setDate(date.getDate() + day_offset);
  date.setHours(hour, minute, 0, 0);

  return date.toISOString();
}

function build_seed_events(): DecryptedCalendarEvent[] {
  const now = new Date().toISOString();

  const seeds: Array<{
    calendar_id: string;
    title: string;
    location: string;
    description: string;
    day_offset: number;
    start_hour: number;
    start_minute: number;
    duration_minutes: number;
    is_all_day?: boolean;
  }> = [
    {
      calendar_id: "work",
      title: "Standup",
      location: "Jitsi",
      description: "",
      day_offset: 0,
      start_hour: 9,
      start_minute: 30,
      duration_minutes: 15,
    },
    {
      calendar_id: "work",
      title: "Infra review",
      location: "Meeting room 2",
      description: "Postgres backups and PgBouncer cutover.",
      day_offset: 0,
      start_hour: 11,
      start_minute: 0,
      duration_minutes: 60,
    },
    {
      calendar_id: "personal",
      title: "Lunch with Sam",
      location: "Cafe Nero",
      description: "",
      day_offset: 0,
      start_hour: 13,
      start_minute: 0,
      duration_minutes: 90,
    },
    {
      calendar_id: "work",
      title: "Release cut",
      location: "",
      description: "Desktop and Android release.",
      day_offset: 1,
      start_hour: 15,
      start_minute: 0,
      duration_minutes: 45,
    },
    {
      calendar_id: "family",
      title: "Parents visiting",
      location: "",
      description: "",
      day_offset: 2,
      start_hour: 0,
      start_minute: 0,
      duration_minutes: 24 * 60,
      is_all_day: true,
    },
    {
      calendar_id: "personal",
      title: "Dentist",
      location: "Clinic",
      description: "",
      day_offset: 3,
      start_hour: 8,
      start_minute: 45,
      duration_minutes: 45,
    },
    {
      calendar_id: "work",
      title: "Security audit sync",
      location: "Jitsi",
      description: "Findings triage.",
      day_offset: 4,
      start_hour: 16,
      start_minute: 30,
      duration_minutes: 60,
    },
    {
      calendar_id: "personal",
      title: "Gym",
      location: "",
      description: "",
      day_offset: -1,
      start_hour: 18,
      start_minute: 0,
      duration_minutes: 60,
    },
    {
      calendar_id: "work",
      title: "Roadmap planning",
      location: "Meeting room 1",
      description: "Calendar product scoping.",
      day_offset: 6,
      start_hour: 10,
      start_minute: 0,
      duration_minutes: 120,
    },
  ];

  return seeds.map((seed, index) => {
    const starts_at = iso_at(
      seed.day_offset,
      seed.start_hour,
      seed.start_minute,
    );
    const ends_at = new Date(
      new Date(starts_at).getTime() + seed.duration_minutes * 60_000,
    ).toISOString();

    return {
      id: `seed_${index}`,
      calendar_id: seed.calendar_id,
      title: seed.title,
      description: seed.description,
      location: seed.location,
      starts_at,
      ends_at,
      is_all_day: !!seed.is_all_day,
      status: "confirmed",
      attendees: [],
      reminder_minutes: 10,
      created_at: now,
      updated_at: now,
    };
  });
}

async function ensure_seeded(vault: EncryptedVault): Promise<void> {
  if (localStorage.getItem(CALENDARS_STORAGE_KEY) === null) {
    const rows = await Promise.all(
      DEFAULT_CALENDARS.map((calendar) => encrypt_row(calendar, vault)),
    );

    localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(rows));
  }

  if (localStorage.getItem(EVENTS_STORAGE_KEY) === null) {
    const rows = await Promise.all(
      build_seed_events().map((event) => encrypt_row(event, vault)),
    );

    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(rows));
  }
}

async function read_events(
  vault: EncryptedVault,
): Promise<DecryptedCalendarEvent[]> {
  await ensure_seeded(vault);

  return decrypt_rows<DecryptedCalendarEvent>(
    read_rows(EVENTS_STORAGE_KEY),
    vault,
  );
}

export async function list_calendars(
  vault: EncryptedVault,
): Promise<{ data: DecryptedCalendar[] }> {
  await ensure_seeded(vault);

  const data = await decrypt_rows<DecryptedCalendar>(
    read_rows(CALENDARS_STORAGE_KEY),
    vault,
  );

  return { data: data.length ? data : DEFAULT_CALENDARS };
}

export async function set_calendar_visibility(
  calendar_id: string,
  is_visible: boolean,
  vault: EncryptedVault,
): Promise<void> {
  const { data } = await list_calendars(vault);
  const next = data.map((calendar) =>
    calendar.id === calendar_id ? { ...calendar, is_visible } : calendar,
  );
  const rows = await Promise.all(
    next.map((calendar) => encrypt_row(calendar, vault)),
  );

  write_rows(CALENDARS_STORAGE_KEY, rows);
}

export async function list_events(
  range_start: Date,
  range_end: Date,
  vault: EncryptedVault,
): Promise<{ data: DecryptedCalendarEvent[] }> {
  const start_ms = range_start.getTime();
  const end_ms = range_end.getTime();

  const events = (await read_events(vault)).filter((event) => {
    const event_start = new Date(event.starts_at).getTime();
    const event_end = new Date(event.ends_at).getTime();

    return event_end >= start_ms && event_start <= end_ms;
  });

  return { data: events };
}

export async function create_event(
  draft: CalendarEventDraft,
  vault: EncryptedVault,
): Promise<{ data: DecryptedCalendarEvent }> {
  const now = new Date().toISOString();
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  const event: DecryptedCalendarEvent = {
    ...draft,
    id: `evt_${Date.now().toString(36)}_${suffix}`,
    status: "confirmed",
    attendees: [],
    created_at: now,
    updated_at: now,
  };

  const rows = read_rows(EVENTS_STORAGE_KEY);

  rows.push(await encrypt_row(event, vault));
  write_rows(EVENTS_STORAGE_KEY, rows);

  return { data: event };
}

export async function update_event(
  event_id: string,
  draft: CalendarEventDraft,
  vault: EncryptedVault,
): Promise<{ data: DecryptedCalendarEvent | null }> {
  const events = await read_events(vault);
  const existing = events.find((event) => event.id === event_id);

  if (!existing) {
    return { data: null };
  }

  const updated: DecryptedCalendarEvent = {
    ...existing,
    ...draft,
    updated_at: new Date().toISOString(),
  };

  const rows = await Promise.all(
    events
      .map((event) => (event.id === event_id ? updated : event))
      .map((event) => encrypt_row(event, vault)),
  );

  write_rows(EVENTS_STORAGE_KEY, rows);

  return { data: updated };
}

export async function delete_event(event_id: string): Promise<void> {
  const rows = read_rows(EVENTS_STORAGE_KEY).filter(
    (row) => row.id !== event_id,
  );

  write_rows(EVENTS_STORAGE_KEY, rows);
}
