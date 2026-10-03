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
import type { DecryptedContact } from "@/types/contacts";

import {
  list_contacts,
  decrypt_contacts,
  get_contacts_encryption_key,
} from "@/services/api/contacts";
import { is_contact_trashed } from "@/lib/contact_trash";
import { on_mail_event, MAIL_EVENTS } from "@/hooks/mail_events";
import {
  on_keys_ready,
  on_vault_cleared,
} from "@/services/crypto/memory_key_store";

export interface ContactIndexEntry {
  contact_id: string;
  inline_photo?: string;
}

type ContactIndexContact = Pick<
  DecryptedContact,
  "id" | "emails" | "email_entries" | "avatar_url" | "deleted_at" | "updated_at"
>;

interface ContactIndexBuild {
  entries: Map<string, ContactIndexEntry>;
  versions: Map<string, string>;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export const CONTACT_INDEX_TTL_MS = 10 * 60 * 1000;
export const CONTACT_INDEX_RETRY_MS = 30 * 1000;
export const CONTACT_INDEX_STALE_DEBOUNCE_MS = 1500;

const INLINE_PHOTO_PATTERN = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i;

let index: Map<string, ContactIndexEntry> | null = null;
let versions: Map<string, string> | null = null;
let built_at = 0;
let pending: Promise<Map<string, ContactIndexEntry>> | null = null;
let generation = 0;
let last_failure_at = 0;
let listeners_registered = false;
let stale_timer: ReturnType<typeof setTimeout> | null = null;

const change_listeners = new Set<() => void>();
const invalidation_handlers = new Set<
  (changed_ids: ReadonlySet<string> | null) => void
>();

export function normalize_contact_email(value: string): string {
  let email = value.trim();
  const bracket = email.match(/<([^<>]+)>/);

  if (bracket) email = bracket[1];
  email = email.trim().replace(/^mailto:/i, "");

  return email.toLowerCase();
}

export function collect_contact_emails(
  contact: Pick<ContactIndexContact, "emails" | "email_entries">,
): string[] {
  const values: unknown[] = [
    ...(Array.isArray(contact.emails) ? contact.emails : []),
    ...(Array.isArray(contact.email_entries)
      ? contact.email_entries.map((entry) => entry?.value)
      : []),
  ];
  const result = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalize_contact_email(value);

    if (normalized.includes("@")) result.add(normalized);
  }

  return [...result];
}

export function pick_inline_photo(avatar_url: unknown): string | undefined {
  if (typeof avatar_url !== "string") return undefined;
  const trimmed = avatar_url.trim();

  return INLINE_PHOTO_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function build_contact_email_map(
  contacts: ContactIndexContact[],
): Map<string, ContactIndexEntry> {
  const next = new Map<string, ContactIndexEntry>();

  for (const contact of contacts) {
    if (is_contact_trashed(contact)) continue;
    const inline_photo = pick_inline_photo(contact.avatar_url);
    const entry: ContactIndexEntry = inline_photo
      ? { contact_id: contact.id, inline_photo }
      : { contact_id: contact.id };

    for (const address of collect_contact_emails(contact)) {
      const existing = next.get(address);

      if (!existing || (!existing.inline_photo && entry.inline_photo)) {
        next.set(address, entry);
      }
    }
  }

  return next;
}

function build_contact_versions(
  contacts: ContactIndexContact[],
): Map<string, string> {
  const next = new Map<string, string>();

  for (const contact of contacts) {
    if (is_contact_trashed(contact)) continue;
    next.set(contact.id, contact.updated_at || "");
  }

  return next;
}

function find_changed_contacts(
  previous: Map<string, string>,
  next: Map<string, string>,
): Set<string> {
  const changed = new Set<string>();

  for (const [contact_id, version] of previous) {
    if (!version || next.get(contact_id) !== version) changed.add(contact_id);
  }

  return changed;
}

async function fetch_index(
  started_generation: number,
): Promise<ContactIndexBuild> {
  await get_contacts_encryption_key();

  const contacts: DecryptedContact[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (started_generation !== generation) {
      throw new Error("contacts changed");
    }

    const result = await list_contacts({
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    if (result.error || !result.data) {
      throw new Error(result.error || "contacts unavailable");
    }

    contacts.push(...(await decrypt_contacts(result.data.items ?? [])));

    if (!result.data.has_more || !result.data.next_cursor) break;
    cursor = result.data.next_cursor;
  }

  return {
    entries: build_contact_email_map(contacts),
    versions: build_contact_versions(contacts),
  };
}

function register_listeners(): void {
  if (listeners_registered) return;
  listeners_registered = true;

  on_mail_event(MAIL_EVENTS.CONTACTS_CHANGED, () => {
    schedule_stale_mark();
  });

  on_vault_cleared(() => {
    invalidate_contact_email_index();
  });

  on_keys_ready(() => {
    if (!last_failure_at) return;
    last_failure_at = 0;
    notify_change();
  });
}

function notify_change(): void {
  change_listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      return;
    }
  });
}

