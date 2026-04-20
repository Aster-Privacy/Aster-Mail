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
import type { InboxEmail } from "@/types/email";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { get_mail_item } from "@/services/api/mail";
import { use_email_actions } from "@/hooks/use_email_actions";
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { InboxHeader } from "@/components/inbox/inbox_header";
import { InboxEmailListItem } from "@/components/email/inbox_email_list_item";
import { SplitEmailViewer } from "@/components/email/split_email_viewer";
import { FullEmailViewer } from "@/components/email/full_email_viewer";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  use_search,
  extract_query_terms,
  compute_highlight_ranges,
  apply_highlights,
} from "@/hooks/use_search";
import { HighlightedText } from "@/components/search/search_result_item";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { use_preferences } from "@/contexts/preferences_context";
import { use_date_format } from "@/hooks/use_date_format";
import { use_i18n } from "@/lib/i18n/context";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";

const MIN_LIST_WIDTH = 280;
const DEFAULT_LIST_WIDTH = 400;
const SEARCH_PAGE_SIZE = 30;
const SNIPPET_WINDOW = 120;

function extract_snippet(preview: string, terms: string[]): string {
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

type SortOption = "relevant" | "recent";

interface SearchFiltersState {
  date_range: "any" | "today" | "week" | "month";
  has_attachment: boolean | null;
  exclude_social: boolean;
  read_status: "any" | "read" | "unread";
  sort_by: SortOption;
}

interface SearchResultsPageProps {
  query: string;
  on_close: () => void;
  on_result_click: (id: string) => void;
  on_search_click?: () => void;
  on_search_submit?: (query: string) => void;
  split_email_id?: string | null;
  on_split_close?: () => void;
  on_settings_click?: () => void;
}

function SearchResultSkeleton() {
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

export function SearchResultsPage({
  query,
  on_close,
  on_result_click,
  on_search_click: _on_search_click,
  on_search_submit,
  split_email_id,
  on_split_close,
  on_settings_click,
}: SearchResultsPageProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { format_email_list } = use_date_format();
  const { state, search, load_more, set_query, clear_results, clear_index } =
    use_search();
  const email_actions = use_email_actions();
  const [bulk_busy, set_bulk_busy] = useState(false);

  const [filters, set_filters] = useState<SearchFiltersState>({
    date_range: "any",
    has_attachment: null,
    exclude_social: false,
    read_status: "any",
    sort_by: "relevant",
  });

  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [search_page, set_search_page] = useState(0);

  const [pane_width, set_pane_width] = useState(DEFAULT_LIST_WIDTH);
  const [is_dragging, set_is_dragging] = useState(false);
  const drag_start_x = useRef(0);
  const drag_start_width = useRef(0);
  const has_searched = useRef(false);

  useEffect(() => {
    if (query) {
      set_query(query);
      perform_search(query);
      has_searched.current = true;
    }

    return () => {
      clear_results();
    };
  }, [query]);

  const perform_search = useCallback(
    (search_query: string) => {
      const search_filters: Record<string, unknown> = {};

      if (filters.date_range !== "any") {
        const now = new Date();

        if (filters.date_range === "today") {
          search_filters.date_from = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          ).toISOString();
        } else if (filters.date_range === "week") {
          const week_ago = new Date(now);

          week_ago.setDate(week_ago.getDate() - 7);
          search_filters.date_from = week_ago.toISOString();
        } else if (filters.date_range === "month") {
          const month_ago = new Date(now);

          month_ago.setMonth(month_ago.getMonth() - 1);
          search_filters.date_from = month_ago.toISOString();
        }
      }

      if (filters.has_attachment !== null) {
        search_filters.has_attachments = filters.has_attachment;
      }

      search(search_query, {
        fields: ["all"],
        filters:
          Object.keys(search_filters).length > 0
            ? (search_filters as {
                has_attachments?: boolean;
                date_from?: string;
              })
            : undefined,
      });
    },
    [search, filters],
  );

  useEffect(() => {
    if (query) {
      perform_search(query);
    }
  }, [filters.date_range, filters.has_attachment]);

  const search_terms = useMemo(() => extract_query_terms(query), [query]);

  const filtered_results = useMemo(() => {
    let results = [...state.results];

    if (filters.read_status === "read") {
      results = results.filter((r) => r.is_read);
    } else if (filters.read_status === "unread") {
      results = results.filter((r) => !r.is_read);
    }

    if (filters.exclude_social) {
      const social_patterns = [
        "facebook",
        "twitter",
        "linkedin",
        "instagram",
        "tiktok",
        "youtube",
        "pinterest",
        "snapchat",
        "reddit",
        "discord",
        "slack",
        "teams",
        "zoom",
        "notification",
        "noreply",
        "no-reply",
      ];

      results = results.filter((r) => {
        const sender_lower = r.sender_email.toLowerCase();

        return !social_patterns.some((p) => sender_lower.includes(p));
      });
    }

    if (filters.sort_by === "recent") {
      results.sort((a, b) => {
        const date_a = new Date(a.timestamp).getTime();
        const date_b = new Date(b.timestamp).getTime();

        return date_b - date_a;
      });
    } else if (filters.sort_by === "relevant" && search_terms.length > 0) {
      results.sort((a, b) => {
        let score_a = 0;
        let score_b = 0;

        for (const term of search_terms) {
          const t = term.toLowerCase();

          if (a.subject.toLowerCase().includes(t)) score_a += 3;
          if (a.sender_name.toLowerCase().includes(t)) score_a += 2;
          if (a.sender_email.toLowerCase().includes(t)) score_a += 2;
          if (a.preview.toLowerCase().includes(t)) score_a += 1;

          if (b.subject.toLowerCase().includes(t)) score_b += 3;
          if (b.sender_name.toLowerCase().includes(t)) score_b += 2;
          if (b.sender_email.toLowerCase().includes(t)) score_b += 2;
          if (b.preview.toLowerCase().includes(t)) score_b += 1;
        }

        if (score_b !== score_a) return score_b - score_a;

        return (
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });
    }

    return results.map((r) => ({
      ...r,
      raw_timestamp: r.timestamp,
      timestamp: format_email_list(new Date(r.timestamp)),
      is_selected: selected_ids.has(r.id),
    }));
  }, [
    state.results,
    filters.read_status,
    filters.exclude_social,
    filters.sort_by,
    selected_ids,
    search_terms,
    format_email_list,
  ]);

  const paged_results = useMemo(() => {
    const start = search_page * SEARCH_PAGE_SIZE;
    const end = start + SEARCH_PAGE_SIZE;

    return filtered_results.slice(start, end);
  }, [filtered_results, search_page]);

  const total_search_pages = Math.max(
    1,
    Math.ceil(filtered_results.length / SEARCH_PAGE_SIZE),
  );
  useEffect(() => {
    const needed = (search_page + 1) * SEARCH_PAGE_SIZE;

    if (
      needed > filtered_results.length &&
      state.has_more &&
      !state.is_loading_more
    ) {
      load_more();
    }
  }, [
    search_page,
    filtered_results.length,
    state.has_more,
    state.is_loading_more,
    load_more,
  ]);

  useEffect(() => {
    set_search_page(0);
  }, [query]);

  const shift_ref = use_shift_key_ref();
  const last_selected_id_ref = useRef<string | null>(null);
  const paged_results_ref = useRef(paged_results);

  paged_results_ref.current = paged_results;

  const handle_toggle_select = useCallback(
    (id: string) => {
      const shift = shift_ref.current;
      const last_id = last_selected_id_ref.current;
      const items = paged_results_ref.current;

      set_selected_ids((prev) => {
        const next = new Set(prev);

        if (shift && last_id !== null && last_id !== id) {
          const last_index = items.findIndex((r) => r.id === last_id);
          const current_index = items.findIndex((r) => r.id === id);

          if (last_index !== -1 && current_index !== -1) {
            const start = Math.min(last_index, current_index);
            const end = Math.max(last_index, current_index);
            const should_select = prev.has(last_id);

            for (let i = start; i <= end; i++) {
              if (should_select) {
                next.add(items[i].id);
              } else {
                next.delete(items[i].id);
              }
            }

            last_selected_id_ref.current = id;

            return next;
          }
        }

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        last_selected_id_ref.current = id;

        return next;
      });
    },
    [shift_ref],
  );

  const handle_email_click = useCallback(
    (id: string) => {
      on_result_click(id);
    },
    [on_result_click],
  );

  const fetch_as_minimal_emails = useCallback(
    async (ids: string[]): Promise<InboxEmail[]> => {
      const loaded = await Promise.all(
        ids.map(async (id) => {
          const res = await get_mail_item(id);

          if (res.error || !res.data) return null;
          const m = res.data;

          return {
            id: m.id,
            encrypted_metadata: m.encrypted_metadata,
            metadata_nonce: m.metadata_nonce,
            metadata_version: m.metadata_version,
            is_read: m.metadata?.is_read ?? true,
            is_starred: m.metadata?.is_starred ?? false,
            is_trashed: m.is_trashed ?? false,
            is_archived: m.metadata?.is_archived ?? false,
            is_spam: m.is_spam ?? false,
          } as unknown as InboxEmail;
        }),
      );

      return loaded.filter((x): x is InboxEmail => x !== null);
    },
    [],
  );

  const handle_select_all_visible = useCallback(() => {
    const items = paged_results_ref.current;

    set_selected_ids((prev) => {
      const all_selected = items.every((r) => prev.has(r.id));

      if (all_selected) {
        const next = new Set(prev);

        for (const r of items) next.delete(r.id);

        return next;
      }
      const next = new Set(prev);

      for (const r of items) next.add(r.id);

      return next;
    });
  }, []);

  const handle_clear_selection = useCallback(() => {
    set_selected_ids(new Set());
    last_selected_id_ref.current = null;
  }, []);

  const handle_bulk_archive = useCallback(async () => {
    const ids = Array.from(selected_ids);

    if (ids.length === 0 || bulk_busy) return;
    set_bulk_busy(true);
    try {
      const emails = await fetch_as_minimal_emails(ids);

      if (emails.length > 0) {
        await email_actions.bulk_archive(emails);
        emit_mail_items_removed({ ids: emails.map((e) => e.id) });
      }
      handle_clear_selection();
    } finally {
      set_bulk_busy(false);
    }
  }, [
    selected_ids,
    bulk_busy,
    fetch_as_minimal_emails,
    email_actions,
    handle_clear_selection,
  ]);

  const handle_bulk_delete = useCallback(async () => {
    const ids = Array.from(selected_ids);

    if (ids.length === 0 || bulk_busy) return;
    set_bulk_busy(true);
    try {
      const emails = await fetch_as_minimal_emails(ids);

      if (emails.length > 0) {
        await email_actions.bulk_delete(emails);
        emit_mail_items_removed({ ids: emails.map((e) => e.id) });
      }
      handle_clear_selection();
    } finally {
      set_bulk_busy(false);
    }
  }, [
    selected_ids,
    bulk_busy,
    fetch_as_minimal_emails,
    email_actions,
    handle_clear_selection,
  ]);

  const run_bulk = useCallback(
    async (fn: (emails: InboxEmail[]) => Promise<unknown>) => {
      const ids = Array.from(selected_ids);

      if (ids.length === 0 || bulk_busy) return;
      set_bulk_busy(true);
      try {
        const emails = await fetch_as_minimal_emails(ids);

        if (emails.length > 0) await fn(emails);
        handle_clear_selection();
      } finally {
        set_bulk_busy(false);
      }
    },
    [selected_ids, bulk_busy, fetch_as_minimal_emails, handle_clear_selection],
  );

  const handle_bulk_mark_read = useCallback(
    () => run_bulk((emails) => email_actions.bulk_mark_read(emails, true)),
    [run_bulk, email_actions],
  );

  const handle_bulk_mark_unread = useCallback(
    () => run_bulk((emails) => email_actions.bulk_mark_read(emails, false)),
    [run_bulk, email_actions],
  );

  const handle_bulk_toggle_star = useCallback(
    () =>
      run_bulk((emails) => {
        const any_unstarred = emails.some((e) => !e.is_starred);

        return email_actions.bulk_star(emails, any_unstarred);
      }),
    [run_bulk, email_actions],
  );

  const handle_bulk_spam = useCallback(
    () =>
      run_bulk(async (emails) => {
        await email_actions.bulk_mark_spam(emails);
        emit_mail_items_removed({ ids: emails.map((e) => e.id) });
      }),
    [run_bulk, email_actions],
  );

  const handle_select_by_filter = useCallback(
    (mode: "all" | "none" | "read" | "unread" | "starred" | "unstarred") => {
      const items = paged_results_ref.current;
      const next = new Set<string>();

      if (mode === "none") {
        set_selected_ids(next);

        return;
      }

      for (const r of items) {
        if (mode === "all") next.add(r.id);
        else if (mode === "read" && r.is_read) next.add(r.id);
        else if (mode === "unread" && !r.is_read) next.add(r.id);
        else if (mode === "starred" && r.is_starred) next.add(r.id);
        else if (mode === "unstarred" && !r.is_starred) next.add(r.id);
      }
      set_selected_ids(next);
    },
    [],
  );

  const active_filter_count = useMemo(() => {
    let count = 0;

    if (filters.date_range !== "any") count++;
    if (filters.has_attachment !== null) count++;
    if (filters.exclude_social) count++;
    if (filters.read_status !== "any") count++;

    return count;
  }, [filters]);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      set_is_dragging(true);
      drag_start_x.current = e.clientX;
      drag_start_width.current = pane_width;
    },
    [pane_width],
  );

  useEffect(() => {
    if (!is_dragging) return;

    const prev_cursor = document.body.style.cursor;
    const prev_user_select = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handle_mouse_move = (e: MouseEvent) => {
      e.preventDefault();
      const delta = e.clientX - drag_start_x.current;
      const max_width = Math.max(MIN_LIST_WIDTH, window.innerWidth - 256 - 360);
      const new_width = Math.max(
        MIN_LIST_WIDTH,
        Math.min(max_width, drag_start_width.current + delta),
      );

      set_pane_width(new_width);
    };

    const handle_mouse_up = () => {
      set_is_dragging(false);
    };

    window.addEventListener("mousemove", handle_mouse_move, { passive: false });
    window.addEventListener("mouseup", handle_mouse_up);

    return () => {
      window.removeEventListener("mousemove", handle_mouse_move);
      window.removeEventListener("mouseup", handle_mouse_up);
      document.body.style.cursor = prev_cursor;
      document.body.style.userSelect = prev_user_select;
    };
  }, [is_dragging]);

  const is_loading =
    state.is_loading || state.is_searching || !has_searched.current;
  const is_split_view = !!split_email_id;
  const is_fullpage_mode = preferences.email_view_mode === "fullpage";

  const selection_all_selected =
    paged_results.length > 0 &&
    paged_results.every((r) => selected_ids.has(r.id));
  const selection_some_selected =
    selected_ids.size > 0 && !selection_all_selected;

  const active_inbox_filter: import("@/types/email").InboxFilterType =
    filters.has_attachment
      ? "attachments"
      : filters.read_status === "read"
        ? "read"
        : filters.read_status === "unread"
          ? "unread"
          : "all";

  const handle_inbox_filter_change = useCallback(
    (f: import("@/types/email").InboxFilterType) => {
      set_filters((prev) => ({
        ...prev,
        read_status: f === "read" ? "read" : f === "unread" ? "unread" : "any",
        has_attachment: f === "attachments" ? true : null,
      }));
    },
    [],
  );

  const search_nav_index = useMemo(() => {
    if (!split_email_id) return -1;
    return filtered_results.findIndex((r) => r.id === split_email_id);
  }, [split_email_id, filtered_results]);

  const search_can_go_prev = search_nav_index > 0;
  const search_can_go_next =
    search_nav_index >= 0 && search_nav_index < filtered_results.length - 1;

  const handle_search_navigate_prev = useCallback(() => {
    if (search_nav_index > 0) {
      on_result_click(filtered_results[search_nav_index - 1].id);
    }
  }, [search_nav_index, filtered_results, on_result_click]);

  const handle_search_navigate_next = useCallback(() => {
    if (
      search_nav_index >= 0 &&
      search_nav_index < filtered_results.length - 1
    ) {
      on_result_click(filtered_results[search_nav_index + 1].id);
    }
  }, [search_nav_index, filtered_results, on_result_click]);

  const show_full_email_viewer = is_fullpage_mode && !!split_email_id;

  const sort_dropdown = (
    <Select
      value={filters.sort_by}
      onValueChange={(v) =>
        set_filters((prev) => ({ ...prev, sort_by: v as SortOption }))
      }
    >
      <SelectTrigger className="h-7 text-[11px] w-auto gap-1 px-2 py-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="relevant">{t("mail.sort_relevance")}</SelectItem>
        <SelectItem value="recent">{t("mail.sort_newest")}</SelectItem>
      </SelectContent>
    </Select>
  );

  const email_list_content = (
    <>
      {is_loading && filtered_results.length === 0 ? (
        <div>
          {Array.from({ length: 10 }).map((_, i) => (
            <SearchResultSkeleton key={i} />
          ))}
        </div>
      ) : state.error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <ExclamationTriangleIcon
              className="w-8 h-8"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {state.error}
          </p>
          <button
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[var(--accent-blue)] text-white hover:opacity-90"
            onClick={() => {
              clear_index();
              perform_search(query);
            }}
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            {t("common.retry")}
          </button>
        </div>
      ) : filtered_results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <MagnifyingGlassIcon
              className="w-8 h-8"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No results found
          </p>
          <p
            className="text-xs text-center max-w-[280px]"
            style={{ color: "var(--text-muted)" }}
          >
            {active_filter_count > 0
              ? "Try adjusting your filters or search for something else"
              : `No emails match "${query}"`}
          </p>
        </div>
      ) : (
        <>
          {paged_results.map((email) => {
            const snippet = extract_snippet(email.preview, search_terms);
            const snippet_highlights = snippet
              ? apply_highlights(
                  snippet,
                  compute_highlight_ranges(snippet, search_terms),
                )
              : [];

            return (
              <InboxEmailListItem
                key={email.id}
                current_view="search"
                density={preferences.density}
                email={email as InboxEmail}
                is_active={email.id === split_email_id}
                on_email_click={handle_email_click}
                on_toggle_select={handle_toggle_select}
                search_preview_node={
                  snippet_highlights.length > 0 ? (
                    <HighlightedText
                      highlights={snippet_highlights}
                      text={snippet}
                    />
                  ) : undefined
                }
                show_email_preview={
                  !is_split_view && preferences.show_email_preview
                }
                show_message_size={preferences.show_message_size}
                show_profile_pictures={preferences.show_profile_pictures}
                show_thread_count={preferences.conversation_grouping !== false}
              />
            );
          })}

          {state.is_loading_more && (
            <div className="flex items-center justify-center py-4">
              <Spinner className="text-[var(--accent-color)]" size="md" />
            </div>
          )}

          {paged_results.length > 0 && (
            <div
              className="text-center py-4 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {total_search_pages > 1
                ? t("mail.use_arrows_to_navigate")
                : t("mail.end_of_results")}
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {!show_full_email_viewer && (
        <div className="flex-shrink-0 min-w-0">
          <InboxHeader
              leading_left_slot={
                <button
                  className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={on_close}
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
              }
              leading_toolbar_slot={sort_dropdown}
              active_filter={active_inbox_filter}
              all_selected={selection_all_selected}
              can_go_next={is_split_view ? search_can_go_next : false}
              can_go_prev={is_split_view ? search_can_go_prev : false}
              current_email_index={is_split_view ? search_nav_index : undefined}
              current_page={search_page}
              filtered_count={filtered_results.length}
              hide_quick_actions={true}
              hide_refresh={true}
              hide_view_switcher={true}
              on_navigate_next={is_split_view ? handle_search_navigate_next : undefined}
              on_navigate_prev={is_split_view ? handle_search_navigate_prev : undefined}
              on_page_change={is_split_view ? undefined : set_search_page}
              page_size={SEARCH_PAGE_SIZE}
              total_email_count={filtered_results.length}
              on_archive={handle_bulk_archive}
              on_delete={handle_bulk_delete}
              on_filter_change={handle_inbox_filter_change}
              on_mark_read={handle_bulk_mark_read}
              on_mark_unread={handle_bulk_mark_unread}
              on_search_result_click={on_result_click}
              on_search_submit={on_search_submit}
              on_select_by_filter={handle_select_by_filter}
              on_settings_click={on_settings_click || (() => {})}
              on_spam={handle_bulk_spam}
              on_toggle_select_all={handle_select_all_visible}
              on_toggle_star={handle_bulk_toggle_star}
              search_context={query}
              selected_count={selected_ids.size}
              some_selected={selection_some_selected}
              view_title={t("common.search")}
            />
        </div>
      )}

      {show_full_email_viewer && split_email_id ? (
        <div className="flex-1 overflow-hidden">
          <FullEmailViewer
            can_go_next={search_can_go_next}
            can_go_prev={search_can_go_prev}
            current_index={search_nav_index >= 0 ? search_nav_index : undefined}
            email_id={split_email_id}
            on_back={on_split_close || (() => {})}
            on_navigate_next={handle_search_navigate_next}
            on_navigate_prev={handle_search_navigate_prev}
            total_count={filtered_results.length}
          />
        </div>
      ) : is_split_view && !is_fullpage_mode ? (
        <div
          className="flex-1 flex min-h-0"
          style={{
            cursor: is_dragging ? "col-resize" : undefined,
            userSelect: is_dragging ? "none" : undefined,
          }}
        >
          <div
            className="overflow-y-auto overflow-x-hidden"
            style={{
              width: pane_width,
              minWidth: MIN_LIST_WIDTH,
              flexShrink: 0,
              flexGrow: 0,
            }}
          >
            {email_list_content}
          </div>
          <div
            className="w-px cursor-col-resize relative transition-colors hover:bg-blue-500"
            role="presentation"
            style={{
              backgroundColor: is_dragging
                ? "var(--accent-blue)"
                : "var(--border-primary)",
              flexShrink: 0,
            }}
            onMouseDown={handle_drag_start}
          >
            <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
          </div>
          <div
            className="overflow-hidden"
            style={{
              flex: 1,
              minWidth: 0,
              pointerEvents: is_dragging ? "none" : "auto",
            }}
          >
            <SplitEmailViewer
              can_go_next={search_can_go_next}
              can_go_prev={search_can_go_prev}
              current_index={search_nav_index >= 0 ? search_nav_index : undefined}
              email_id={split_email_id}
              on_close={on_split_close || (() => {})}
              on_navigate_next={handle_search_navigate_next}
              on_navigate_prev={handle_search_navigate_prev}
              total_count={filtered_results.length}
            />
          </div>
          {is_dragging && (
            <div
              className="fixed inset-0 z-50"
              style={{ cursor: "col-resize" }}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">{email_list_content}</div>
      )}
    </div>
  );
}
