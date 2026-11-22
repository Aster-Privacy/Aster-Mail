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
import type { InboxEmail, InboxFilterType } from "@/types/email";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";

import {
  SLOW_SEARCH_MS,
  SearchFiltersState,
  SearchResultsPageProps,
} from "./helpers";
import { group_search_results, expand_thread_ids } from "./thread_grouping";
import { apply_header_filter, header_filter_for_query } from "./header_filter";
import { use_search_delete } from "./use_search_delete";
import {
  selection_folder_status,
  selection_tag_status,
  tags_from_tokens,
} from "./selection_membership";

import { count_filter_operators } from "@/utils/search_operators";
import { build_label_name_to_tokens } from "@/utils/search_query";
import { fetch_minimal_emails } from "@/services/fetch_minimal_emails";
import { use_email_actions } from "@/hooks/use_email_actions";
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { use_auto_advance } from "@/components/email/hooks/use_auto_advance";
import { use_search, extract_query_terms } from "@/hooks/use_search";
import { use_preferences } from "@/contexts/preferences_context";
import { use_date_format } from "@/hooks/use_date_format";
import { use_i18n } from "@/lib/i18n/context";
import { resolve_effective_page_size } from "@/lib/inbox_page_size";
import { use_shift_key_ref } from "@/lib/use_shift_range_select";
import { type ListToggleOptions } from "@/lib/list_click_selection";
import { use_split_pane } from "@/components/email/inbox/use_split_pane";
import { filter_locked_folder_emails } from "@/services/locked_folders";
import { show_toast } from "@/components/toast/simple_toast";
import { on_user_opened_mail } from "@/services/user_opened_mail";
import { use_tags } from "@/hooks/use_tags";
import { use_folders } from "@/hooks/use_folders";
import { use_folder_tag_actions } from "@/components/email/inbox/use_folder_tag_actions";
import {
  bin_source_of,
  move_out_of_bin,
  type BinSource,
} from "@/hooks/email_actions/move_out_of_bin";
import { emit_mail_changed } from "@/hooks/email_action_types";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";

