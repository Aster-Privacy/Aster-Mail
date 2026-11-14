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
export type SystemMoveTarget = "inbox" | "archive" | "spam" | "trash";

export type MailLocation =
  | "inbox"
  | "folder"
  | "archive"
  | "spam"
  | "trash"
  | "sent"
  | "drafts"
  | "scheduled";

export interface MailLocationInput {
  current_view?: string;
  is_trashed?: boolean;
  is_spam?: boolean;
  is_archived?: boolean;
  in_custom_folder?: boolean;
  is_sent_item?: boolean;
}

export const SYSTEM_MOVE_TARGET_LABEL_KEYS = {
  inbox: "mail.inbox",
  archive: "mail.archive",
  spam: "mail.spam",
  trash: "mail.trash",
} as const satisfies Record<SystemMoveTarget, string>;

const TARGETS_BY_LOCATION: Record<MailLocation, readonly SystemMoveTarget[]> =
  {
    inbox: ["archive", "spam", "trash"],
    folder: ["inbox", "archive", "spam", "trash"],
    archive: ["inbox", "spam", "trash"],
    spam: ["inbox", "trash"],
    trash: ["inbox"],
    sent: ["archive", "trash"],
    drafts: [],
    scheduled: [],
  };

export function resolve_mail_location({
  current_view = "inbox",
  is_trashed = false,
  is_spam = false,
  is_archived = false,
  in_custom_folder = false,
  is_sent_item = false,
}: MailLocationInput): MailLocation {
  if (current_view === "drafts") return "drafts";
  if (current_view === "scheduled") return "scheduled";
  if (current_view === "trash" || is_trashed) return "trash";
  if (current_view === "spam" || is_spam) return "spam";
  if (current_view === "archive" || is_archived) return "archive";
  if (current_view === "sent" || is_sent_item) return "sent";
  if (in_custom_folder) return "folder";

  return "inbox";
}

export function system_move_targets(
  location: MailLocation,
  available: Partial<Record<SystemMoveTarget, boolean>>,
): SystemMoveTarget[] {
  return TARGETS_BY_LOCATION[location].filter((target) => available[target]);
}
