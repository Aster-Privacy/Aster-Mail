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

import { useState, useCallback, useEffect, useRef } from "react";

import {
  INDEX_TTL_MS,
  INDEX_TTL_MS_LOW_NETWORK,
  MAX_SEARCH_RESULTS,
} from "./constants";
import {
  build_search_index,
  mark_search_index_stale,
  reset_index_cache,
} from "./index_cache";
import {
  matches_query,
  query_requires_body,
  to_search_result,
} from "./matching";
import { emit_indexing, subscribe_index_refresh } from "./progress";
import { scan_search_index } from "./scan";
import {
  PROGRESS_FLUSH_MS,
  can_refine_scan,
  candidates_are_cacheable,
  excluded_by_mailbox_scope,
  options_signature,
  passes_search_filters,
  resolve_mailbox_scope,
} from "./scan_cache";
import {
  AppliedCorrection,
  AutocompleteState,
  DecryptedIndexEntry,
  ScanCacheEntry,
  ScanCandidate,
  SearchOptions,
  SearchResultItem,
  SearchState,
} from "./types";

import { type MailItem } from "@/services/api/mail";
import { parse_search_query } from "@/utils/search_operators";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { build_chunk_skip_plan } from "@/services/search_chunk_filter";
import {
  reset_index_download_state,
  set_index_download_paused,
} from "@/services/search/index_download_control";
import {
  MIN_CORRECTED_RESULTS,
  remember_never_correct_term,
  suggest_query_correction,
} from "@/services/search/spelling";
import { MAIL_EVENTS } from "@/hooks/mail_events";

