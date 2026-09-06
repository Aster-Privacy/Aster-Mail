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

const escape_value = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const fold_line = (line: string): string => {
  if (line.length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let limit = 75;

  for (const character of line) {
    if (current.length + character.length > limit) {
      parts.push(parts.length === 0 ? current : ` ${current}`);
      current = "";
      limit = 74;
    }
    current += character;
  }
  if (current.length > 0) {
    parts.push(parts.length === 0 ? current : ` ${current}`);
  }

  return parts.join("\r\n");
};

const display_name_of = (contact: DecryptedContact): string => {
  const full = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

  return full || contact.emails[0] || "";
};

const type_param = (type?: string): string =>
  type ? `;TYPE=${type.replace(/[^A-Za-z-]/g, "").toUpperCase()}` : "";

export const contact_to_vcard = (
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): string => {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const push = (line: string) => lines.push(fold_line(line));
  const push_raw = (key: string, value: string) =>
    lines.push(fold_line(`${key}:${value.replace(/[\r\n]/g, "")}`));

  const push_photo = (value: string) => {
    const match = /^data:image\/([A-Za-z0-9.+-]+);base64,(.+)$/.exec(value);

    if (!match) {
      push_raw("PHOTO;VALUE=URI", value);

      return;
    }
    push_raw(`PHOTO;ENCODING=b;TYPE=${match[1].toUpperCase()}`, match[2]);
  };

  push(
    `N:${escape_value(contact.last_name || "")};${escape_value(
      contact.first_name || "",
    )};${escape_value(contact.middle_name || "")};${escape_value(
      contact.title || "",
    )};${escape_value(contact.name_suffix || "")}`,
  );
  push(`FN:${escape_value(display_name_of(contact))}`);
  if (contact.nickname) push(`NICKNAME:${escape_value(contact.nickname)}`);

  const email_entries = contact.email_entries?.length
    ? contact.email_entries
    : contact.emails.map((value) => ({ value, type: undefined }));

  for (const entry of email_entries) {
    if (!entry.value?.trim()) continue;
    push(
      `EMAIL;TYPE=INTERNET${type_param(entry.type)}:${escape_value(entry.value)}`,
    );
  }

  const phone_entries = contact.phone_entries?.length
    ? contact.phone_entries
    : contact.phone
      ? [{ value: contact.phone, type: undefined }]
      : [];

  for (const entry of phone_entries) {
    if (!entry.value?.trim()) continue;
    push(`TEL${type_param(entry.type)}:${escape_value(entry.value)}`);
  }

  if (contact.company || contact.department) {
    push(
      `ORG:${escape_value(contact.company || "")};${escape_value(
        contact.department || "",
      )}`,
    );
  }
  if (contact.job_title) push(`TITLE:${escape_value(contact.job_title)}`);
  if (contact.role) push(`ROLE:${escape_value(contact.role)}`);
  if (contact.pronouns) push(`X-PRONOUNS:${escape_value(contact.pronouns)}`);
  if (contact.phonetic_first_name) {
    push(`X-PHONETIC-FIRST-NAME:${escape_value(contact.phonetic_first_name)}`);
  }
  if (contact.phonetic_middle_name) {
    push(
      `X-PHONETIC-MIDDLE-NAME:${escape_value(contact.phonetic_middle_name)}`,
    );
  }
  if (contact.phonetic_last_name) {
    push(`X-PHONETIC-LAST-NAME:${escape_value(contact.phonetic_last_name)}`);
  }
  if (contact.birthday) push(`BDAY:${escape_value(contact.birthday)}`);

  const address_entries = contact.address_entries?.length
    ? contact.address_entries
    : contact.address
      ? [{ ...contact.address, type: undefined }]
      : [];

  for (const entry of address_entries) {
    push(
      `ADR${type_param(entry.type)}:;;${escape_value(
        entry.street || "",
      )};${escape_value(entry.city || "")};${escape_value(
        entry.state || "",
      )};${escape_value(entry.postal_code || "")};${escape_value(
        entry.country || "",
      )}`,
    );
  }

  const websites = contact.websites?.length
    ? contact.websites
    : contact.social_links?.website
      ? [{ value: contact.social_links.website, type: undefined }]
      : [];

  for (const entry of websites) {
    if (!entry.value?.trim()) continue;
    push_raw(`URL${type_param(entry.type)}`, entry.value);
  }

  for (const entry of contact.social_networks ?? []) {
    if (!entry.value?.trim()) continue;
    push(
      `X-SOCIALPROFILE${type_param(entry.type)}:${escape_value(entry.value)}`,
    );
  }

  for (const entry of contact.instant_messengers ?? []) {
    if (!entry.value?.trim()) continue;
    push(
      `IMPP;X-SERVICE-TYPE=${(entry.type || "other").toUpperCase()}:${escape_value(
        `${entry.type || "other"}:${entry.value}`,
      )}`,
    );
  }

  for (const entry of contact.related_people ?? []) {
    if (!entry.value?.trim()) continue;
    push(`RELATED${type_param(entry.type)}:${escape_value(entry.value)}`);
  }

  for (const entry of contact.date_entries ?? []) {
    if (!entry.value?.trim()) continue;
    if (entry.type === "anniversary") {
      push(`ANNIVERSARY:${escape_value(entry.value)}`);
    } else {
      push(`X-ABDATE${type_param(entry.type)}:${escape_value(entry.value)}`);
    }
  }

  const categories = (contact.groups ?? []).map(
    (group) => group_names[group] ?? group,
  );

  if (categories.length > 0) {
    push(`CATEGORIES:${categories.map(escape_value).join(",")}`);
  }
  if (contact.relationship) {
    push(`X-ASTER-RELATIONSHIP:${escape_value(contact.relationship)}`);
  }
  if (contact.is_favorite) push("X-ASTER-FAVORITE:true");
  if (contact.profile_color) {
    push(`X-ASTER-COLOR:${escape_value(contact.profile_color)}`);
  }
  if (contact.comment) push(`X-ASTER-COMMENT:${escape_value(contact.comment)}`);
  if (contact.notes) push(`NOTE:${escape_value(contact.notes)}`);
  if (contact.avatar_url) push_photo(contact.avatar_url);

  lines.push("END:VCARD");

  return lines.join("\r\n");
};

export const contacts_to_vcard = (
  contacts: DecryptedContact[],
  group_names: Record<string, string> = {},
): string =>
  `${contacts
    .map((contact) => contact_to_vcard(contact, group_names))
    .join("\r\n")}\r\n`;

export const download_text_file = (
  filename: string,
  content: string,
  mime_type: string,
): void => {
  const blob = new Blob([content], { type: `${mime_type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const export_contacts_vcard = (
  contacts: DecryptedContact[],
  group_names: Record<string, string> = {},
): void => {
  download_text_file(
    "aster-contacts.vcf",
    contacts_to_vcard(contacts, group_names),
    "text/vcard",
  );
};

export type ContactExportFormat = "csv" | "vcard";

export const CONTACT_CSV_HEADERS = [
  "First name",
  "Last name",
  "Email",
  "Phone",
  "Company",
  "Job title",
  "Street",
  "City",
  "State",
  "Postal code",
  "Country",
  "Website",
  "Birthday",
  "Notes",
  "Favorite",
];

export const contacts_to_csv = (contacts: DecryptedContact[]): string => {
  const escape_cell = (value: string): string => {
    const safe =
      value.length > 0 && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

    return `"${safe.replace(/"/g, '""')}"`;
  };

  const rows = contacts.map((contact) => {
    const emails = (
      contact.email_entries?.length
        ? contact.email_entries.map((entry) => entry.value)
        : contact.emails
    ).filter((value) => value?.trim());
    const phones = (
      contact.phone_entries?.length
        ? contact.phone_entries.map((entry) => entry.value)
        : contact.phone
          ? [contact.phone]
          : []
    ).filter((value) => value?.trim());
    const address = contact.address_entries?.[0] ?? contact.address;
    const website =
      contact.websites?.[0]?.value || contact.social_links?.website || "";

    return [
      contact.first_name || "",
      contact.last_name || "",
      emails.join("; "),
      phones.join("; "),
      contact.company || "",
      contact.job_title || "",
      address?.street || "",
      address?.city || "",
      address?.state || "",
      address?.postal_code || "",
      address?.country || "",
      website,
      contact.birthday || "",
      contact.notes || "",
      contact.is_favorite ? "true" : "false",
    ];
  });

  return [
    CONTACT_CSV_HEADERS.map(escape_cell).join(","),
    ...rows.map((row) => row.map(escape_cell).join(",")),
  ].join("\r\n");
};

