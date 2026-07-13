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
import type { InboxEmail } from "@/types/email";

function row_content_equal(a: InboxEmail, b: InboxEmail): boolean {
  return (
    a.is_read === b.is_read &&
    a.is_starred === b.is_starred &&
    a.is_pinned === b.is_pinned &&
    a.is_trashed === b.is_trashed &&
    a.is_archived === b.is_archived &&
    a.is_spam === b.is_spam &&
    a.is_selected === b.is_selected &&
    a.subject === b.subject &&
    a.preview === b.preview &&
    a.timestamp === b.timestamp &&
    a.raw_timestamp === b.raw_timestamp &&
    a.sender_name === b.sender_name &&
    a.sender_email === b.sender_email &&
    a.has_attachment === b.has_attachment &&
    a.thread_message_count === b.thread_message_count &&
    a.snoozed_until === b.snoozed_until &&
    a.send_status === b.send_status &&
    a.phishing_level === b.phishing_level &&
    a.spf_result === b.spf_result &&
    a.dkim_result === b.dkim_result &&
    a.dmarc_result === b.dmarc_result
  );
}

//
// Silent revalidation only refetches the first page. The already-loaded older
// pages must survive, and unchanged rows must keep their object identity so
// React skips re-rendering them. Freshly fetched rows replace their previous
// selves only when their content actually changed; rows beyond the refetched
// page are preserved in place.
//
// When the refetched page is not full (fewer rows than page_size) it is an
// authoritative complete view of the first page: a previously-known first-page
// row that is absent from it was deleted or moved elsewhere and must be
// dropped. When the page is full a missing row may simply have shifted onto a
// later page, so it is kept to avoid deleting real mail.
//
export function merge_revalidated_emails(
  existing: InboxEmail[],
  fetched: InboxEmail[],
  page_size?: number,
): InboxEmail[] {
  const existing_by_id = new Map(existing.map((email) => [email.id, email]));
  const fetched_ids = new Set(fetched.map((email) => email.id));

  const head = fetched.map((incoming) => {
    const prev = existing_by_id.get(incoming.id);

    if (!prev) return incoming;

    const reconciled =
      incoming.is_selected === prev.is_selected
        ? incoming
        : { ...incoming, is_selected: prev.is_selected };

    return row_content_equal(prev, reconciled) ? prev : reconciled;
  });

  const page_is_authoritative =
    page_size !== undefined && fetched.length < page_size;
  const first_page_ids = page_is_authoritative
    ? new Set(existing.slice(0, page_size).map((email) => email.id))
    : null;

  const tail = existing.filter((email) => {
    if (fetched_ids.has(email.id)) return false;
    if (first_page_ids?.has(email.id)) return false;

    return true;
  });

  return [...head, ...tail];
}
