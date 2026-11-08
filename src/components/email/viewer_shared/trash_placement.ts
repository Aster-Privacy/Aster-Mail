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
import {
  permanent_delete_mail_item,
  batched_bulk_permanent_delete,
} from "@/services/api/mail";
import { adjust_stats_trash } from "@/hooks/use_mail_stats";
import {
  emit_mail_changed,
  emit_mail_items_removed,
} from "@/hooks/mail_events";

export interface TrashPlacementItem {
  is_trashed?: boolean | null;
  metadata?: { is_trashed?: boolean | null } | null;
}

export interface TrashPlacementMessage {
  id: string;
  is_trashed?: boolean;
  item_type?: string;
}

export function is_mail_item_in_trash(
  item: TrashPlacementItem | null | undefined,
): boolean {
  if (!item) return false;
  if (typeof item.is_trashed === "boolean") return item.is_trashed;

  return item.metadata?.is_trashed === true;
}

export function is_thread_message_in_trash(
  message: TrashPlacementMessage,
  opened_id: string | null | undefined,
  opened_item: TrashPlacementItem | null | undefined,
): boolean {
  if (typeof message.is_trashed === "boolean") return message.is_trashed;

  return !!opened_id && message.id === opened_id
    ? is_mail_item_in_trash(opened_item)
    : false;
}

export function is_list_email_in_trash(
  email: { is_trashed?: boolean | null },
  current_view: string | null | undefined,
): boolean {
  if (typeof email.is_trashed === "boolean") return email.is_trashed;

  return current_view === "trash";
}

export function trashed_conversation_ids(
  opened_id: string,
  opened_item: TrashPlacementItem | null | undefined,
  thread_messages: TrashPlacementMessage[],
): string[] {
  const ids = new Set<string>([opened_id]);

  for (const message of thread_messages) {
    if (message.id === opened_id || message.item_type === "draft") continue;
    if (is_thread_message_in_trash(message, opened_id, opened_item)) {
      ids.add(message.id);
    }
  }

  return Array.from(ids);
}

export async function permanently_delete_message_ids(
  ids: string[],
): Promise<boolean> {
  const unique_ids = Array.from(new Set(ids.filter(Boolean)));

  if (unique_ids.length === 0) return false;

  const deleted =
    unique_ids.length === 1
      ? !!(await permanent_delete_mail_item(unique_ids[0])).data
      : (await batched_bulk_permanent_delete(unique_ids)).success;

  if (deleted) {
    adjust_stats_trash(-unique_ids.length);
    emit_mail_items_removed({ ids: unique_ids });
    emit_mail_changed();
  }

  return deleted;
}
