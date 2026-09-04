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

export const contact_to_vcard = (
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): string => {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const push = (line: string) => lines.push(fold_line(line));

  push(
    `N:${escape_value(contact.last_name || "")};${escape_value(
      contact.first_name || "",
    )};${escape_value(contact.middle_name || "")};${escape_value(
      contact.title || "",
    )};${escape_value(contact.name_suffix || "")}`,
  );
  push(`FN:${escape_value(display_name_of(contact))}`);

  for (const address of contact.emails) {
    if (address.trim()) push(`EMAIL;TYPE=INTERNET:${escape_value(address)}`);
  }
  if (contact.phone) push(`TEL:${escape_value(contact.phone)}`);
  if (contact.company || contact.department) {
    push(
      `ORG:${escape_value(contact.company || "")};${escape_value(
        contact.department || "",
      )}`,
    );
  }
  if (contact.job_title) push(`TITLE:${escape_value(contact.job_title)}`);
  if (contact.nickname) push(`NICKNAME:${escape_value(contact.nickname)}`);
  if (contact.pronouns) push(`X-PRONOUNS:${escape_value(contact.pronouns)}`);
  if (contact.birthday) push(`BDAY:${escape_value(contact.birthday)}`);
  if (contact.address) {
    const address = contact.address;

    push(
      `ADR;TYPE=HOME:;;${escape_value(address.street || "")};${escape_value(
        address.city || "",
      )};${escape_value(address.state || "")};${escape_value(
        address.postal_code || "",
      )};${escape_value(address.country || "")}`,
    );
  }
  if (contact.social_links?.website) {
    push(`URL:${escape_value(contact.social_links.website)}`);
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
  if (contact.notes) push(`NOTE:${escape_value(contact.notes)}`);

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

export const contact_vcard_filename = (contact: DecryptedContact): string => {
  const base = display_name_of(contact).replace(/[^\p{L}\p{N}]+/gu, "_");

  return `${base || "contact"}.vcf`;
};

export const export_contact_vcard = (contact: DecryptedContact): void => {
  download_text_file(
    contact_vcard_filename(contact),
    `${contact_to_vcard(contact)}\r\n`,
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
