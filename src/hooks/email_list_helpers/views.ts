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

import { type ListMailItemsParams } from "@/services/api/mail";
import { get_alias_hash_by_address } from "@/hooks/use_sidebar_aliases";

export const DEFAULT_PAGE_SIZE = 50;

export const UNKNOWN_TOTAL = -1;

export const MAX_PAGE_TOP_UP_ROUNDS = 3;

export type MailView =
  | "inbox"
  | "sent"
  | "scheduled"
  | "starred"
  | "trash"
  | "archive"
  | "spam"
  | "snoozed"
  | "all";

export const VIEW_PARAMS: Record<MailView, Partial<ListMailItemsParams>> = {
  inbox: {
    item_type: "received",
    is_trashed: false,
    is_spam: false,
    is_archived: false,
  },
  sent: { item_type: "sent", is_trashed: false, is_spam: false },
  scheduled: { item_type: "scheduled", is_trashed: false, is_spam: false },
  starred: { is_starred: true, is_trashed: false, is_spam: false },
  trash: { is_trashed: true },
  archive: { is_archived: true, is_trashed: false, is_spam: false },
  spam: { is_spam: true },
  snoozed: { is_snoozed: true, is_trashed: false, is_spam: false },
  all: { item_type: "all", include_spam: false, include_trash: false },
};

export function build_view_list_params(view: string): ListMailItemsParams {
  const params: ListMailItemsParams = { ...VIEW_PARAMS[view as MailView] };

  if (view.startsWith("folder-")) {
    params.label_token = view.replace("folder-", "");
    delete params.item_type;
  } else if (view.startsWith("tag-")) {
    params.tag_token = view.replace("tag-", "");
    delete params.item_type;
  } else if (view.startsWith("alias-")) {
    const alias_hash = get_alias_hash_by_address(view.replace("alias-", ""));

    if (alias_hash) {
      params.routing_token = alias_hash;
    }
    delete params.item_type;
  } else if (!VIEW_PARAMS[view as MailView]) {
    params.item_type = "received";
  }

  return params;
}

export const VIEWS_EXCLUDING_TRASHED_SPAM = new Set<string>([
  "inbox",
  "sent",
  "scheduled",
  "starred",
  "archive",
  "snoozed",
  "all",
]);

export function should_exclude_trashed_spam(view: string): boolean {
  return (
    VIEWS_EXCLUDING_TRASHED_SPAM.has(view) ||
    view.startsWith("folder-") ||
    view.startsWith("tag-") ||
    view.startsWith("alias-")
  );
}

export const OUTGOING_VIEWS = new Set<string>(["sent", "drafts", "scheduled"]);

export function is_outgoing_view(current_view: string | undefined): boolean {
  return current_view != null && OUTGOING_VIEWS.has(current_view);
}
