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
import type { DecryptedContact, ContactFormData } from "@/types/contacts";

export type SortOption = "name_asc" | "name_desc" | "company" | "recent";
export type FilterOption =
  | "all"
  | "favorites"
  | "has_email"
  | "has_phone"
  | "has_company"
  | "upcoming_birthdays";
export type ViewMode = "list" | "compact";

export const BATCH_SIZE = 10;

export function reconcile_entry_fields(form: ContactFormData): ContactFormData {
  const next: ContactFormData = { ...form };
  const email_entries = form.email_entries;

  if (email_entries) {
    next.email_entries = form.emails.map((value, index) => ({
      value,
      type:
        email_entries.find((entry) => entry.value === value)?.type ??
        email_entries[index]?.type ??
        "other",
    }));
  }

  const phone_entries = form.phone_entries;

  if (phone_entries) {
    const phone = (form.phone ?? "").trim();
    const rest = phone_entries.slice(1);

    next.phone_entries = phone
      ? [{ value: phone, type: phone_entries[0]?.type ?? "mobile" }, ...rest]
      : rest;
  }

  const address_entries = form.address_entries;

  if (address_entries && form.address) {
    next.address_entries = [
      { ...form.address, type: address_entries[0]?.type ?? "home" },
      ...address_entries.slice(1),
    ];
  }

  return next;
}

export function contact_to_form_data(
  contact: DecryptedContact,
): ContactFormData {
  const {
    id: _id,
    created_at: _created_at,
    updated_at: _updated_at,
    last_contacted: _last_contacted,
    email_count: _email_count,
    ...rest
  } = contact;

  void _id;
  void _created_at;
  void _updated_at;
  void _last_contacted;
  void _email_count;

  return rest;
}
