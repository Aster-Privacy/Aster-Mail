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
  "id" | "emails" | "email_entries" | "avatar_url" | "deleted_at"
>;

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

export const CONTACT_INDEX_TTL_MS = 10 * 60 * 1000;
export const CONTACT_INDEX_RETRY_MS = 30 * 1000;

const INLINE_PHOTO_PATTERN = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i;

let index: Map<string, ContactIndexEntry> | null = null;
let built_at = 0;
let pending: Promise<Map<string, ContactIndexEntry>> | null = null;
let generation = 0;
let last_failure_at = 0;
let listeners_registered = false;

const change_listeners = new Set<() => void>();
const invalidation_handlers = new Set<() => void>();

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

async function fetch_index(): Promise<Map<string, ContactIndexEntry>> {
  await get_contacts_encryption_key();

  const contacts: DecryptedContact[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
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

  return build_contact_email_map(contacts);
}

function register_listeners(): void {
  if (listeners_registered) return;
  listeners_registered = true;

  on_mail_event(MAIL_EVENTS.CONTACTS_CHANGED, () => {
    mark_contact_email_index_stale();
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

function run_invalidation_handlers(): void {
  invalidation_handlers.forEach((handler) => {
    try {
      handler();
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

export function on_contact_index_invalidated(handler: () => void): () => void {
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
  const request = fetch_index()
    .then((next) => {
      if (started_generation !== generation) return index ?? new Map();
      index = next;
      built_at = Date.now();
      last_failure_at = 0;
      notify_change();

      return next;
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

export function mark_contact_email_index_stale(): void {
  generation += 1;
  built_at = 0;
  pending = null;
  last_failure_at = 0;
  run_invalidation_handlers();
  notify_change();
}

export function invalidate_contact_email_index(): void {
  generation += 1;
  index = null;
  built_at = 0;
  pending = null;
  last_failure_at = 0;
  run_invalidation_handlers();
  notify_change();
}

