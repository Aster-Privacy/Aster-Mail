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
import type { ContactGroup, DecryptedContact } from "@/types/contacts";

export const GROUP_VIEW_PARAM = "group_view";

export function contact_display_name(contact: DecryptedContact): string {
  return (
    `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
    contact.emails[0] ||
    ""
  );
}

function compare_contacts(a: DecryptedContact, b: DecryptedContact): number {
  const by_name = contact_display_name(a).localeCompare(
    contact_display_name(b),
    undefined,
    { sensitivity: "base" },
  );

  return by_name !== 0 ? by_name : a.id.localeCompare(b.id);
}

export function group_member_counts(
  contacts: DecryptedContact[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const contact of contacts) {
    for (const group_id of new Set(contact.groups ?? [])) {
      counts.set(group_id, (counts.get(group_id) ?? 0) + 1);
    }
  }

  return counts;
}

export function group_member_count(
  group: ContactGroup,
  counts: Map<string, number>,
  contacts_ready: boolean,
): number {
  return contacts_ready
    ? (counts.get(group.id) ?? 0)
    : (group.contact_count ?? 0);
}

export function group_members(
  contacts: DecryptedContact[],
  group_id: string,
): DecryptedContact[] {
  return contacts
    .filter((contact) => (contact.groups ?? []).includes(group_id))
    .sort(compare_contacts);
}

export function group_add_candidates(
  contacts: DecryptedContact[],
  group_id: string,
  query: string,
): DecryptedContact[] {
  const needle = query.trim().toLowerCase();

  return contacts
    .filter((contact) => !(contact.groups ?? []).includes(group_id))
    .filter(
      (contact) =>
        !needle ||
        contact_display_name(contact).toLowerCase().includes(needle) ||
        contact.emails.some((email) => email.toLowerCase().includes(needle)),
    )
    .sort(compare_contacts);
}

export function group_member_emails(members: DecryptedContact[]): string {
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const contact of members) {
    const email = contact.emails[0]?.trim();

    if (!email) continue;
    const key = email.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }

  return emails.join(", ");
}