export function use_search() {
  const { user } = use_auth();
  const { t } = use_i18n();
  const { preferences } = use_preferences();

  const ttl = preferences.low_network_mode
    ? INDEX_TTL_MS_LOW_NETWORK
    : INDEX_TTL_MS;
  const [state, set_state] = useState<SearchState>({
    query: "",
    results: [],
    results_query: "",
    correction: null,
    is_loading: false,
    is_searching: false,
    is_loading_more: false,
    has_more: false,
    total_results: 0,
    search_time_ms: 0,
    error: null,
    index_building: false,
    hidden_spam_trash: 0,
  });

  const abort_ref = useRef<AbortController | null>(null);
  const search_seq_ref = useRef(0);
  const search_ref = useRef<
    (
      query: string,
      options?: SearchOptions,
      applied_correction?: AppliedCorrection,
    ) => Promise<void>
  >(async () => {});
  const last_scan_ref = useRef<ScanCacheEntry | null>(null);
  const last_search_ref = useRef<{
    query: string;
    options?: SearchOptions;
  } | null>(null);

  const [autocomplete_state] = useState<AutocompleteState>({
    suggestions: [],
    selected_index: -1,
  });

  const clear_index = useCallback(() => {
    reset_index_cache();
    last_scan_ref.current = null;
    reset_index_download_state();
    emit_indexing({ building: false, current: 0, total: 0 });
  }, []);

  useEffect(() => {
    const handle_mail_changed = () => {
      mark_search_index_stale();
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_mail_changed);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_mail_changed);
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_mail_changed);
    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEMS_REMOVED,
      handle_mail_changed,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.EMAIL_RECEIVED,
        handle_mail_changed,
      );
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_mail_changed);
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_mail_changed,
      );
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEMS_REMOVED,
        handle_mail_changed,
      );
    };
  }, []);

  const search = useCallback(
    async (
      query: string,
      options?: SearchOptions,
      applied_correction?: AppliedCorrection,
    ) => {
      const my_seq = ++search_seq_ref.current;

      set_state((prev) => ({
        ...prev,
        query,
        is_searching: true,
        error: null,
      }));

      if (!query || query.length < 2) {
        last_search_ref.current = null;
        last_scan_ref.current = null;
        abort_ref.current?.abort();
        abort_ref.current = null;
        set_state((prev) => ({
          ...prev,
          results: [],
          results_query: query,
          correction: null,
          is_searching: false,
          total_results: 0,
          search_time_ms: 0,
          hidden_spam_trash: 0,
        }));

        return;
      }

      if (!applied_correction) {
        last_search_ref.current = { query, options };
      }
      abort_ref.current?.abort();

      const controller = new AbortController();

      abort_ref.current = controller;

      const start = Date.now();

      try {
        const parsed = parse_search_query(query);
        const terms = parsed.text_query
          .split(/\s+/)
          .filter((t) => t.length >= 2)
          .map((t) => t.toLowerCase());
        const operators = parsed.operators;

        if (terms.length === 0 && operators.length === 0) {
          last_scan_ref.current = null;
          controller.abort();
          set_state((prev) => ({
            ...prev,
            results: [],
            results_query: query,
            correction: null,
            is_searching: false,
            total_results: 0,
            search_time_ms: Date.now() - start,
            hidden_spam_trash: 0,
          }));

          return;
        }

        set_state((prev) => ({ ...prev, index_building: true }));

        const search_body =
          options?.search_body !== false &&
          query_requires_body(terms, operators);
        const index = await build_search_index(
          user?.email || "",
          search_body,
          ttl,
        );

        set_state((prev) => ({ ...prev, index_building: false }));

        if (controller.signal.aborted) return;

        const candidates: ScanCandidate[] = [];
        const mailbox_scope = resolve_mailbox_scope(operators);
        const counts = { visible: 0, hidden: 0 };

        const visible_candidates = (): ScanCandidate[] =>
          candidates.filter((candidate) => !candidate.excluded_by_scope);

        const sorted_results = (): SearchResultItem[] =>
          visible_candidates()
            .map((candidate) => candidate.result)
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            );

        const visit = (item: MailItem, data: DecryptedIndexEntry): boolean => {
          const { envelope, metadata, search_body_text } = data;

          if (
            !matches_query(
              terms,
              operators,
              envelope,
              metadata,
              item,
              options?.label_name_to_tokens,
              options?.fields,
              options?.search_body !== false,
              search_body_text,
            )
          ) {
            return true;
          }

          if (!passes_search_filters(item, metadata, options?.filters)) {
            return true;
          }

          const excluded = excluded_by_mailbox_scope(item, mailbox_scope);

          candidates.push({
            item,
            entry: data,
            result: to_search_result(item, envelope, metadata),
            excluded_by_scope: excluded,
          });

          if (excluded) {
            counts.hidden++;

            return true;
          }

          counts.visible++;

          return counts.visible < MAX_SEARCH_RESULTS;
        };

        let last_flush = 0;

        const flush_progress = () => {
          if (controller.signal.aborted) return;

          const now = Date.now();

          if (now - last_flush < PROGRESS_FLUSH_MS) return;

          last_flush = now;

          const partial = sorted_results();

          set_state((prev) => {
            if (my_seq !== search_seq_ref.current) return prev;

            return {
              ...prev,
              results: partial,
              results_query: query,
              total_results: partial.length,
              search_time_ms: now - start,
              hidden_spam_trash: counts.hidden,
            };
          });
        };

        const options_key = options_signature(options);
        const reusable = last_scan_ref.current;

        let stopped = false;

        if (can_refine_scan(reusable, terms, operators, options_key, index)) {
          for (const candidate of reusable!.candidates) {
            if (!visit(candidate.item, candidate.entry)) {
              stopped = true;
              break;
            }
          }
        } else {
          const probe_terms =
            options?.search_body === false ||
            (!index.include_body && index.meta?.include_body !== true);

          stopped = await scan_search_index(
            index,
            visit,
            () => controller.signal.aborted,
            {
              skip: build_chunk_skip_plan({
                terms,
                operators,
                filters: options?.filters,
                label_name_to_tokens: options?.label_name_to_tokens,
                probe_terms,
              }),
              on_chunk: flush_progress,
            },
          );
        }

        if (controller.signal.aborted) return;

        const results = sorted_results();
        const total_results = results.length;

        if (results.length > MAX_SEARCH_RESULTS) {
          results.length = MAX_SEARCH_RESULTS;
        }

        if (
          !applied_correction &&
          total_results === 0 &&
          terms.length > 0 &&
          index.complete
        ) {
          const correction = suggest_query_correction(query, terms);

          if (correction) {
            last_scan_ref.current = null;
            void search_ref.current(correction.corrected_query, options, {
              original_query: query,
              corrected_query: correction.corrected_query,
              original_term: correction.original_term,
              corrected_term: correction.corrected_term,
            });

            return;
          }
        }

        const correction_held =
          applied_correction && total_results >= MIN_CORRECTED_RESULTS
            ? applied_correction
            : null;

        last_scan_ref.current =
          stopped || !candidates_are_cacheable(candidates)
            ? null
            : {
                terms,
                operators,
                options_key,
                built_at: index.built_at,
                saved_at: index.meta?.saved_at ?? 0,
                candidates,
              };

        set_state((prev) => {
          if (my_seq !== search_seq_ref.current) return prev;

          if (applied_correction && !correction_held) {
            return {
              ...prev,
              query: applied_correction.original_query,
              results: [],
              results_query: applied_correction.original_query,
              correction: null,
              is_searching: false,
              total_results: 0,
              search_time_ms: Date.now() - start,
              has_more: false,
              hidden_spam_trash: 0,
            };
          }

          return {
            ...prev,
            results,
            results_query: query,
            correction: correction_held,
            is_searching: false,
            total_results,
            search_time_ms: Date.now() - start,
            has_more: stopped && total_results >= MAX_SEARCH_RESULTS,
            hidden_spam_trash: counts.hidden,
          };
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (my_seq !== search_seq_ref.current) return;

        const message = err instanceof Error ? err.message : "";

        if (message === "search_index_cancelled") {
          set_state((prev) => ({
            ...prev,
            is_searching: false,
            index_building: false,
          }));

          return;
        }

        const is_fetch_error = message.startsWith("search_fetch_failed:");

        set_state((prev) => ({
          ...prev,
          is_searching: false,
          index_building: false,
          error: is_fetch_error
            ? t("common.search_load_failed_try_again")
            : t("common.search_failed_try_again"),
        }));
      }
    },
    [user?.email, ttl, t],
  );

  search_ref.current = search;

  const correction_ref = useRef<AppliedCorrection | null>(null);

  correction_ref.current = state.correction;

  const dismiss_correction = useCallback(() => {
    const correction = correction_ref.current;

    if (!correction) return;

    remember_never_correct_term(correction.original_term);
    set_state((prev) => ({ ...prev, correction: null }));
    void search_ref.current(
      correction.original_query,
      last_search_ref.current?.options,
    );
  }, []);

  useEffect(() => {
    return subscribe_index_refresh(() => {
      const last = last_search_ref.current;

      if (last) void search(last.query, last.options);
    });
  }, [search]);

  const clear_results = useCallback(() => {
    last_search_ref.current = null;
    last_scan_ref.current = null;
    set_state({
      query: "",
      results: [],
      results_query: "",
      correction: null,
      is_loading: false,
      is_searching: false,
      is_loading_more: false,
      has_more: false,
      total_results: 0,
      search_time_ms: 0,
      error: null,
      index_building: false,
      hidden_spam_trash: 0,
    });
  }, []);

  const set_query = useCallback((query: string) => {
    set_state((prev) => {
      if (prev.query === query) return prev;
      abort_ref.current?.abort();

      const cleared = query.length < 2;

      return {
        ...prev,
        query,
        is_searching: cleared ? prev.is_searching : true,
        results: cleared ? [] : prev.results,
        results_query: cleared ? "" : prev.results_query,
        correction: cleared ? null : prev.correction,
        total_results: cleared ? 0 : prev.total_results,
      };
    });
  }, []);

  const start_index_build = useCallback(
    (include_body: boolean) => {
      set_index_download_paused(false);
      build_search_index(user?.email || "", include_body, ttl).catch(() => {
        // first real search will surface the error
      });
    },
    [user?.email, ttl],
  );

  return {
    state,
    autocomplete_state,
    search,
    dismiss_correction,
    clear_results,
    clear_index,
    start_index_build,
    load_more: () => {},
    set_query,
    navigate_to_result: (_id: string) => {},
    get_autocomplete: (_query: string, _field?: string) => {},
    select_autocomplete: (_index: number) => {},
    clear_autocomplete: () => {},
  };
}
