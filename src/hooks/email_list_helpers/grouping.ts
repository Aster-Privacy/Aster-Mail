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
  InboxEmail,
  
  
} from "@/types/email";


export function sort_emails_by_timestamp(
  emails: InboxEmail[],
  order: "asc" | "desc",
): InboxEmail[] {
  return [...emails].sort((a, b) => {
    const ts_a = new Date(a.raw_timestamp || a.timestamp).getTime();
    const ts_b = new Date(b.raw_timestamp || b.timestamp).getTime();

    return order === "asc" ? ts_a - ts_b : ts_b - ts_a;
  });
}

export interface RestoredEmailEntry {
  email: InboxEmail;
  index: number;
}

export function insert_emails_at(
  emails: InboxEmail[],
  entries: RestoredEmailEntry[],
): InboxEmail[] {
  const present = new Set(emails.map((e) => e.id));
  const fresh = entries
    .filter((entry) => !present.has(entry.email.id))
    .sort((a, b) => a.index - b.index);

  if (fresh.length === 0) return emails;

  const restored = [...emails];

  for (const entry of fresh) {
    const position = Math.min(Math.max(entry.index, 0), restored.length);

    restored.splice(position, 0, entry.email);
  }

  return restored;
}

export function collect_restore_entries(
  emails: InboxEmail[],
  ids: string[],
): RestoredEmailEntry[] {
  const id_set = new Set(ids);

  return emails
    .map((email, index) => ({ email, index }))
    .filter((entry) => id_set.has(entry.email.id));
}

export function expand_email_ids(email: InboxEmail): string[] {
  return email.grouped_email_ids && email.grouped_email_ids.length > 1
    ? email.grouped_email_ids
    : [email.id];
}

export function group_emails_by_thread(emails: InboxEmail[]): InboxEmail[] {
  const thread_map = new Map<string, InboxEmail>();
  const result: InboxEmail[] = [];

  for (const email of emails) {
    if (!email.thread_token) {
      result.push(email);
      continue;
    }

    const existing = thread_map.get(email.thread_token);

    if (!existing) {
      const grouped: InboxEmail = {
        ...email,
        grouped_email_ids: [email.id],
      };

      thread_map.set(email.thread_token, grouped);
      result.push(grouped);
    } else {
      existing.grouped_email_ids = [
        ...(existing.grouped_email_ids || [existing.id]),
        email.id,
      ];

      const existing_count = existing.thread_message_count ?? 1;
      const incoming_count = email.thread_message_count ?? 1;

      existing.thread_message_count = Math.max(existing_count, incoming_count);

      if (existing.is_read && !email.is_read) {
        existing.is_read = false;
      }

      if (!existing.has_attachment && email.has_attachment) {
        existing.has_attachment = true;
      }

      // The row must preview the newest message in the thread, not whichever
      // message happened to be encountered first. Promote the later message's
      // content onto the representative while keeping the aggregated thread
      // fields (grouped ids, count, read/attachment state, folders, tags).
      const existing_ts = new Date(
        existing.raw_timestamp || existing.timestamp,
      ).getTime();
      const incoming_ts = new Date(
        email.raw_timestamp || email.timestamp,
      ).getTime();

      if (
        Number.isFinite(incoming_ts) &&
        (!Number.isFinite(existing_ts) || incoming_ts > existing_ts)
      ) {
        existing.id = email.id;
        existing.subject = email.subject;
        existing.preview = email.preview;
        existing.body_html = email.body_html;
        existing.sender_name = email.sender_name;
        existing.sender_email = email.sender_email;
        existing.display_sender_name = email.display_sender_name;
        existing.display_sender_email = email.display_sender_email;
        existing.avatar_url = email.avatar_url;
        existing.timestamp = email.timestamp;
        existing.raw_timestamp = email.raw_timestamp;
        existing.item_type = email.item_type;
        existing.recipient_names = email.recipient_names;
        existing.recipient_addresses = email.recipient_addresses;
        existing.reply_to = email.reply_to;
        existing.mail_category = email.mail_category;
        existing.send_status = email.send_status;
        existing.snoozed_until = email.snoozed_until;
      }

      if (email.folders && email.folders.length > 0) {
        const existing_tokens = new Set(
          (existing.folders || []).map((f) => f.folder_token),
        );
        const merged_folders = [...(existing.folders || [])];

        for (const folder of email.folders) {
          if (!existing_tokens.has(folder.folder_token)) {
            merged_folders.push(folder);
          }
        }

        existing.folders = merged_folders;
      }

      if (email.tags && email.tags.length > 0) {
        const existing_tag_ids = new Set(
          (existing.tags || []).map((t) => t.id),
        );
        const merged_tags = [...(existing.tags || [])];

        for (const tag of email.tags) {
          if (!existing_tag_ids.has(tag.id)) {
            merged_tags.push(tag);
          }
        }

        existing.tags = merged_tags;
      }
    }
  }

  return result;
}

