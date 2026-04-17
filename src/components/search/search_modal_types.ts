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
import type { RefObject } from "react";
import type { InboxEmail } from "@/types/email";
import type { SearchResultItem } from "@/hooks/use_search";

export interface SearchModalProps {
  is_open: boolean;
  on_close: () => void;
  on_compose?: () => void;
  initial_query?: string;
  on_initial_query_consumed?: () => void;
  on_search_submit?: (query: string) => void;
  on_result_click?: (id: string) => void;
  anchor_ref?: RefObject<HTMLElement | null>;
}

export type SearchFieldType =
  | "subject"
  | "body"
  | "sender"
  | "recipient"
  | "all";

export type SearchScope =
  | "all"
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "spam"
  | "trash";

export type SearchSizeOp = "greater" | "less";
export type SearchSizeUnit = "bytes" | "kb" | "mb";

export interface FilterState {
  fields: SearchFieldType[];
  has_attachments: boolean | undefined;
  is_starred: boolean | undefined;
  date_from: string;
  date_to: string;
  scope: SearchScope;
  search_content: boolean;
  from: string;
  to: string;
  subject: string;
  has_words: string;
  does_not_have: string;
  size_op: SearchSizeOp;
  size_value: string;
  size_unit: SearchSizeUnit;
  within_days: string;
}

export interface AdvancedSearchModalProps {
  is_open: boolean;
  on_close: () => void;
  on_compose?: () => void;
  current_folder?: string;
  on_result_click?: (id: string) => void;
  on_search_submit?: (query: string) => void;
}

export function search_result_to_inbox_email(
  result: SearchResultItem,
): InboxEmail {
  return {
    ...result,
    item_type: "received",
    is_pinned: false,
    is_selected: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    category: "",
    category_color: "",
    avatar_url: result.avatar_url || "",
  };
}
