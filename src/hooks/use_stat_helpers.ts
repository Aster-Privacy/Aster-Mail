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
  adjust_unread_count,
  adjust_inbox_count,
  adjust_trash_count,
  adjust_sent_count,
} from "@/hooks/use_mail_counts";
import { adjust_stats_archived } from "@/hooks/use_mail_stats";

export interface StatDeltas {
  unread: number;
  inbox: number;
  sent: number;
  trash: number;
  archived: number;
}

export function compute_stat_deltas(
  email: { item_type: string; is_read: boolean },
  direction: 1 | -1,
): StatDeltas {
  const is_unread_received = email.item_type === "received" && !email.is_read;

  return {
    unread: is_unread_received ? direction : 0,
    inbox: email.item_type === "received" ? direction : 0,
    sent: email.item_type === "sent" ? direction : 0,
    trash: 0,
    archived: 0,
  };
}

export function compute_removal_deltas(email: {
  item_type: string;
  is_read: boolean;
}): StatDeltas {
  return compute_stat_deltas(email, -1);
}

export function compute_restore_deltas(email: {
  item_type: string;
  is_read: boolean;
}): StatDeltas {
  return compute_stat_deltas(email, 1);
}

export function compute_trash_deltas(email: {
  item_type: string;
  is_read: boolean;
}): StatDeltas {
  const base = compute_removal_deltas(email);

  return { ...base, trash: 1 };
}

export function compute_untrash_deltas(email: {
  item_type: string;
  is_read: boolean;
}): StatDeltas {
  const base = compute_restore_deltas(email);

  return { ...base, trash: -1 };
}

export function compute_archive_deltas(email: {
  item_type: string;
  is_read: boolean;
}): StatDeltas {
  const base = compute_removal_deltas(email);

  return { ...base, archived: 1 };
}

export function compute_unarchive_deltas(email: {
  item_type: string;
  is_read: boolean;
}): StatDeltas {
  const base = compute_restore_deltas(email);

  return { ...base, archived: -1 };
}

export function apply_stat_deltas(deltas: StatDeltas): void {
  if (deltas.unread !== 0) {
    adjust_unread_count(deltas.unread);
  }
  if (deltas.inbox !== 0) {
    adjust_inbox_count(deltas.inbox);
  }
  if (deltas.sent !== 0) {
    adjust_sent_count(deltas.sent);
  }
  if (deltas.trash !== 0) {
    adjust_trash_count(deltas.trash);
  }
  if (deltas.archived !== 0) {
    adjust_stats_archived(deltas.archived);
  }
}

export function revert_stat_deltas(deltas: StatDeltas): void {
  apply_stat_deltas({
    unread: -deltas.unread,
    inbox: -deltas.inbox,
    sent: -deltas.sent,
    trash: -deltas.trash,
    archived: -deltas.archived,
  });
}
