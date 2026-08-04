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
export interface CategoryPreview {
  sender: string;
  subject: string;
}

export const MAX_PREVIEW_SENDER_CHARS = 80;
export const MAX_PREVIEW_SUBJECT_CHARS = 160;

export function titlecase_localpart(localpart: string): string {
  const words = localpart.split(/[._+-]+/).filter(Boolean);

  if (!words.length) return localpart;

  return words
    .map((word) =>
      /[a-z]/.test(word) && !/[A-Z]/.test(word)
        ? word[0].toUpperCase() + word.slice(1)
        : word,
    )
    .join(" ");
}

const GENERIC_LOCALPARTS = new Set([
  "account",
  "accounts",
  "admin",
  "alert",
  "alerts",
  "billing",
  "bounce",
  "contact",
  "deals",
  "donotreply",
  "email",
  "feedback",
  "hello",
  "help",
  "hi",
  "info",
  "mail",
  "mailer",
  "marketing",
  "members",
  "message",
  "messages",
  "news",
  "newsletter",
  "notification",
  "notifications",
  "notify",
  "noreply",
  "offers",
  "order",
  "orders",
  "postmaster",
  "receipt",
  "receipts",
  "reply",
  "sales",
  "security",
  "service",
  "support",
  "team",
  "update",
  "updates",
]);

const DOMAIN_PREFIXES = new Set([
  "e",
  "email",
  "mail",
  "mailer",
  "news",
  "notification",
  "notifications",
  "reply",
  "send",
  "smtp",
  "t",
]);

const SECOND_LEVEL_SUFFIXES = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "or",
  "org",
]);

export function domain_brand_label(domain: string): string {
  const labels = domain
    .toLowerCase()
    .split(".")
    .filter(Boolean)
    .filter((label, index) => index > 0 || !DOMAIN_PREFIXES.has(label));

  if (labels.length === 0) return "";
  if (labels.length === 1) return titlecase_localpart(labels[0]);

  const suffix_offset =
    labels.length > 2 && SECOND_LEVEL_SUFFIXES.has(labels[labels.length - 2])
      ? 3
      : 2;
  const base = labels[Math.max(0, labels.length - suffix_offset)];

  return titlecase_localpart(base);
}

export function preview_sender_label(
  name: string | undefined,
  email: string | undefined,
): string {
  const trimmed_name = name?.trim();

  if (trimmed_name) return trimmed_name.slice(0, MAX_PREVIEW_SENDER_CHARS);

  const address = email?.trim() ?? "";
  const at = address.indexOf("@");
  const localpart = at > 0 ? address.slice(0, at) : address;
  const domain = at > 0 ? address.slice(at + 1) : "";
  const normalized = localpart.toLowerCase().replace(/[._+-]/g, "");

  if (domain && GENERIC_LOCALPARTS.has(normalized)) {
    const brand = domain_brand_label(domain);

    if (brand) return brand.slice(0, MAX_PREVIEW_SENDER_CHARS);
  }

  return titlecase_localpart(localpart).slice(0, MAX_PREVIEW_SENDER_CHARS);
}

export function build_category_preview(
  name: string | undefined,
  email: string | undefined,
  subject: string | undefined,
): CategoryPreview {
  return {
    sender: preview_sender_label(name, email),
    subject: (subject ?? "").trim().slice(0, MAX_PREVIEW_SUBJECT_CHARS),
  };
}