function run_invalidation_handlers(
  changed_ids: ReadonlySet<string> | null,
): void {
  invalidation_handlers.forEach((handler) => {
    try {
      handler(changed_ids);
    } catch {
      return;
    }
  });
}

export function subscribe_contact_index(listener: () => void): () => void {
  register_listeners();
  change_listeners.add(listener);

  return () => {
    change_listeners.delete(listener);
  };
}

export function on_contact_index_invalidated(
  handler: (changed_ids: ReadonlySet<string> | null) => void,
): () => void {
  invalidation_handlers.add(handler);

  return () => {
    invalidation_handlers.delete(handler);
  };
}

export function is_contact_index_fresh(now: number = Date.now()): boolean {
  return index !== null && built_at > 0 && now - built_at < CONTACT_INDEX_TTL_MS;
}

export function get_cached_contact_entry(
  email: string,
): ContactIndexEntry | null | undefined {
  if (!index) return undefined;

  return index.get(normalize_contact_email(email)) ?? null;
}

export function get_cached_contact_id(
  email: string,
): string | null | undefined {
  const entry = get_cached_contact_entry(email);

  if (entry === undefined) return undefined;

  return entry?.contact_id ?? null;
}

export function ensure_contact_email_index(): Promise<
  Map<string, ContactIndexEntry>
> {
  register_listeners();
  const now = Date.now();

  if (index && is_contact_index_fresh(now)) return Promise.resolve(index);
  if (pending) return pending;
  if (last_failure_at && now - last_failure_at < CONTACT_INDEX_RETRY_MS) {
    return Promise.resolve(index ?? new Map());
  }

  const started_generation = generation;
  const request = fetch_index(started_generation)
    .then((next) => {
      if (started_generation !== generation) return index ?? new Map();
      const changed = versions
        ? find_changed_contacts(versions, next.versions)
        : null;

      index = next.entries;
      versions = next.versions;
      built_at = Date.now();
      last_failure_at = 0;
      if (changed && changed.size > 0) run_invalidation_handlers(changed);
      notify_change();

      return next.entries;
    })
    .catch(() => {
      if (started_generation === generation) last_failure_at = Date.now();

      return index ?? new Map<string, ContactIndexEntry>();
    })
    .finally(() => {
      if (pending === request) pending = null;
    });

  pending = request;

  return request;
}

function clear_stale_timer(): void {
  if (stale_timer === null) return;
  clearTimeout(stale_timer);
  stale_timer = null;
}

function schedule_stale_mark(): void {
  clear_stale_timer();
  stale_timer = setTimeout(() => {
    stale_timer = null;
    mark_contact_email_index_stale();
  }, CONTACT_INDEX_STALE_DEBOUNCE_MS);
}

export function mark_contact_email_index_stale(): void {
  clear_stale_timer();
  generation += 1;
  built_at = 0;
  pending = null;
  last_failure_at = 0;
  notify_change();
}

export function invalidate_contact_email_index(): void {
  clear_stale_timer();
  generation += 1;
  index = null;
  versions = null;
  built_at = 0;
  pending = null;
  last_failure_at = 0;
  run_invalidation_handlers(null);
  notify_change();
}

