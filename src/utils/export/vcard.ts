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

export interface VCardAddress {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  type?: string;
}

export interface VCardTypedValue {
  value: string;
  type?: string;
}

export interface VCardContact {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  nickname?: string;
  display_name?: string;
  emails?: string[];
  email_entries?: VCardTypedValue[];
  phone?: string;
  phone_entries?: VCardTypedValue[];
  company?: string;
  department?: string;
  job_title?: string;
  role?: string;
  address?: string;
  address_entries?: VCardAddress[];
  birthday?: string;
  notes?: string;
  social_links?: { service?: string; url?: string }[];
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

function escape_value(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold_line(line: string): string {
  const chars = Array.from(line);

  if (chars.length <= 75) return line;
  const out: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const take = i === 0 ? 75 : 74;

    out.push(chars.slice(i, i + take).join(""));
    i += take;
  }

  return out.join("\r\n ");
}

function emit(lines: string[], key: string, value: string | undefined) {
  if (!value) return;
  lines.push(fold_line(`${key}:${escape_value(value)}`));
}

function emit_uri(lines: string[], key: string, value: string | undefined) {
  if (!value) return;
  lines.push(fold_line(`${key}:${value.replace(/[\r\n]/g, "")}`));
}

function type_param(type: string | undefined): string {
  if (!type) return "";

  return `;TYPE=${type.replace(/[^A-Za-z-]/g, "").toUpperCase()}`;
}

export function serialize_vcard(contact: VCardContact): string {
  const lines: string[] = [];

  lines.push("BEGIN:VCARD");
  lines.push("VERSION:4.0");

  const last = contact.last_name ?? "";
  const first = contact.first_name ?? "";
  const display =
    contact.display_name ||
    `${first} ${last}`.trim() ||
    (contact.emails && contact.emails[0]) ||
    "Unknown";

  lines.push(fold_line(`FN:${escape_value(display)}`));
  lines.push(
    fold_line(
      `N:${escape_value(last)};${escape_value(first)};${escape_value(
        contact.middle_name ?? "",
      )};;`,
    ),
  );

  emit(lines, "NICKNAME", contact.nickname);

  const email_entries = contact.email_entries?.length
    ? contact.email_entries
    : (contact.emails ?? []).map((value) => ({ value, type: undefined }));

  for (const entry of email_entries) {
    if (!entry.value) continue;
    lines.push(
      fold_line(`EMAIL${type_param(entry.type)}:${escape_value(entry.value)}`),
    );
  }

  const phone_entries = contact.phone_entries?.length
    ? contact.phone_entries
    : contact.phone
      ? [{ value: contact.phone, type: undefined }]
      : [];

  for (const entry of phone_entries) {
    if (!entry.value) continue;
    lines.push(
      fold_line(`TEL${type_param(entry.type)}:${escape_value(entry.value)}`),
    );
  }

  if (contact.company || contact.department) {
    lines.push(
      fold_line(
        `ORG:${escape_value(contact.company ?? "")};${escape_value(
          contact.department ?? "",
        )}`,
      ),
    );
  }
  emit(lines, "TITLE", contact.job_title);
  emit(lines, "ROLE", contact.role);

  for (const entry of contact.address_entries ?? []) {
    lines.push(
      fold_line(
        `ADR${type_param(entry.type)}:;;${escape_value(
          entry.street ?? "",
        )};${escape_value(entry.city ?? "")};${escape_value(
          entry.state ?? "",
        )};${escape_value(entry.postal_code ?? "")};${escape_value(
          entry.country ?? "",
        )}`,
      ),
    );
  }
  if (!contact.address_entries?.length && contact.address) {
    lines.push(fold_line(`ADR:;;${escape_value(contact.address)};;;;`));
  }
  emit(lines, "BDAY", contact.birthday);
  emit(lines, "NOTE", contact.notes);
  emit_uri(lines, "PHOTO", contact.avatar_url);

  if (contact.social_links) {
    for (const s of contact.social_links) {
      if (s.url) emit_uri(lines, "URL", s.url);
    }
  }

  if (contact.created_at) {
    emit(lines, "REV", contact.updated_at ?? contact.created_at);
  }

  lines.push("END:VCARD");

  return lines.join("\r\n") + "\r\n";
}

export function serialize_vcards(contacts: VCardContact[]): Uint8Array {
  const text = contacts.map(serialize_vcard).join("");

  return new TextEncoder().encode(text);
}