export function use_search_results_page(props: SearchResultsPageProps) {
  const {
    query,
    search_nonce,
    on_result_click,
    on_search_submit,
    split_email_id,
    on_split_close,
  } = props;

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
    apply_flag_patch,
    remove_results,
    apply_membership_patch,
  } = use_search();
  const { state: tags_state } = use_tags();
  const { state: folders_state } = use_folders();
  const tags_lookup = useMemo(() => {
    const lookup = new Map<
      string,
      { name: string; color?: string; icon?: string }
    >();

    for (const tag of tags_state.tags) {
      lookup.set(tag.tag_token, {
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      });
    }

    return lookup;
  }, [tags_state.tags]);
  const folders_lookup = useMemo(() => {
    const lookup = new Map<string, { name: string; color?: string }>();

    for (const folder of folders_state.folders) {
      lookup.set(folder.folder_token, {
        name: folder.name,
        color: folder.color,
      });
    }

    return lookup;
  }, [folders_state.folders]);
  const label_name_to_tokens = useMemo(
    () => build_label_name_to_tokens(folders_state.folders, tags_state.tags),
    [folders_state.folders, tags_state.tags],
  );
  const email_actions = use_email_actions();
  const [bulk_busy, set_bulk_busy] = useState(false);
  const [is_slow, set_is_slow] = useState(false);
  const content_search_enabled = preferences.search_encrypted_content;
  const conversation_grouping = preferences.conversation_grouping !== false;

  const [filters, set_filters] = useState<SearchFiltersState>({
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
    } else {
      clear_results();
    }
  }, [query, search_nonce]);

  useEffect(() => {
    return () => {
      clear_results();
    };
  }, []);

  const perform_search = useCallback(
    (search_query: string) => {
      search(search_query, {
        fields: ["all"],
        search_body: content_search_enabled,
        label_name_to_tokens,
      });
    },
    [search, content_search_enabled, label_name_to_tokens],
  );

  const content_search_ref = useRef(content_search_enabled);

  useEffect(() => {
    if (content_search_ref.current === content_search_enabled) return;

    content_search_ref.current = content_search_enabled;

    if (query) {
      perform_search(query);
    }
  }, [content_search_enabled]);

  const handle_enable_content_search = useCallback(() => {
    update_preference("search_encrypted_content", true, true);
  }, [update_preference]);

  const handle_disable_content_search = useCallback(() => {
    update_preference("search_encrypted_content", false, true);
  }, [update_preference]);

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
    const results = filter_locked_folder_emails([...state.results]);

    if (filters.sort_by === "recent") {
      results.sort((a, b) => {
        const date_a = new Date(a.timestamp).getTime();
        const date_b = new Date(b.timestamp).getTime();

        return date_b - date_a;
      });
    } else {
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

    const dated = results.map((r) => ({
      ...r,
      tags: tags_from_tokens(r.tag_tokens, tags_lookup),
      raw_timestamp: r.timestamp,
      timestamp: format_email_list(new Date(r.timestamp)),
    }));
    const grouped = group_search_results(dated, conversation_grouping);

    return grouped.map((r) => ({
      ...r,
      is_selected: selected_ids.has(r.id),
    }));
  }, [
    state.results,
    filters.sort_by,
    selected_ids,
    search_terms,
    format_email_list,
    conversation_grouping,
    tags_lookup,
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

  const shift_ref = use_shift_key_ref();
  const last_selected_id_ref = useRef<string | null>(null);
  const opened_anchor_ref = useRef<string | null>(null);

  useEffect(() => {
    set_search_page(0);
    set_selected_ids(new Set());
    last_selected_id_ref.current = null;
    opened_anchor_ref.current = null;
  }, [query]);

  useEffect(() => {
    set_search_page(0);
  }, [filters.sort_by]);

  const paged_results_ref = useRef(paged_results);

  paged_results_ref.current = paged_results;

  const handle_toggle_select = useCallback(
    (id: string, options?: ListToggleOptions) => {
      const shift = options?.range ?? shift_ref.current;
      const opened_id = opened_anchor_ref.current;

      opened_anchor_ref.current = null;
      const anchor_from_open = shift && opened_id !== null;
      const last_id = anchor_from_open
        ? opened_id
        : last_selected_id_ref.current;
      const items = paged_results_ref.current;

      set_selected_ids((prev) => {
        const next = new Set(prev);

        if (shift && last_id !== null && last_id !== id) {
          const last_index = items.findIndex((r) => r.id === last_id);
          const current_index = items.findIndex((r) => r.id === id);

          if (last_index !== -1 && current_index !== -1) {
            const start = Math.min(last_index, current_index);
            const end = Math.max(last_index, current_index);
            const should_select = anchor_from_open || prev.has(last_id);

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

  const open_result = useCallback(
    (id: string) => {
      on_user_opened_mail(id, {
        delay: preferences.mark_as_read_delay,
        conversation_grouping: preferences.conversation_grouping,
        row: filtered_results_ref.current.find((r) => r.id === id),
      });
      on_result_click(id);
    },
    [
      on_result_click,
      preferences.mark_as_read_delay,
      preferences.conversation_grouping,
    ],
  );

  const handle_email_click = useCallback(
    (id: string) => {
      opened_anchor_ref.current = id;
      open_result(id);
    },
    [open_result],
  );

  const fetch_as_minimal_emails = useCallback(
    (ids: string[]) => fetch_minimal_emails(ids),
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

  const filtered_results_ref = useRef(filtered_results);

  filtered_results_ref.current = filtered_results;

  const expand_selection = useCallback(
    (ids: string[]): string[] =>
      expand_thread_ids(filtered_results_ref.current, ids),
    [],
  );

  const handle_clear_selection = useCallback(() => {
    set_selected_ids(new Set());
    last_selected_id_ref.current = null;
  }, []);

  const update_result_membership = useCallback(
    (id: string, updates: Partial<InboxEmail>) => {
      const row = filtered_results_ref.current.find((r) => r.id === id);
      const member_ids = expand_selection([id]);

      if (updates.tags !== undefined) {
        const before = new Set((row?.tags ?? []).map((tag) => tag.id));
        const after = new Set(updates.tags.map((tag) => tag.id));

        apply_membership_patch(member_ids, {
          add_tag_tokens: [...after].filter((token) => !before.has(token)),
          remove_tag_tokens: [...before].filter((token) => !after.has(token)),
        });
      }
      if (updates.folders !== undefined) {
        const before = new Set(
          (row?.folders ?? []).map((folder) => folder.folder_token),
        );
        const after = updates.folders.map((folder) => folder.folder_token);
        const adds = after.some((token) => !before.has(token));

        apply_membership_patch(
          member_ids,
          adds
            ? {
                folders: updates.folders.map((folder) => ({
                  folder_token: folder.folder_token,
                  name: folder.name,
                })),
              }
            : {
                remove_folder_tokens: [...before].filter(
                  (token) => !after.includes(token),
                ),
              },
        );
      }
    },
    [expand_selection, apply_membership_patch],
  );

  const noop_remove = useCallback(() => {}, []);

  const action_rows = useMemo(
    () => filtered_results as unknown as InboxEmail[],
    [filtered_results],
  );

  const folder_action_rows = useMemo(
    () =>
      action_rows.map((row) =>
        row.is_selected && bin_source_of(row, "search")
          ? { ...row, is_selected: false }
          : row,
      ),
    [action_rows],
  );

  const membership_options = {
    t,
    current_view: "search",
    update_email: update_result_membership,
    remove_email: noop_remove,
    conversation_grouping: preferences.conversation_grouping,
    folders_lookup,
    tags_lookup,
    is_drafts_view: false,
    is_scheduled_view: false,
  };

  const tag_actions = use_folder_tag_actions({
    ...membership_options,
    email_state: { emails: action_rows, total_messages: action_rows.length },
  });

  const folder_actions = use_folder_tag_actions({
    ...membership_options,
    email_state: {
      emails: folder_action_rows,
      total_messages: folder_action_rows.length,
    },
  });

  const get_tag_status_for_selection = useCallback(
    (tag_token: string) =>
      selection_tag_status(filtered_results, selected_ids, tag_token),
    [filtered_results, selected_ids],
  );

  const get_folder_status_for_selection = useCallback(
    (folder_token: string) =>
      selection_folder_status(filtered_results, selected_ids, folder_token),
    [filtered_results, selected_ids],
  );

  const handle_bulk_tag_toggle = useCallback(
    async (tag_token: string) => {
      if (selected_ids.size === 0 || bulk_busy) return;
      set_bulk_busy(true);
      try {
        await tag_actions.handle_toolbar_toggle_tag(
          tag_token,
          get_tag_status_for_selection(tag_token) === "all",
        );
      } finally {
        set_bulk_busy(false);
      }
    },
    [selected_ids, bulk_busy, tag_actions, get_tag_status_for_selection],
  );

  const handle_bulk_folder_toggle = useCallback(
    async (folder_token: string) => {
      if (selected_ids.size === 0 || bulk_busy) return;
      const should_remove =
        get_folder_status_for_selection(folder_token) === "all";
      const bin_groups = new Map<BinSource, InboxEmail[]>();

      if (!should_remove) {
        for (const row of action_rows) {
          if (!row.is_selected) continue;
          const source = bin_source_of(row, "search");

          if (!source) continue;
          bin_groups.set(source, [...(bin_groups.get(source) ?? []), row]);
        }
      }

      set_bulk_busy(true);
      try {
        await folder_actions.handle_toolbar_toggle_folder(
          folder_token,
          should_remove,
        );

        if (bin_groups.size > 0) {
          let failed = false;

          for (const [source, emails] of bin_groups) {
            const result = await move_out_of_bin({
              emails,
              source,
              target_folder_token: folder_token,
              conversation_grouping: preferences.conversation_grouping,
            });

            if (result.failed.length > 0 || result.filing_failed) {
              failed = true;
            }
          }
          if (failed) {
            show_toast(t("common.failed_to_update"), "error");
          }
          emit_mail_changed();
          invalidate_mail_stats();
          perform_search(query);
        }
      } finally {
        set_bulk_busy(false);
      }
    },
    [
      selected_ids,
      bulk_busy,
      action_rows,
      folder_actions,
      get_folder_status_for_selection,
      preferences.conversation_grouping,
      perform_search,
      query,
      t,
    ],
  );

  const handle_bulk_archive = useCallback(async () => {
    const ids = expand_selection(Array.from(selected_ids));

    if (ids.length === 0 || bulk_busy) return;
    set_bulk_busy(true);
    try {
      const { emails, failed } = await fetch_as_minimal_emails(ids);

      if (failed) {
        show_toast(t("common.something_went_wrong_try_again"), "error");

        return;
      }
      if (emails.length > 0) {
        const archived = await email_actions.bulk_archive(emails);

        if (archived) {
          apply_flag_patch(
            emails.map((e) => e.id),
            { is_archived: true, is_trashed: false, is_spam: false },
          );
          emit_mail_items_removed({ ids: emails.map((e) => e.id) });
        }
      }
      handle_clear_selection();
    } finally {
      set_bulk_busy(false);
    }
  }, [
    apply_flag_patch,
    selected_ids,
    bulk_busy,
    fetch_as_minimal_emails,
    email_actions,
    handle_clear_selection,
    expand_selection,
    t,
  ]);

  const { delete_emails, search_delete_dialog } = use_search_delete({
    t,
    bulk_delete: email_actions.bulk_delete,
    apply_flag_patch,
    remove_results,
    confirm_before_permanent_delete:
      preferences.confirm_before_permanent_delete,
  });

  const handle_bulk_delete = useCallback(async () => {
    const ids = expand_selection(Array.from(selected_ids));

    if (ids.length === 0 || bulk_busy) return;
    set_bulk_busy(true);
    try {
      const { emails, failed } = await fetch_as_minimal_emails(ids);

      if (failed) {
        show_toast(t("common.something_went_wrong_try_again"), "error");

        return;
      }
      if (emails.length > 0) await delete_emails(emails);
      handle_clear_selection();
    } finally {
      set_bulk_busy(false);
    }
  }, [
    delete_emails,
    selected_ids,
    bulk_busy,
    fetch_as_minimal_emails,
    handle_clear_selection,
    expand_selection,
    t,
  ]);

  const run_bulk = useCallback(
    async (fn: (emails: InboxEmail[]) => Promise<unknown>) => {
      const ids = expand_selection(Array.from(selected_ids));

      if (ids.length === 0 || bulk_busy) return;
      set_bulk_busy(true);
      try {
        const { emails, failed } = await fetch_as_minimal_emails(ids);

        if (failed) {
          show_toast(t("common.something_went_wrong_try_again"), "error");

          return;
        }
        if (emails.length > 0) await fn(emails);
        handle_clear_selection();
      } finally {
        set_bulk_busy(false);
      }
    },
    [
      selected_ids,
      bulk_busy,
      fetch_as_minimal_emails,
      handle_clear_selection,
      expand_selection,
      t,
    ],
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
        const marked = await email_actions.bulk_mark_spam(emails);

        if (marked) {
          apply_flag_patch(
            emails.map((e) => e.id),
            { is_spam: true, is_trashed: false },
          );
          emit_mail_items_removed({ ids: emails.map((e) => e.id) });
        }
      }),
    [run_bulk, email_actions, apply_flag_patch],
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

  const active_filter_count = useMemo(
    () => count_filter_operators(query),
    [query],
  );

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

  const active_inbox_filter = useMemo(
    () => header_filter_for_query(query),
    [query],
  );

  const handle_inbox_filter_change = useCallback(
    (f: InboxFilterType) => {
      on_search_submit?.(apply_header_filter(query, f));
    },
    [on_search_submit, query],
  );

  const search_nav_index = useMemo(() => {
    if (!split_email_id) return -1;

    return filtered_results.findIndex(
      (r) =>
        r.id === split_email_id ||
        (r.grouped_email_ids?.includes(split_email_id) ?? false),
    );
  }, [split_email_id, filtered_results]);

  const synced_nav_id_ref = useRef<string | null>(null);

  useEffect(() => {
    if (!split_email_id || search_nav_index < 0) return;
    if (synced_nav_id_ref.current === split_email_id) return;
    synced_nav_id_ref.current = split_email_id;
    const target_page = Math.floor(search_nav_index / search_page_size);

    set_search_page((current) =>
      current === target_page ? current : target_page,
    );
  }, [split_email_id, search_nav_index, search_page_size]);

  const search_can_go_prev = search_nav_index > 0;
  const search_can_go_next =
    search_nav_index >= 0 && search_nav_index < filtered_results.length - 1;

  const handle_search_navigate_prev = useCallback(() => {
    if (search_nav_index > 0) {
      open_result(filtered_results[search_nav_index - 1].id);
    }
  }, [search_nav_index, filtered_results, open_result]);

  const handle_search_navigate_next = useCallback(() => {
    if (
      search_nav_index >= 0 &&
      search_nav_index < filtered_results.length - 1
    ) {
      open_result(filtered_results[search_nav_index + 1].id);
    }
  }, [search_nav_index, filtered_results, open_result]);

  const search_result_ids = useMemo(
    () => filtered_results.map((r) => r.id),
    [filtered_results],
  );

  const on_email_list_change = props.on_email_list_change;

  useEffect(() => {
    if (!on_email_list_change) return;
    const grouped_ids_map: Record<string, string[] | undefined> = {};

    for (const result of filtered_results) {
      grouped_ids_map[result.id] = result.grouped_email_ids;
    }
    on_email_list_change(search_result_ids, undefined, grouped_ids_map);
  }, [on_email_list_change, search_result_ids, filtered_results]);

  const handle_search_auto_advance = use_auto_advance({
    email_ids: search_result_ids,
    current_index: search_nav_index,
    navigate_to: on_result_click,
  });

  const show_full_email_viewer = is_fullpage_mode && !!split_email_id;

  return {
    t,
    preferences,
    search_page_size,
    state,
    search,
    dismiss_correction,
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
    apply_flag_patch,
    handle_disable_content_search,
    handle_enable_content_search,
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
    delete_emails,
    search_delete_dialog,
    handle_bulk_mark_read,
    handle_bulk_mark_unread,
    handle_bulk_toggle_star,
    handle_bulk_spam,
    handle_bulk_tag_toggle,
    handle_bulk_folder_toggle,
    get_tag_status_for_selection,
    get_folder_status_for_selection,
    tags_state,
    folders_state,
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
    handle_search_auto_advance,
    show_full_email_viewer,
  };
}
