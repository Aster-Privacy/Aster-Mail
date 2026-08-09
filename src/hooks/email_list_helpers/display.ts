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
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import { is_outgoing_view, should_exclude_trashed_spam } from "./views";

export function outgoing_recipient_names(
  current_view: string | undefined,
  recipient_names: string[] | undefined,
): string[] | null {
  return is_outgoing_view(current_view) &&
    recipient_names &&
    recipient_names.length > 0
    ? recipient_names
    : null;
}

export function outgoing_profile_email(
  current_view: string | undefined,
  recipient_addresses: string[] | undefined,
  sender_email: string,
): string {
  const first_recipient = recipient_addresses?.[0];

  return is_outgoing_view(current_view) && first_recipient
    ? first_recipient
    : sender_email;
}

export function resolve_list_display_name(params: {
  outgoing_names: string[] | null;
  thread_participant_names: string[] | undefined;
  fallback_name: string;
  to_prefix: string;
}): string {
  if (params.outgoing_names) {
    return `${params.to_prefix}: ${params.outgoing_names.join(", ")}`;
  }

  if (
    params.thread_participant_names &&
    params.thread_participant_names.length > 0
  ) {
    return params.thread_participant_names.join(", ");
  }

  return params.fallback_name;
}

export function is_snoozed_in_future(
  snoozed_until: string | null | undefined,
): boolean {
  if (!snoozed_until) return false;

  const wake_ms = new Date(snoozed_until).getTime();

  return Number.isFinite(wake_ms) && wake_ms > Date.now();
}

export function should_keep_email_in_view(
  flags: {
    is_trashed?: boolean;
    is_spam?: boolean;
    is_archived?: boolean;
    item_type?: string;
    snoozed_until?: string | null;
  },
  view: string,
): boolean {
  if (
    (view === "inbox" || view === "") &&
    flags.item_type !== undefined &&
    flags.item_type !== "received"
  ) {
    return false;
  }

  if (
    (view === "inbox" || view === "") &&
    is_snoozed_in_future(flags.snoozed_until)
  ) {
    return false;
  }

  if (!should_exclude_trashed_spam(view)) return true;

  if (flags.is_trashed || flags.is_spam) return false;

  const is_folder_like_view =
    view.startsWith("folder-") ||
    view.startsWith("tag-") ||
    view.startsWith("alias-");

  if (
    !(
      view === "archive" ||
      view === "all" ||
      is_folder_like_view ||
      !flags.is_archived
    )
  ) {
    return false;
  }

  return true;
}

export function format_timestamp(date: Date, options: FormatOptions): string {
  return format_email_list_timestamp(date, options);
}


