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
import type {} from "@/types/email";
import type {} from "@/services/api/mail";
import type {
  ForwardData,
  ReplyData,
} from "@/components/email/inbox/inbox_types";

import { strip_html_tags, strip_leading_css_rules } from "@/lib/html_text";
import { strip_preview_filler } from "@/utils/preview_text";

export const MIN_LIST_WIDTH = 280;
export const SNIPPET_WINDOW = 120;
export const SLOW_SEARCH_MS = 6000;
export const SEARCH_LOADING_DELAY_MS = 180;
export const SEARCH_ROW_DIVIDER_CLASS =
  "border-b border-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))]";

export function extract_snippet(preview: string, terms: string[]): string {
  if (!preview || terms.length === 0) return "";
  const plain = strip_preview_filler(
    strip_leading_css_rules(strip_html_tags(preview)),
  );
  const lower = plain.toLowerCase();

  let earliest_index = -1;

  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());

    if (idx !== -1 && (earliest_index === -1 || idx < earliest_index)) {
      earliest_index = idx;
    }
  }

  if (earliest_index === -1) return "";

  const start = Math.max(0, earliest_index - 40);
  const end = Math.min(plain.length, start + SNIPPET_WINDOW);
  let snippet = plain.slice(start, end).trim();

  if (start > 0) snippet = "\u2026" + snippet;
  if (end < plain.length) snippet = snippet + "\u2026";

  return snippet;
}

export type SortOption = "relevant" | "recent";

export interface SearchFiltersState {
  sort_by: SortOption;
}

export interface SearchResultsPageProps {
  query: string;
  search_nonce?: number;
  on_close: () => void;
  on_result_click: (id: string) => void;
  on_search_click?: () => void;
  on_search_submit?: (query: string) => void;
  split_email_id?: string | null;
  on_split_close?: () => void;
  on_settings_click?: () => void;
  on_quick_settings_click?: () => void;
  on_reply?: (data: ReplyData) => void;
  on_forward?: (data: ForwardData) => void;
  on_email_list_change?: (
    ids: string[],
    snooze_info?: Record<string, string | undefined>,
    grouped_ids_map?: Record<string, string[] | undefined>,
  ) => void;
}
