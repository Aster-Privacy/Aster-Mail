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
import type {
  Address,
  AddressEntry,
  ContactFormData,
  DecryptedContact,
  EmailEntry,
  PhoneEntry,
} from "@/types/contacts";

export type SortOption =
  | "name_asc"
  | "name_desc"
  | "last_name_asc"
  | "last_name_desc"
  | "company"
  | "recent";
export type FilterOption =
  | "all"
  | "favorites"
  | "has_email"
  | "has_phone"
  | "has_company"
  | "upcoming_birthdays";
export type ViewMode = "list" | "compact";

export const BATCH_SIZE = 10;

interface LabeledEntry {
  type: string;
  label?: string;
}

export function clean_entry_label<T extends LabeledEntry>(entry: T): T {
  const { label, ...rest } = entry;
  const trimmed = (label ?? "").trim();

  if (entry.type === "other" && trimmed) return { ...rest, label: trimmed } as T;

  return rest as T;
}

function has_address_value(address?: Address | null): boolean {
  if (!address) return false;

  return Boolean(
    (address.street || "").trim() ||
      (address.city || "").trim() ||
      (address.state || "").trim() ||
      (address.postal_code || "").trim() ||
      (address.country || "").trim(),
  );
}

function plain_address(entry: Address): Address {
  const address: Address = {};

  if (entry.street) address.street = entry.street;
  if (entry.city) address.city = entry.city;
  if (entry.state) address.state = entry.state;
  if (entry.postal_code) address.postal_code = entry.postal_code;
  if (entry.country) address.country = entry.country;

  return address;
}

export function primary_address_index(entries: AddressEntry[]): number {
  const home = entries.findIndex((entry) => entry.type === "home");

  if (home >= 0) return home;

  return entries.length > 0 ? 0 : -1;
}

export function sync_legacy_fields(form: ContactFormData): ContactFormData {
  const next: ContactFormData = { ...form };

  if (form.email_entries) {
    next.email_entries = form.email_entries
      .filter((entry) => entry.value.trim())
      .map((entry) => clean_entry_label({ ...entry, value: entry.value.trim() }));
    next.emails = next.email_entries.map((entry) => entry.value);
  }

  if (form.phone_entries) {
    next.phone_entries = form.phone_entries
      .filter((entry) => entry.value.trim())
      .map((entry) => clean_entry_label({ ...entry, value: entry.value.trim() }));
    next.phone = next.phone_entries[0]?.value;
  }

  if (form.address_entries) {
    next.address_entries = form.address_entries
      .filter((entry) => has_address_value(entry))
      .map((entry) => clean_entry_label(entry));
    const index = primary_address_index(next.address_entries);

    next.address =
      index >= 0 ? plain_address(next.address_entries[index]) : undefined;
  }

  return next;
}

function same_value(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function merge_email_entries(
  emails: string[],
  existing: EmailEntry[],
): EmailEntry[] {
  const values = emails.map((value) => value.trim()).filter(Boolean);
  const used = new Set<number>();

  const matched = values.map((value) => {
    const index = existing.findIndex(
      (entry, i) => !used.has(i) && same_value(entry.value, value),
    );

    if (index >= 0) used.add(index);

    return index;
  });

  return values.map((value, position) => {
    let index = matched[position];

    if (index < 0) {
      const fallback = existing[position];

      if (
        fallback &&
        !used.has(position) &&
        !values.some((other) => same_value(other, fallback.value))
      ) {
        index = position;
        used.add(position);
      }
    }

    const source = index >= 0 ? existing[index] : undefined;

    return source
      ? { ...source, value }
      : { value, type: "other" as EmailEntry["type"] };
  });
}

function merge_phone_entries(
  phone: string | undefined,
  existing: PhoneEntry[],
): PhoneEntry[] {
  const value = (phone ?? "").trim();
  const rest = existing.slice(1);

  if (!value) return rest;
  if (existing[0]) return [{ ...existing[0], value }, ...rest];

  return [{ value, type: "mobile" }];
}

function merge_address_entries(
  address: Address | undefined,
  existing: AddressEntry[],
): AddressEntry[] {
  const index = primary_address_index(existing);
  const has_value = has_address_value(address);

  if (index < 0) {
    return has_value && address
      ? [{ ...plain_address(address), type: "home" }]
      : [];
  }

  if (!has_value || !address) {
    return existing.filter((_, i) => i !== index);
  }

  const { type, label } = existing[index];
  const replacement: AddressEntry = {
    ...plain_address(address),
    type,
    ...(label !== undefined ? { label } : {}),
  };

  return existing.map((entry, i) => (i === index ? replacement : entry));
}

export function reconcile_entry_fields(form: ContactFormData): ContactFormData {
  return sync_legacy_fields({
    ...form,
    email_entries: merge_email_entries(
      form.emails ?? [],
      form.email_entries ?? [],
    ),
    phone_entries: merge_phone_entries(form.phone, form.phone_entries ?? []),
    address_entries: merge_address_entries(
      form.address,
      form.address_entries ?? [],
    ),
  });
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
