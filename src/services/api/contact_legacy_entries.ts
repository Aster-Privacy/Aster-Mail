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
  EmailEntry,
  EmailEntryType,
  PhoneEntry,
  PhoneEntryType,
} from "@/types/contacts";

export interface LegacyContactFields {
  phone?: unknown;
  work_phone?: unknown;
  emails?: unknown;
  work_email?: unknown;
  phone_entries?: unknown;
  email_entries?: unknown;
}

function clean_string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function phone_digits(value: string): string {
  return value.replace(/\D/g, "");
}

function has_entries(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

export function legacy_phone_entries(
  data: LegacyContactFields,
): PhoneEntry[] | undefined {
  if (has_entries(data.phone_entries)) return data.phone_entries as PhoneEntry[];
  const work_phone = clean_string(data.work_phone);

  if (!work_phone) return undefined;
  const phone = clean_string(data.phone);
  const entries: PhoneEntry[] = [];

  if (phone) entries.push({ value: phone, type: "mobile" as PhoneEntryType });
  const work_digits = phone_digits(work_phone);
  const duplicate = entries.some((entry) =>
    work_digits
      ? phone_digits(entry.value) === work_digits
      : entry.value === work_phone,
  );

  if (!duplicate)
    entries.push({ value: work_phone, type: "work" as PhoneEntryType });

  return entries;
}

export function legacy_emails(data: LegacyContactFields): string[] {
  const emails = Array.isArray(data.emails)
    ? data.emails.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  const work_email = clean_string(data.work_email);

  if (!work_email) return emails;
  const known = emails.some(
    (value) => value.trim().toLowerCase() === work_email.toLowerCase(),
  );

  return known ? emails : [...emails, work_email];
}

export function legacy_email_entries(
  data: LegacyContactFields,
): EmailEntry[] | undefined {
  if (has_entries(data.email_entries)) return data.email_entries as EmailEntry[];
  const work_email = clean_string(data.work_email);

  if (!work_email) return undefined;

  return legacy_emails(data).map((value) => ({
    value,
    type: (value.trim().toLowerCase() === work_email.toLowerCase()
      ? "work"
      : "other") as EmailEntryType,
  }));
}
