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
import type { MailItem } from "@/services/api/mail";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";

import {
  SLOW_SEARCH_MS,
  SearchFiltersState,
  SearchResultsPageProps,
} from "./helpers";

import { list_mail_items } from "@/services/api/mail";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";
import { use_email_actions } from "@/hooks/use_email_actions";
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { use_search, extract_query_terms } from "@/hooks/use_search";
import { use_preferences } from "@/contexts/preferences_context";
import { use_date_format } from "@/hooks/use_date_format";
import { use_i18n } from "@/lib/i18n/context";
import { resolve_effective_page_size } from "@/lib/inbox_page_size";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";
import { use_split_pane } from "@/components/email/inbox/use_split_pane";
import { filter_locked_folder_emails } from "@/services/locked_folders";

export function use_search_results_page(props: SearchResultsPageProps) {
  const { query, on_result_click, split_email_id, on_split_close } = props;

  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const search_page_size = resolve_effective_page_size(
    preferences.inbox_page_size,
    preferences.low_network_mode,
  );
  const { format_email_list } = use_date_format();
  const {
    state,
    search,
    dismiss_correction,
    load_more,
    set_query,
    clear_results,
    clear_index,
  } = use_search();
  const email_actions = use_email_actions();
  const [bulk_busy, set_bulk_busy] = useState(false);
  const [is_slow, set_is_slow] = useState(false);
  const content_search_enabled = preferences.search_encrypted_content;

  const [filters, set_filters] = useState<SearchFiltersState>({
    date_range: "any",
    has_attachment: null,
    exclude_social: false,
    read_status: "any",
    sort_by: "relevant",
  });

  const [advanced_open, set_advanced_open] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [search_page, set_search_page] = useState(0);

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
          const target_day = month_ago.getDate();

          month_ago.setDate(1);
          month_ago.setMonth(month_ago.getMonth() - 1);
          month_ago.setDate(
            Math.min(
              target_day,
              new Date(
                month_ago.getFullYear(),
                month_ago.getMonth() + 1,
                0,
              ).getDate(),
            ),
          );
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

  const handle_disable_content_search = useCallback(() => {
    update_preference("search_encrypted_content", false, true);
    clear_index();
    perform_search(query);
  }, [update_preference, clear_index, perform_search, query]);

  const searching_now = state.is_searching || state.index_building;

  useEffect(() => {
    if (!searching_now) {
      set_is_slow(false);

      return;
    }
    const id = setTimeout(() => set_is_slow(true), SLOW_SEARCH_MS);

    return () => clearTimeout(id);
  }, [searching_now]);

  const search_terms = useMemo(() => extract_query_terms(query), [query]);

  const filtered_results = useMemo(() => {
    let results = filter_locked_folder_emails([...state.results]);

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
    const start = search_page * search_page_size;
    const end = start + search_page_size;

    return filtered_results.slice(start, end);
  }, [filtered_results, search_page, search_page_size]);

  const total_search_pages = Math.max(
    1,
    Math.ceil(filtered_results.length / search_page_size),
  );

  useEffect(() => {
    if (
      search_page > 0 &&
      search_page >= total_search_pages &&
      !state.has_more &&
      !state.is_loading_more
    ) {
      set_search_page(total_search_pages - 1);
    }
  }, [search_page, total_search_pages, state.has_more, state.is_loading_more]);
  useEffect(() => {
    const needed = (search_page + 1) * search_page_size;

    if (
      needed > filtered_results.length &&
      state.has_more &&
      !state.is_loading_more
    ) {
      load_more();
    }
  }, [
    search_page,
    search_page_size,
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
      const FETCH_CHUNK_SIZE = 100;
      const items: MailItem[] = [];

      for (let i = 0; i < ids.length; i += FETCH_CHUNK_SIZE) {
        const slice = ids.slice(i, i + FETCH_CHUNK_SIZE);
        const res = await list_mail_items({ ids: slice });

        if (res.data) items.push(...res.data.items);
      }

      const loaded = await Promise.all(
        items.map(async (m) => {
          let metadata = m.metadata ?? null;

          if (!metadata && m.encrypted_metadata && m.metadata_nonce) {
            try {
              metadata = await decrypt_mail_metadata(
                m.encrypted_metadata,
                m.metadata_nonce,
                m.metadata_version,
              );
            } catch {
              metadata = null;
            }
          }

          return {
            id: m.id,
            item_type: m.item_type,
            thread_token: m.thread_token,
            thread_message_count: m.thread_message_count,
            encrypted_metadata: m.encrypted_metadata,
            metadata_nonce: m.metadata_nonce,
            metadata_version: m.metadata_version,
            is_read: m.is_read === true || (metadata?.is_read ?? false),
            is_starred: metadata?.is_starred ?? false,
            is_trashed:
              m.is_trashed === true || (metadata?.is_trashed ?? false),
            is_archived:
              m.is_archived === true || (metadata?.is_archived ?? false),
            is_spam: m.is_spam === true || (metadata?.is_spam ?? false),
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
    () =>
      run_bulk((emails) => {
        const markable = emails.filter((e) => e.item_type !== "sent");

        if (markable.length === 0) return Promise.resolve();

        return email_actions.bulk_mark_read(markable, false);
      }),
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

  const is_loading =
    state.is_loading || state.is_searching || !has_searched.current;
  const is_split_view = !!split_email_id;

  const {
    is_dragging,
    pane_width,
    list_panel_ref,
    detail_panel_ref,
    handle_drag_start,
  } = use_split_pane({
    is_bottom_pane: false,
    is_split_view,
    on_split_close,
    split_pane_height: preferences.split_pane_height ?? 0,
    split_pane_width: preferences.split_pane_width ?? 0,
    update_preference,
  });
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

  return {
    t,
    preferences,
    search_page_size,
    state,
    search,
    dismiss_correction,
    clear_index,
    email_actions,
    is_slow,
    content_search_enabled,
    filters,
    set_filters,
    advanced_open,
    set_advanced_open,
    selected_ids,
    set_selected_ids,
    search_page,
    set_search_page,
    perform_search,
    handle_disable_content_search,
    search_terms,
    filtered_results,
    paged_results,
    total_search_pages,
    handle_toggle_select,
    handle_email_click,
    fetch_as_minimal_emails,
    handle_select_all_visible,
    handle_bulk_archive,
    handle_bulk_delete,
    handle_bulk_mark_read,
    handle_bulk_mark_unread,
    handle_bulk_toggle_star,
    handle_bulk_spam,
    handle_select_by_filter,
    active_filter_count,
    is_loading,
    is_dragging,
    pane_width,
    list_panel_ref,
    detail_panel_ref,
    handle_drag_start,
    is_fullpage_mode,
    selection_all_selected,
    selection_some_selected,
    active_inbox_filter,
    handle_inbox_filter_change,
    search_nav_index,
    search_can_go_prev,
    search_can_go_next,
    handle_search_navigate_prev,
    handle_search_navigate_next,
    show_full_email_viewer,
  };
}
