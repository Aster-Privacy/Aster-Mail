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
import { list_contacts, decrypt_contact } from "@/services/api/contacts";
import { on_mail_event, MAIL_EVENTS } from "@/hooks/mail_events";

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

let index: Map<string, string> | null = null;
let pending: Promise<Map<string, string>> | null = null;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

async function build_index(): Promise<Map<string, string>> {
  const next: Map<string, string> = new Map();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await list_contacts({
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    const items = result.data?.items ?? [];

    for (const contact of items) {
      try {
        const decrypted = await decrypt_contact(contact);

        for (const address of decrypted.emails) {
          if (address) next.set(normalize(address), contact.id);
        }
      } catch {
        continue;
      }
    }

    if (!result.data?.has_more || !result.data.next_cursor) break;
    cursor = result.data.next_cursor;
  }

  return next;
}

export function get_cached_contact_id(
  email: string,
): string | null | undefined {
  if (!index) return undefined;

  return index.get(normalize(email)) ?? null;
}

export function ensure_contact_email_index(): Promise<Map<string, string>> {
  if (index) return Promise.resolve(index);
  if (pending) return pending;

  pending = build_index()
    .then((next) => {
      index = next;

      return next;
    })
    .catch(() => new Map<string, string>())
    .finally(() => {
      pending = null;
    });

  return pending;
}

export function invalidate_contact_email_index(): void {
  index = null;
}

on_mail_event(MAIL_EVENTS.CONTACTS_CHANGED, () => {
  invalidate_contact_email_index();
});
