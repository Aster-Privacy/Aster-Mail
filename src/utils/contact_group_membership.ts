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
import type { DecryptedContact, GroupMembership } from "@/types/contacts";

import { list_group_memberships } from "@/services/api/contacts";

export function build_group_membership_map(
  memberships: GroupMembership[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const membership of memberships) {
    const existing = map.get(membership.contact_id);

    if (existing) {
      existing.push(membership.group_id);

      continue;
    }
    map.set(membership.contact_id, [membership.group_id]);
  }

  return map;
}

export function merge_group_membership(
  contacts: DecryptedContact[],
  map: Map<string, string[]>,
): DecryptedContact[] {
  let changed = false;

  const merged = contacts.map((contact) => {
    const groups = map.get(contact.id) ?? [];
    const current = contact.groups ?? [];

    if (
      current.length === groups.length &&
      current.every((id) => groups.includes(id))
    ) {
      return contact;
    }
    changed = true;

    return { ...contact, groups };
  });

  return changed ? merged : contacts;
}

export async function apply_server_group_membership(
  contacts: DecryptedContact[],
): Promise<DecryptedContact[]> {
  const response = await list_group_memberships();

  if (response.error || !response.data) return contacts;

  return merge_group_membership(
    contacts,
    build_group_membership_map(response.data.memberships),
  );
}
