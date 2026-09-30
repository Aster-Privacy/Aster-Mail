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
import { on_vault_cleared } from "@/services/crypto/memory_key_store";

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

export const SUGGESTION_POOL_TTL_MS = 5 * 60 * 1000;

let pool: DecryptedContact[] | null = null;
let built_at = 0;
let pending: Promise<DecryptedContact[]> | null = null;
let generation = 0;
let listeners_registered = false;

const change_listeners = new Set<() => void>();

async function fetch_pool(): Promise<DecryptedContact[]> {
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

    const decrypted = await decrypt_contacts(result.data.items ?? []);

    contacts.push(...decrypted.filter((item) => !is_contact_trashed(item)));

    if (!result.data.has_more || !result.data.next_cursor) break;
    cursor = result.data.next_cursor;
  }

  return contacts;
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

function register_listeners(): void {
  if (listeners_registered) return;
  listeners_registered = true;

  on_mail_event(MAIL_EVENTS.CONTACTS_CHANGED, () => {
    mark_suggestion_pool_stale();
  });

  on_vault_cleared(() => {
    invalidate_suggestion_pool();
  });
}

export function subscribe_suggestion_pool(listener: () => void): () => void {
  register_listeners();
  change_listeners.add(listener);

  return () => {
    change_listeners.delete(listener);
  };
}

export function get_cached_suggestion_pool(): DecryptedContact[] | null {
  return pool;
}

export function load_suggestion_pool(): Promise<DecryptedContact[]> {
  register_listeners();

  if (pool && built_at > 0 && Date.now() - built_at < SUGGESTION_POOL_TTL_MS) {
    return Promise.resolve(pool);
  }
  if (pending) return pending;

  const started_generation = generation;
  const request = fetch_pool()
    .then((next) => {
      if (started_generation !== generation) return pool ?? [];
      pool = next;
      built_at = Date.now();

      return next;
    })
    .catch(() => pool ?? [])
    .finally(() => {
      if (pending === request) pending = null;
    });

  pending = request;

  return request;
}

export function mark_suggestion_pool_stale(): void {
  generation += 1;
  built_at = 0;
  pending = null;
  notify_change();
}

export function invalidate_suggestion_pool(): void {
  generation += 1;
  pool = null;
  built_at = 0;
  pending = null;
  notify_change();
}
