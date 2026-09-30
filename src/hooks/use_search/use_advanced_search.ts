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

import { useState, useCallback, useMemo } from "react";

import {
  AdvancedSearchState,
  QuickFilter,
  SearchScope,
  SortOption,
} from "./types";
import { use_search } from "./use_search_hook";

import {
  parse_search_query,
  get_quick_filters,
} from "@/utils/search_operators";
import { app_locale } from "@/utils/date_format";
export function use_advanced_search() {
  const [raw_query, set_raw_query_state] = useState("");
  const [sort_option, set_sort_option_state] =
    useState<SortOption>("relevance");
  const [search_scope, set_search_scope_state] = useState<SearchScope>({
    type: "all",
  });

  const {
    state: underlying,
    search: underlying_search,
    clear_results: underlying_clear,
    load_more: underlying_load_more,
  } = use_search();

  const parsed = parse_search_query(raw_query);

  const sorted_results = useMemo(() => {
    if (sort_option === "relevance") return underlying.results;

    const next = [...underlying.results];

    if (sort_option === "sender") {
      next.sort((a, b) =>
        (a.sender_name || a.sender_email).localeCompare(
          b.sender_name || b.sender_email,
          app_locale(),
        ),
      );

      return next;
    }

    next.sort((a, b) => {
      const a_time = new Date(a.timestamp).getTime();
      const b_time = new Date(b.timestamp).getTime();

      return sort_option === "date_oldest" ? a_time - b_time : b_time - a_time;
    });

    return next;
  }, [underlying.results, sort_option]);

  const state: AdvancedSearchState = {
    raw_query,
    text_query: parsed.text_query,
    results: sorted_results,
    is_loading: underlying.is_loading,
    is_searching: underlying.is_searching,
    has_more: underlying.has_more,
    total_results: underlying.total_results,
    search_time_ms: underlying.search_time_ms,
    error: underlying.error,
    active_filters: parsed.operators.map((op) => ({
      id: `${op.type}-${op.value}`,
      label: `${op.negated ? "-" : ""}${op.type}:${op.value}`,
      removable: true,
    })),
    sort_option,
    search_scope,
    result_folders: new Map(),
  };

  const quick_filters: QuickFilter[] = get_quick_filters();

  const search = useCallback(
    (query: string) => {
      underlying_search(query, { fields: ["all"] });
    },
    [underlying_search],
  );

  const apply_query = useCallback(
    (next: string) => {
      set_raw_query_state(next);
      underlying_search(next, { fields: ["all"] });
    },
    [underlying_search],
  );

  const remove_token = (query: string, token: string): string =>
    query
      .split(/\s+/)
      .filter((part) => part && part !== token)
      .join(" ");

  const remove_filter = useCallback(
    (id: string) => {
      const target = state.active_filters.find((filter) => filter.id === id);

      if (!target) return;

      apply_query(remove_token(raw_query, target.label));
    },
    [state.active_filters, raw_query, apply_query],
  );

  const add_quick_filter = useCallback(
    (operator: string) => {
      const tokens = raw_query.split(/\s+/).filter(Boolean);

      if (tokens.includes(operator)) {
        apply_query(remove_token(raw_query, operator));

        return;
      }
      apply_query(raw_query ? `${raw_query} ${operator}` : operator);
    },
    [raw_query, apply_query],
  );

  return {
    state,
    search,
    clear_results: () => {
      set_raw_query_state("");
      underlying_clear();
    },
    remove_filter,
    add_quick_filter,
    set_sort_option: set_sort_option_state,
    set_search_scope: set_search_scope_state,
    set_raw_query: set_raw_query_state,
    quick_filters,
    navigate_to_result: (_id: string) => {},
    load_more: underlying_load_more,
  };
}