export const contacts_export_filename = (extension: string): string =>
  `aster-contacts-${new Date().toISOString().split("T")[0]}.${extension}`;

export const export_contacts_csv = (contacts: DecryptedContact[]): void => {
  download_text_file(
    contacts_export_filename("csv"),
    contacts_to_csv(contacts),
    "text/csv",
  );
};

export const export_contacts_file = (
  contacts: DecryptedContact[],
  format: ContactExportFormat,
  group_names: Record<string, string> = {},
): void => {
  if (contacts.length === 0) return;

  if (format === "vcard") {
    export_contacts_vcard(contacts, group_names);

    return;
  }

  export_contacts_csv(contacts);
};

export const contact_vcard_filename = (contact: DecryptedContact): string => {
  const base = display_name_of(contact).replace(/[^\p{L}\p{N}]+/gu, "_");

  return `${base || "contact"}.vcf`;
};

export const export_contact_vcard = (
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): void => {
  download_text_file(
    contact_vcard_filename(contact),
    `${contact_to_vcard(contact, group_names)}\r\n`,
    "text/vcard",
  );
};

export const share_contact_vcard = async (
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): Promise<void> => {
  const filename = contact_vcard_filename(contact);
  const content = `${contact_to_vcard(contact, group_names)}\r\n`;

  if (typeof navigator !== "undefined" && typeof File !== "undefined") {
    const file = new File([content], filename, { type: "text/vcard" });
    const payload = { files: [file], title: display_name_of(contact) };
    const can_share = navigator.canShare?.(payload) ?? false;

    if (can_share && navigator.share) {
      try {
        await navigator.share(payload);

        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }
  }

  download_text_file(filename, content, "text/vcard");
};

export const contact_vcard_file = (
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): File | null => {
  if (typeof File === "undefined") return null;

  return new File(
    [`${contact_to_vcard(contact, group_names)}\r\n`],
    contact_vcard_filename(contact),
    { type: "text/vcard" },
  );
};

export const can_share_contact_file = (
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): boolean => {
  if (typeof navigator === "undefined" || !navigator.share) return false;

  const file = contact_vcard_file(contact, group_names);

  if (!file) return false;

  return navigator.canShare?.({ files: [file] }) ?? false;
};

export const contact_to_share_text = (contact: DecryptedContact): string => {
  const lines: string[] = [];
  const name = display_name_of(contact);

  if (name) lines.push(name);
  if (contact.company) {
    lines.push(
      contact.job_title
        ? `${contact.job_title}, ${contact.company}`
        : contact.company,
    );
  } else if (contact.job_title) {
    lines.push(contact.job_title);
  }
  for (const email of contact.emails) lines.push(email);
  for (const entry of contact.phone_entries ?? []) lines.push(entry.value);
  if (!contact.phone_entries?.length && contact.phone) {
    lines.push(contact.phone);
  }
  for (const site of contact.websites ?? []) lines.push(site.value);

  return lines.join("\n");
};
