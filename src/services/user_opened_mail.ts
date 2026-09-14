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
import { view_cache } from "@/hooks/email_list_cache";
import { emit_mail_item_updated } from "@/hooks/mail_events";
import { adjust_stats_unread } from "@/hooks/use_mail_stats";
import { read_clears_conversation } from "@/hooks/unread_read_delta";
import { mark_conversation_read } from "@/hooks/mark_conversation_read";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { list_mail_items } from "@/services/api/mail";
import {
  clear_read_intent,
  get_read_intent,
  note_read_intent,
} from "@/services/read_intent";

export type OpenedMailReadDelay =
  | "immediate"
  | "1_second"
  | "3_seconds"
  | "never";

export interface OpenedMailRow {
  id: string;
  item_type?: string;
  is_read: boolean;
  thread_token?: string | null;
  thread_message_count?: number | null;
  grouped_email_ids?: string[];
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
}

export interface OpenedMailOptions {
  delay: OpenedMailReadDelay | undefined;
  conversation_grouping?: boolean;
  row?: OpenedMailRow | null;
}

export function find_cached_mail_row(id: string): OpenedMailRow | undefined {
  for (const entry of view_cache.values()) {
    const row = entry.state.emails.find((email) => email.id === id);

    if (row) return row;
  }

  return undefined;
}

export function is_read_locally(id: string): boolean {
  return get_read_intent(id) === true;
}

export function on_user_opened_mail(
  id: string,
  options: OpenedMailOptions,
): boolean {
  if ((options.delay ?? "immediate") !== "immediate") return false;

  const row = options.row ?? find_cached_mail_row(id);

  if (!row || row.id !== id) return false;
  if (row.item_type === "draft" || row.item_type === "scheduled") return false;

  const intended = get_read_intent(id);

  if (intended === true || (intended === undefined && row.is_read)) {
    return false;
  }

  const is_received = row.item_type === "received";
  const conversation_options = {
    thread_token: row.thread_token,
    thread_message_count: row.thread_message_count,
    grouped_count: row.grouped_email_ids?.length,
    conversation_grouping: options.conversation_grouping,
    acted_id: id,
  };
  const counted = is_received && read_clears_conversation(conversation_options);

  note_read_intent([id], true);
  if (counted) adjust_stats_unread(-1);
  emit_mail_item_updated({ id, is_read: true });

  void resolve_encrypted_fields(row)
    .then((fields) => {
      if (!fields) return { success: false, encrypted: undefined };

      return update_item_metadata(id, fields, { is_read: true });
    })
    .then((result) => {
      if (result.success) {
        emit_mail_item_updated({
          id,
          is_read: true,
          encrypted_metadata: result.encrypted?.encrypted_metadata,
          metadata_nonce: result.encrypted?.metadata_nonce,
        });
        if (is_received) mark_conversation_read(conversation_options);

        return;
      }
      revert_opened_mail(id, counted);
    })
    .catch(() => revert_opened_mail(id, counted));

  return true;
}

async function resolve_encrypted_fields(row: OpenedMailRow): Promise<{
  encrypted_metadata: string;
  metadata_nonce: string;
  metadata_version?: number;
} | null> {
  if (row.encrypted_metadata && row.metadata_nonce) {
    return {
      encrypted_metadata: row.encrypted_metadata,
      metadata_nonce: row.metadata_nonce,
      metadata_version: row.metadata_version,
    };
  }

  const cached = find_cached_mail_row(row.id);

  if (cached?.encrypted_metadata && cached.metadata_nonce) {
    return {
      encrypted_metadata: cached.encrypted_metadata,
      metadata_nonce: cached.metadata_nonce,
      metadata_version: cached.metadata_version,
    };
  }

  const response = await list_mail_items({ ids: [row.id] });
  const item = response.data?.items.find((entry) => entry.id === row.id);

  if (!item?.encrypted_metadata || !item.metadata_nonce) return null;

  return {
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
  };
}

function revert_opened_mail(id: string, counted: boolean): void {
  clear_read_intent([id], true);
  emit_mail_item_updated({ id, is_read: false });
  if (counted) adjust_stats_unread(1);
}
