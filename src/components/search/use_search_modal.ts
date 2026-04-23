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
import type { SearchFilters } from "@/services/api/search";
import type { FilterState } from "@/components/search/search_modal_types";
import type { QuickActionHandlers } from "@/components/search/search_result_item";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  use_search,
  type SearchResultItem,
  type AutocompleteSuggestion,
  type SavedSearch,
  type SearchHistoryEntry,
  get_search_history,
  add_to_history,
  remove_from_history,
  get_saved_searches,
  save_search_to_storage,
  delete_saved_search_from_storage,
  update_saved_search_usage,
  clear_search_data,
  extract_query_terms,
} from "@/hooks/use_search";
import { use_folders, type DecryptedFolder } from "@/hooks/use_folders";
import { use_tags } from "@/hooks/use_tags";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_auth } from "@/contexts/auth_context";
import { use_email_actions } from "@/hooks/use_email_actions";
import { search_result_to_inbox_email } from "@/components/search/search_modal_types";

interface UseSearchModalOptions {
  is_open: boolean;
  on_close: () => void;
  initial_query?: string;
  on_initial_query_consumed?: () => void;
  on_search_submit?: (query: string) => void;
  on_result_click?: (id: string) => void;
}

export function use_search_modal({
  is_open,
  on_close,
  initial_query,
  on_initial_query_consumed,
  on_search_submit,
  on_result_click,
}: UseSearchModalOptions) {
  const navigate = useNavigate();
  const { user } = use_auth();
  const {
    state,
    autocomplete_state,
    search,
    clear_results,
    load_more,
    set_query,
    get_autocomplete,
    select_autocomplete,
    clear_autocomplete,
  } = use_search();

  const { state: folders_state } = use_folders();
  const { state: tags_state } = use_tags();

  const label_name_to_tokens = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const folder of folders_state.folders) {
      if (folder.is_system) continue;
      const name_lower = folder.name.toLowerCase();
      const existing = map.get(name_lower) || [];

      existing.push(folder.folder_token);
      map.set(name_lower, existing);
    }
    for (const tag of tags_state.tags) {
      const name_lower = tag.name.toLowerCase();
      const existing = map.get(name_lower) || [];

      existing.push(tag.tag_token);
      map.set(name_lower, existing);
    }

    return map;
  }, [folders_state.folders, tags_state.tags]);

  const [selected_index, set_selected_index] = useState(-1);
  const [show_filters, set_show_filters] = useState(false);
  const [show_autocomplete, set_show_autocomplete] = useState(false);
  const [filters, set_filters] = useState<FilterState>({
    fields: ["all"],
    has_attachments: undefined,
    is_starred: undefined,
    date_from: "",
    date_to: "",
    scope: "all",
    search_content: true,
    from: "",
    to: "",
    subject: "",
    has_words: "",
    does_not_have: "",
    size_op: "greater",
    size_value: "",
    size_unit: "mb",
    within_days: "",
  });
  const [search_history, set_search_history] = useState<SearchHistoryEntry[]>(
    [],
  );
  const [saved_searches, set_saved_searches] = useState<SavedSearch[]>([]);
  const [show_save_dialog, set_show_save_dialog] = useState(false);
  const [show_clear_menu, set_show_clear_menu] = useState(false);
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

  useEffect(() => {
    if (!user?.id || !is_open) return;

    const load_search_data = async () => {
      const [history, saved] = await Promise.all([
        get_search_history(user.id),
        get_saved_searches(user.id),
      ]);

      set_search_history(history);
      set_saved_searches(saved);
    };

    load_search_data();
  }, [user?.id, is_open]);

  useEffect(() => {
    if (is_open && initial_query) {
      set_query(initial_query);
      search(initial_query, { fields: filters.fields, label_name_to_tokens });
      on_initial_query_consumed?.();
    }
  }, [
    is_open,
    initial_query,
    set_query,
    search,
    filters.fields,
    on_initial_query_consumed,
  ]);

  const handle_history_select = useCallback(
    async (query: string) => {
      set_query(query);
      search(query, { fields: filters.fields, label_name_to_tokens });
    },
    [set_query, search, filters.fields, label_name_to_tokens],
  );

  const handle_history_remove = useCallback(
    async (entry_id: string) => {
      if (!user?.id) return;
      const updated = await remove_from_history(user.id, entry_id);

      set_search_history(updated);
    },
    [user?.id],
  );

  const handle_clear_all_history = useCallback(async () => {
    if (!user?.id) return;
    await clear_search_data(user.id, {
      clear_history: true,
      clear_saved_searches: false,
      clear_cache: false,
    });
    set_search_history([]);
  }, [user?.id]);

  const handle_saved_search_select = useCallback(
    async (saved: SavedSearch) => {
      if (!user?.id) return;
      await update_saved_search_usage(user.id, saved.id);
      set_query(saved.query);
      search(saved.query, { fields: filters.fields });
    },
    [user?.id, set_query, search, filters.fields],
  );

  const handle_saved_search_delete = useCallback(
    async (search_id: string) => {
      if (!user?.id) return;
      const updated = await delete_saved_search_from_storage(
        user.id,
        search_id,
      );

      set_saved_searches(updated);
    },
    [user?.id],
  );

  const handle_save_search = useCallback(
    async (name: string) => {
      if (!user?.id || !state.query) return;
      const result = await save_search_to_storage(user.id, name, state.query);

      if (result.success && result.search) {
        set_saved_searches((prev) => [result.search!, ...prev]);
      }
      set_show_save_dialog(false);
    },
    [user?.id, state.query],
  );

  const handle_clear_data = useCallback(
    async (options: { history: boolean; saved: boolean; cache: boolean }) => {
      if (!user?.id) return;
      await clear_search_data(user.id, {
        clear_history: options.history,
        clear_saved_searches: options.saved,
        clear_cache: options.cache,
      });

      if (options.history) {
        set_search_history([]);
      }
      if (options.saved) {
        set_saved_searches([]);
      }
      if (options.cache) {
        clear_results();
      }
    },
    [user?.id, clear_results],
  );

  const query_terms = useMemo(
    () => extract_query_terms(state.query),
    [state.query],
  );

  const filtered_folders = useMemo(() => {
    if (!state.query || state.query.length < 2) return [];
    const raw_lower = state.query.toLowerCase();
    const folder_op_match = raw_lower.match(/^folder:["']?([^"']+)["']?$/);
    const query_lower = folder_op_match ? folder_op_match[1].trim() : raw_lower;

    return folders_state.folders.filter((folder) => {
      if (folder.is_system) return false;
      if (!folder.name.toLowerCase().includes(query_lower)) return false;
      if (
        folder.is_password_protected &&
        folder.password_set &&
        !is_folder_unlocked(folder.id)
      ) {
        return false;
      }

      return true;
    });
  }, [state.query, folders_state.folders]);

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

  const handle_folder_click = useCallback(
    (folder: DecryptedFolder) => {
      on_close();
      navigate(`/folder/${encodeURIComponent(folder.folder_token)}`);
    },
    [on_close, navigate],
  );

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
      set_query(query);
      search(query, { fields: filters.fields, label_name_to_tokens });
    },
    [set_query, search, filters.fields, label_name_to_tokens],
  );

  const handle_close = useCallback(async () => {
    if (user?.id && state.query && filtered_results.length > 0) {
      const updated = await add_to_history(
        user.id,
        state.query,
        filtered_results.length,
      );

      set_search_history(updated);
    }
    clear_results();
    clear_autocomplete();
    set_selected_index(-1);
    set_show_filters(false);
    set_show_autocomplete(false);
    set_show_clear_menu(false);
    set_local_updates(new Map());
    on_close();
  }, [
    clear_results,
    clear_autocomplete,
    on_close,
    user?.id,
    state.query,
    filtered_results.length,
  ]);

  const effective_fields = useMemo(() => {
    if (filters.search_content) return filters.fields;
    if (filters.fields.includes("all")) {
      return ["subject", "sender", "recipient"] as typeof filters.fields;
    }

    return filters.fields.filter((f) => f !== "body");
  }, [filters.fields, filters.search_content]);

  const handle_search = useCallback(
    (query: string) => {
      const search_filters: SearchFilters = {};

      if (filters.has_attachments !== undefined) {
        search_filters.has_attachments = filters.has_attachments;
      }
      if (filters.is_starred !== undefined) {
        search_filters.is_starred = filters.is_starred;
      }
      if (filters.date_from) {
        search_filters.date_from = filters.date_from;
      }
      if (filters.date_to) {
        search_filters.date_to = filters.date_to;
      }

      search(query, {
        fields: effective_fields,
        filters:
          Object.keys(search_filters).length > 0 ? search_filters : undefined,
        label_name_to_tokens,
      });
    },
    [search, filters, effective_fields, label_name_to_tokens],
  );

  const debounce_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounce_ref.current) {
        clearTimeout(debounce_ref.current);
      }
    };
  }, []);

  const handle_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;

      set_query(query);
      set_selected_index(-1);

      if (query.length >= 2 && !filtered_results.length) {
        set_show_autocomplete(true);
        get_autocomplete(query, filters.fields[0]);
      } else {
        set_show_autocomplete(false);
        clear_autocomplete();
      }

      if (debounce_ref.current) {
        clearTimeout(debounce_ref.current);
      }
      debounce_ref.current = setTimeout(() => {
        handle_search(query);
      }, 220);
    },
    [
      set_query,
      handle_search,
      get_autocomplete,
      clear_autocomplete,
      filters.fields,
      filtered_results.length,
    ],
  );

  const build_advanced_query = useCallback((): string => {
    const parts: string[] = [];
    const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);

    if (filters.from.trim()) parts.push(`from:${quote(filters.from.trim())}`);
    if (filters.to.trim()) parts.push(`to:${quote(filters.to.trim())}`);
    if (filters.subject.trim())
      parts.push(`subject:${quote(filters.subject.trim())}`);
    if (filters.has_words.trim()) parts.push(filters.has_words.trim());
    if (filters.does_not_have.trim()) {
      const neg = filters.does_not_have
        .trim()
        .split(/\s+/)
        .map((w) => `-${w}`)
        .join(" ");

      parts.push(neg);
    }
    if (filters.has_attachments) parts.push("has:attachment");
    if (filters.scope && filters.scope !== "all")
      parts.push(`in:${filters.scope}`);

    if (filters.size_value) {
      const n = parseInt(filters.size_value, 10);

      if (!isNaN(n) && n > 0) {
        const unit_bytes =
          filters.size_unit === "mb"
            ? n * 1024 * 1024
            : filters.size_unit === "kb"
              ? n * 1024
              : n;

        parts.push(
          `${filters.size_op === "greater" ? "larger" : "smaller"}:${unit_bytes}`,
        );
      }
    }

    if (filters.within_days) {
      const days = parseInt(filters.within_days, 10);

      if (!isNaN(days) && days > 0) {
        const d = new Date();

        d.setDate(d.getDate() - days);
        parts.push(`after:${d.toISOString().slice(0, 10)}`);
      }
    }
    if (filters.date_from) parts.push(`after:${filters.date_from}`);
    if (filters.date_to) parts.push(`before:${filters.date_to}`);

    return parts.join(" ").trim();
  }, [filters]);

  const handle_autocomplete_select = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      set_query(suggestion.text);
      set_show_autocomplete(false);
      clear_autocomplete();
      handle_search(suggestion.text);
    },
    [set_query, handle_search, clear_autocomplete],
  );

  const handle_result_click = useCallback(
    (mail_id: string) => {
      handle_close();
      if (on_result_click) {
        on_result_click(mail_id);
      }
    },
    [handle_close, on_result_click],
  );

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent) => {
      const suggestions_count = autocomplete_state.suggestions.length;
      const results_count = filtered_results.length;

      if (show_autocomplete && suggestions_count > 0) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            select_autocomplete(
              autocomplete_state.selected_index < suggestions_count - 1
                ? autocomplete_state.selected_index + 1
                : autocomplete_state.selected_index,
            );

            return;

          case "ArrowUp":
            e.preventDefault();
            select_autocomplete(
              autocomplete_state.selected_index > 0
                ? autocomplete_state.selected_index - 1
                : -1,
            );

            return;

          case "Enter":
            e.preventDefault();
            if (autocomplete_state.selected_index >= 0) {
              handle_autocomplete_select(
                autocomplete_state.suggestions[
                  autocomplete_state.selected_index
                ],
              );
            } else {
              set_show_autocomplete(false);
              if (on_search_submit && state.query) {
                on_search_submit(state.query);
              } else {
                handle_search(state.query);
              }
            }

            return;

          case "Escape":
            e.preventDefault();
            set_show_autocomplete(false);
            clear_autocomplete();

            return;

          case "Tab":
            e.preventDefault();
            if (autocomplete_state.selected_index >= 0) {
              handle_autocomplete_select(
                autocomplete_state.suggestions[
                  autocomplete_state.selected_index
                ],
              );
            }

            return;
        }
      }

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
          if (
            state.query &&
            selected_index >= 0 &&
            selected_index < results_count
          ) {
            handle_result_click(filtered_results[selected_index].id);
          } else if (state.query && on_search_submit) {
            on_search_submit(state.query);
          } else if (state.query) {
            handle_search(state.query);
          }
          break;

        case "Escape":
          e.preventDefault();
          handle_close();
          break;

        case "Tab":
          if (e.shiftKey) {
            e.preventDefault();
            set_show_filters((prev) => !prev);
          }
          break;
      }
    },
    [
      filtered_results,
      state.query,
      selected_index,
      handle_result_click,
      handle_search,
      handle_close,
      show_autocomplete,
      autocomplete_state,
      select_autocomplete,
      handle_autocomplete_select,
      clear_autocomplete,
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
      !state.is_loading_more
    ) {
      load_more();
    }
  }, [state.has_more, state.is_searching, state.is_loading_more, load_more]);

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

  useEffect(() => {
    if (!state.query) return;
    const handle = setTimeout(() => handle_search(state.query), 220);

    return () => clearTimeout(handle);
  }, [
    filters.has_attachments,
    filters.is_starred,
    filters.date_from,
    filters.date_to,
    filters.fields,
    filters.search_content,
  ]);

  return {
    state,
    filters,
    set_filters,
    show_filters,
    show_save_dialog,
    set_show_save_dialog,
    show_clear_menu,
    set_show_clear_menu,
    input_ref,
    results_container_ref,
    filtered_results,
    filtered_folders,
    query_terms,
    quick_action_handlers,
    search_history,
    saved_searches,
    handle_close,
    handle_search,
    handle_input_change,
    handle_key_down,
    handle_result_click,
    handle_folder_click,
    handle_quick_search,
    handle_history_select,
    handle_history_remove,
    handle_clear_all_history,
    handle_saved_search_select,
    handle_saved_search_delete,
    handle_save_search,
    handle_clear_data,
    set_query,
    set_show_filters,
    clear_results,
    load_more,
    on_search_submit,
    build_advanced_query,
  };
}
