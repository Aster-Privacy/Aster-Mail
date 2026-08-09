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
import type { } from "@/types/email";
import type { } from "@/services/api/mail";


import { Skeleton } from "@/components/ui/skeleton";
import { strip_html_tags } from "@/lib/html_sanitizer";


export const MIN_LIST_WIDTH = 280;
export const SNIPPET_WINDOW = 120;
export const SLOW_SEARCH_MS = 6000;

export function extract_snippet(preview: string, terms: string[]): string {
  if (!preview || terms.length === 0) return "";
  const plain = strip_html_tags(preview);
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
  date_range: "any" | "today" | "week" | "month";
  has_attachment: boolean | null;
  exclude_social: boolean;
  read_status: "any" | "read" | "unread";
  sort_by: SortOption;
}

export interface SearchResultsPageProps {
  query: string;
  on_close: () => void;
  on_result_click: (id: string) => void;
  on_search_click?: () => void;
  on_search_submit?: (query: string) => void;
  split_email_id?: string | null;
  on_split_close?: () => void;
  on_settings_click?: () => void;
  on_quick_settings_click?: () => void;
}

export function SearchResultSkeleton() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b overflow-hidden"
      style={{ borderColor: "var(--border-secondary)" }}
    >
      <Skeleton className="w-5 h-5 rounded flex-shrink-0" />
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0 hidden sm:block" />
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 overflow-hidden">
        <Skeleton className="h-4 w-full max-w-[100px] flex-shrink-0" />
        <Skeleton className="h-4 flex-1 min-w-0 max-w-[200px]" />
      </div>
      <Skeleton className="h-3 w-12 flex-shrink-0 hidden sm:block" />
    </div>
  );
}

