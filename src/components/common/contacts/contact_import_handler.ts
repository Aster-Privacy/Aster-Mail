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

import { parse_csv_line } from "@/utils/contact_utils";
import { create_contact_encrypted } from "@/services/api/contacts";

const BATCH_SIZE = 10;

export function parse_csv_contacts(text: string): {
  contacts: ContactFormData[];
  error?: string;
} {
  const MAX_CSV_ROWS = 10000;
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    return { contacts: [], error: "csv_empty" };
  }
  if (lines.length - 1 > MAX_CSV_ROWS) {
    return { contacts: [], error: "csv_too_large" };
  }

  const headers = parse_csv_line(lines[0]).map((h) => h.toLowerCase().trim());
  const first_name_idx = headers.findIndex(
    (h) => h.includes("first") && h.includes("name"),
  );
  const last_name_idx = headers.findIndex(
    (h) => h.includes("last") && h.includes("name"),
  );
  const name_idx = headers.findIndex((h) => h === "name" || h === "full name");
  const email_idx = headers.findIndex(
    (h) => h.includes("email") || h.includes("e-mail"),
  );
  const phone_idx = headers.findIndex(
    (h) => h.includes("phone") || h.includes("mobile") || h.includes("cell"),
  );
  const company_idx = headers.findIndex(
    (h) =>
      h.includes("company") || h.includes("organization") || h.includes("org"),
  );
  const job_idx = headers.findIndex(
    (h) => h.includes("job") || h.includes("title") || h.includes("position"),
  );
  const birthday_idx = headers.findIndex(
    (h) => h.includes("birthday") || h.includes("birth"),
  );
  const notes_idx = headers.findIndex((h) => h.includes("note"));

  const contacts: ContactFormData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parse_csv_line(lines[i]);

    if (values.every((v) => !v)) continue;

    let first_name = "";
    let last_name = "";

    if (first_name_idx >= 0) {
      first_name = values[first_name_idx] || "";
    }
    if (last_name_idx >= 0) {
      last_name = values[last_name_idx] || "";
    }
    if (!first_name && !last_name && name_idx >= 0) {
      const full_name = values[name_idx] || "";
      const parts = full_name.split(" ");

      first_name = parts[0] || "";
      last_name = parts.slice(1).join(" ");
    }

    if (!first_name && !last_name) continue;

    const email = email_idx >= 0 ? values[email_idx] : "";
    const emails = email
      ? email
          .split(";")
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

    contacts.push({
      first_name,
      last_name,
      emails,
      phone: phone_idx >= 0 ? values[phone_idx] : undefined,
      company: company_idx >= 0 ? values[company_idx] : undefined,
      job_title: job_idx >= 0 ? values[job_idx] : undefined,
      birthday: birthday_idx >= 0 ? values[birthday_idx] : undefined,
      notes: notes_idx >= 0 ? values[notes_idx] : undefined,
      is_favorite: false,
    });
  }

  if (contacts.length === 0) {
    return { contacts: [], error: "no_valid_contacts" };
  }

  return { contacts };
}

export async function import_contacts_batched(
  contacts_to_import: ContactFormData[],
  on_progress: (current: number, total: number) => void,
): Promise<DecryptedContact[]> {
  const imported_contacts: DecryptedContact[] = [];

  for (let i = 0; i < contacts_to_import.length; i += BATCH_SIZE) {
    const batch = contacts_to_import.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((contact_data) => create_contact_encrypted(contact_data)),
    );

    results.forEach((result, batch_idx) => {
      const contact_data = batch[batch_idx];

      if (result.status === "fulfilled" && result.value.data) {
        imported_contacts.push({
          id: result.value.data.id,
          ...contact_data,
          is_favorite: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    });

    on_progress(
      Math.min(i + batch.length, contacts_to_import.length),
      contacts_to_import.length,
    );
  }

  return imported_contacts;
}
