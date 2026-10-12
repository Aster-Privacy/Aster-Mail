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
import type { DecryptedContact } from "@/types/contacts";

import { fold_search_text } from "@/utils/search_fold";

function digits_of(value: string): string {
  return value.replace(/\D+/g, "");
}

export function fold_contact_query(query: string): string {
  return fold_search_text(query.trim().replace(/\s+/g, " "));
}

export function build_contact_haystack(contact: DecryptedContact): string {
  const first = contact.first_name || "";
  const last = contact.last_name || "";
  const middle = contact.middle_name || "";
  const phones = [
    contact.phone || "",
    ...(contact.phone_entries || []).map((p) => p.value),
  ].filter(Boolean);
  const parts: string[] = [
    [first, middle, last].filter(Boolean).join(" "),
    [first, last].filter(Boolean).join(" "),
    [last, first].filter(Boolean).join(" "),
    contact.nickname || "",
    contact.phonetic_first_name || "",
    contact.phonetic_middle_name || "",
    contact.phonetic_last_name || "",
    contact.title || "",
    contact.name_suffix || "",
    contact.company || "",
    contact.job_title || "",
    contact.role || "",
    contact.department || "",
    contact.notes || "",
    contact.comment || "",
    contact.pronouns || "",
    ...(contact.emails || []),
    ...(contact.email_entries || []).map((e) => e.value),
    ...phones,
    ...phones.map(digits_of),
    ...(contact.related_people || []).map((r) => r.value),
    ...(contact.social_networks || []).map((s) => s.value),
    ...(contact.websites || []).map((w) => w.value),
    ...(contact.instant_messengers || []).map((m) => m.value),
  ];

  return fold_search_text(
    parts
      .filter(Boolean)
      .map((part) => part.replace(/\s+/g, " "))
      .join("\n"),
  );
}

export function haystack_matches_query(
  haystack: string,
  folded_query: string,
): boolean {
  if (!folded_query) return true;
  if (haystack.includes(folded_query)) return true;

  const query_digits = digits_of(folded_query);

  return (
    query_digits.length >= 3 &&
    /^[\d\s()+.-]+$/.test(folded_query) &&
    haystack.includes(query_digits)
  );
}

export function contact_matches_query(
  contact: DecryptedContact,
  query: string,
): boolean {
  return haystack_matches_query(
    build_contact_haystack(contact),
    fold_contact_query(query),
  );
}
