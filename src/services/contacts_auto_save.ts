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
import {
  create_contact_encrypted,
  search_contacts,
} from "@/services/api/contacts";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const in_flight = new Set<string>();

function name_parts_from_email(email: string): {
  first_name: string;
  last_name: string;
} {
  const parts = email.split("@")[0].split(".");

  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || "",
  };
}

export async function auto_save_recipients_to_contacts(
  recipient_emails: string[],
  options: {
    known_emails?: Set<string>;
    own_addresses?: string[];
  } = {},
): Promise<void> {
  const own = new Set(
    (options.own_addresses ?? []).map((a) => a.toLowerCase().trim()),
  );
  const known = options.known_emails ?? new Set<string>();
  const unique = [
    ...new Set(
      recipient_emails
        .map((e) => e.toLowerCase().trim())
        .filter((e) => EMAIL_SHAPE.test(e)),
    ),
  ];

  for (const email of unique) {
    if (own.has(email)) continue;
    if (known.has(email)) continue;
    if (in_flight.has(email)) continue;
    in_flight.add(email);
    try {
      const existing = await search_contacts(email, "email", 1);

      if (existing.error || !existing.data) continue;

      if (existing.data.items?.length) continue;

      await create_contact_encrypted({
        ...name_parts_from_email(email),
        emails: [email],
        is_favorite: false,
      });
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      in_flight.delete(email);
    }
  }
}
