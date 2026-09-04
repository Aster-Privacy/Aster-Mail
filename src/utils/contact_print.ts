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

const build_document = (
  contacts: DecryptedContact[],
  labels: ContactPrintLabels,
): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${escape_html(
    labels.title,
  )}</title><style>
@page { margin: 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; background: #fff; font: 12px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
h1 { font-size: 18px; margin: 0 0 4px; }
.count { color: #666; font-size: 11px; margin: 0 0 16px; }
.card { break-inside: avoid; page-break-inside: avoid; border-top: 1px solid #ddd; padding: 10px 0; }
.card h2 { font-size: 13px; margin: 0 0 4px; }
table { border-collapse: collapse; width: 100%; }
th { text-align: start; font-weight: 500; color: #666; width: 96px; padding: 1px 8px 1px 0; vertical-align: top; }
td { padding: 1px 0; vertical-align: top; word-break: break-word; }
</style></head><body><h1>${escape_html(
    labels.title,
  )}</h1><p class="count">${contacts.length}</p>${contacts
    .map((contact) => card(contact, labels))
    .join("")}</body></html>`;

export function print_contacts(
  contacts: DecryptedContact[],
  labels: ContactPrintLabels,
): void {
  if (contacts.length === 0) return;

  const frame = document.createElement("iframe");

  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  frame.onload = () => {
    const view = frame.contentWindow;

    if (!view) {
      frame.remove();

      return;
    }
    view.focus();
    view.print();
    setTimeout(() => frame.remove(), 1000);
  };

  frame.srcdoc = build_document(contacts, labels);
  document.body.appendChild(frame);
}
