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
import type { QuickActionHandlers } from "@/components/search/search_result_item";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  use_advanced_search,
  type SearchResultItem,
  extract_query_terms,
} from "@/hooks/use_search";
import { use_folders } from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_email_actions } from "@/hooks/use_email_actions";
import { search_result_to_inbox_email } from "@/components/search/search_modal_types";

interface UseAdvancedSearchModalOptions {
  is_open: boolean;
  on_close: () => void;
  on_result_click?: (id: string) => void;
  on_search_submit?: (query: string) => void;
}

export function use_advanced_search_modal({
  is_open,
  on_close,
  on_result_click,
  on_search_submit,
}: UseAdvancedSearchModalOptions) {
  const {
    state,
    search,
    clear_results,
    add_quick_filter,
    set_sort_option,
    set_search_scope,
    set_raw_query,
    quick_filters,
    load_more,
  } = use_advanced_search();
  const navigate = useNavigate();

  const remove_filter = useCallback(
    (id: string) => {
      const target = state.active_filters.find((f) => f.id === id);

      if (!target) return;

      const token = target.label;
      const next = state.raw_query
        .split(/\s+/)
        .filter((w) => w !== token)
        .join(" ")
        .trim();

      set_raw_query(next);
      search(next);
    },
    [state.active_filters, state.raw_query, set_raw_query, search],
  );
  const { state: folders_state } = use_folders();

  const [selected_index, set_selected_index] = useState(-1);
  const [show_operator_hints, set_show_operator_hints] = useState(false);
  const [local_updates, set_local_updates] = useState<
    Map<string, Partial<SearchResultItem>>
  >(new Map());
  const input_ref = useRef<HTMLInputElement>(null);
  const results_container_ref = useRef<HTMLDivElement>(null);

  const update_result_locally = useCallback(
    (id: string, updates: Partial<SearchResultItem>) => {
      set_local_updates((prev) => {
        const next = new Map(prev);
        const existing = next.get(id) || {};

        next.set(id, { ...existing, ...updates });

        return next;
      });
    },
    [],
  );

  const remove_result_locally = useCallback((id: string) => {
    set_local_updates((prev) => {
      const next = new Map(prev);

      next.set(id, { __removed: true } as Partial<SearchResultItem> & {
        __removed?: boolean;
      });

      return next;
    });
  }, []);

  const { toggle_star, toggle_read, archive_email, delete_email } =
    use_email_actions({
      on_optimistic_update: update_result_locally,
      on_remove_from_list: remove_result_locally,
    });

  const locked_folder_tokens = useMemo(() => {
    const tokens = new Set<string>();

    for (const folder of folders_state.folders) {
      if (
        folder.is_password_protected &&
        folder.password_set &&
        !is_folder_unlocked(folder.id)
      ) {
        tokens.add(folder.folder_token);
      }
    }

    return tokens;
  }, [folders_state.folders]);

  const filtered_results = useMemo(() => {
    let results = state.results;

    if (locked_folder_tokens.size > 0) {
      results = results.filter((result) => {
        if (!result.folders || result.folders.length === 0) return true;

        return !result.folders.some((f) =>
          locked_folder_tokens.has(f.folder_token),
        );
      });
    }

    if (local_updates.size > 0) {
      results = results
        .map((result) => {
          const updates = local_updates.get(result.id);

          if (!updates) return result;
          if ((updates as { __removed?: boolean }).__removed) return null;

          return { ...result, ...updates };
        })
        .filter((r): r is SearchResultItem => r !== null);
    }

    return results;
  }, [state.results, locked_folder_tokens, local_updates]);

  const query_terms = useMemo(
    () => extract_query_terms(state.raw_query),
    [state.raw_query],
  );

  const handle_close = useCallback(() => {
    clear_results();
    set_selected_index(-1);
    set_show_operator_hints(false);
    set_local_updates(new Map());
    on_close();
  }, [clear_results, on_close]);

  const quick_action_handlers: QuickActionHandlers = useMemo(
    () => ({
      on_archive: (result) => {
        archive_email(search_result_to_inbox_email(result));
      },
      on_delete: (result) => {
        delete_email(search_result_to_inbox_email(result));
      },
      on_toggle_star: (result) => {
        toggle_star(search_result_to_inbox_email(result));
      },
      on_toggle_read: (result) => {
        toggle_read(search_result_to_inbox_email(result));
      },
    }),
    [archive_email, delete_email, toggle_star, toggle_read],
  );

  const handle_quick_search = useCallback(
    (query: string) => {
      set_raw_query(query);
      search(query);
    },
    [set_raw_query, search],
  );

  const handle_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;

      set_raw_query(query);
      set_selected_index(-1);
      search(query);

      const last_char = query.slice(-1);

      set_show_operator_hints(
        query.length > 0 &&
          (last_char === " " || query.split(/\s+/).pop()?.length === 1),
      );
    },
    [set_raw_query, search],
  );

  const handle_operator_select = useCallback(
    (operator: string) => {
      const current_words = state.raw_query.split(/\s+/);
      const last_word = current_words.pop() || "";

      let new_query: string;

      if (last_word.length > 0 && !last_word.includes(":")) {
        new_query = [...current_words, operator].join(" ");
      } else {
        new_query = state.raw_query.trim() + " " + operator;
      }

      set_raw_query(new_query.trim());
      search(new_query.trim());
      set_show_operator_hints(false);
      input_ref.current?.focus();
    },
    [state.raw_query, set_raw_query, search],
  );

  const handle_result_click = useCallback(
    (mail_id: string) => {
      handle_close();
      if (on_result_click) {
        on_result_click(mail_id);
      } else {
        navigate(`/email/${mail_id}`);
      }
    },
    [handle_close, on_result_click, navigate],
  );

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent) => {
      const results_count = filtered_results.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          set_selected_index((prev) =>
            prev < results_count - 1 ? prev + 1 : prev,
          );
          break;

        case "ArrowUp":
          e.preventDefault();
          set_selected_index((prev) => (prev > 0 ? prev - 1 : -1));
          break;

        case "Enter":
          e.preventDefault();
          if (selected_index >= 0 && selected_index < results_count) {
            handle_result_click(filtered_results[selected_index].id);
          } else if (state.raw_query.trim().length > 0) {
            const q = state.raw_query.trim();

            handle_close();
            if (on_search_submit) {
              on_search_submit(q);
            } else {
              navigate(`/?q=${encodeURIComponent(q)}`);
            }
          }
          break;

        case "Escape":
          e.preventDefault();
          handle_close();
          break;
      }
    },
    [
      filtered_results,
      selected_index,
      handle_result_click,
      handle_close,
      state.raw_query,
      navigate,
      on_search_submit,
    ],
  );

  const handle_scroll = useCallback(() => {
    const container = results_container_ref.current;

    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const near_bottom = scrollHeight - scrollTop - clientHeight < 100;

    if (
      near_bottom &&
      state.has_more &&
      !state.is_searching &&
      !state.is_loading
    ) {
      load_more();
    }
  }, [state.has_more, state.is_searching, state.is_loading, load_more]);

  useEffect(() => {
    if (is_open && input_ref.current) {
      input_ref.current.focus();
    }
  }, [is_open]);

  useEffect(() => {
    set_selected_index(-1);
  }, [filtered_results]);

  useEffect(() => {
    if (state.results.length === 0) {
      set_local_updates(new Map());
    }
  }, [state.results.length]);

  useEffect(() => {
    const container = results_container_ref.current;

    if (!container) return;

    container.addEventListener("scroll", handle_scroll);

    return () => container.removeEventListener("scroll", handle_scroll);
  }, [handle_scroll]);

  const is_quick_filter_active = useCallback(
    (operator: string) => {
      return state.raw_query.includes(operator);
    },
    [state.raw_query],
  );

  const show_empty_state =
    state.text_query &&
    !state.is_loading &&
    !state.is_searching &&
    filtered_results.length === 0 &&
    !state.error;

  return {
    state,
    filtered_results,
    query_terms,
    quick_action_handlers,
    show_operator_hints,
    show_empty_state,
    input_ref,
    results_container_ref,
    quick_filters,
    is_quick_filter_active,
    handle_close,
    handle_input_change,
    handle_operator_select,
    handle_key_down,
    handle_result_click,
    handle_quick_search,
    set_raw_query,
    clear_results,
    load_more,
    search,
    remove_filter,
    add_quick_filter,
    set_sort_option,
    set_search_scope,
  };
}
