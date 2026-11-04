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

import { print_document_in_page, print_page_css } from "@/utils/print_page";

export interface ContactPrintLabels {
  title: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  address: string;
  birthday: string;
  notes: string;
}

const escape_html = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const display_name_of = (contact: DecryptedContact): string =>
  `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
  contact.emails[0] ||
  "";

const address_text_of = (contact: DecryptedContact): string => {
  const address = contact.address;

  if (!address) return "";

  return [
    address.street,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
};

const row = (label: string, value: string): string =>
  value
    ? `<tr><th>${escape_html(label)}</th><td>${escape_html(value)}</td></tr>`
    : "";

const card = (
  contact: DecryptedContact,
  labels: ContactPrintLabels,
): string => {
  const rows = [
    row(labels.email, contact.emails.filter(Boolean).join(", ")),
    row(labels.phone, contact.phone || ""),
    row(labels.company, contact.company || ""),
    row(labels.job_title, contact.job_title || ""),
    row(labels.address, address_text_of(contact)),
    row(labels.birthday, contact.birthday || ""),
    row(labels.notes, contact.notes || ""),
  ].join("");

  return `<section class="card"><h2>${escape_html(
    display_name_of(contact),
  )}</h2><table>${rows}</table></section>`;
};

const PRINT_ROOT = "#aster-print-root";

const contact_print_css = (): string => `
${print_page_css("16mm", PRINT_ROOT)}
${PRINT_ROOT}, ${PRINT_ROOT} * { box-sizing: border-box; }
${PRINT_ROOT} { margin: 0; color: #111; background: #fff; font: 12px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
${PRINT_ROOT} h1 { font-size: 18px; margin: 0 0 4px; }
${PRINT_ROOT} .count { color: #666; font-size: 11px; margin: 0 0 16px; }
${PRINT_ROOT} .card { break-inside: avoid; page-break-inside: avoid; border-top: 1px solid #ddd; padding: 10px 0; }
${PRINT_ROOT} .card h2 { font-size: 13px; margin: 0 0 4px; }
${PRINT_ROOT} table { border-collapse: collapse; width: 100%; }
${PRINT_ROOT} th { text-align: start; font-weight: 500; color: #666; width: 96px; padding: 1px 8px 1px 0; vertical-align: top; }
${PRINT_ROOT} td { padding: 1px 0; vertical-align: top; word-break: break-word; }
`;

const build_body = (
  contacts: DecryptedContact[],
  labels: ContactPrintLabels,
): string =>
  `<h1>${escape_html(labels.title)}</h1><p class="count">${
    contacts.length
  }</p>${contacts.map((contact) => card(contact, labels)).join("")}`;

export function print_contacts(
  contacts: DecryptedContact[],
  labels: ContactPrintLabels,
): void {
  if (contacts.length === 0) return;

  print_document_in_page(
    labels.title,
    build_body(contacts, labels),
    contact_print_css(),
  );
}
