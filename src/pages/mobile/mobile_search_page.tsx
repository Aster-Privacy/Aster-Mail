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
import type { TranslationKey } from "@/lib/i18n/types";
import type { InboxEmail } from "@/types/email";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { use_search } from "@/hooks/use_search";
import { use_email_actions } from "@/hooks/use_email_actions";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { MobileHeader } from "@/components/mobile/mobile_header";
import { MobileEmailRow } from "@/components/mobile/mobile_email_row";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_preferences } from "@/contexts/preferences_context";
import { resolve_effective_page_size } from "@/lib/inbox_page_size";
import { filter_locked_folder_emails } from "@/services/locked_folders";
import {
  rescope_search_query,
  scope_search_query,
  search_placeholder_label_key,
  search_scope_chips,
  type SearchViewScope,
} from "@/utils/search_query";
import {
  clear_filter_operators,
  count_filter_operators,
  ends_with_bare_operator,
} from "@/utils/search_operators";
import {
  apply_mobile_filter,
  is_mobile_filter_active,
  type MobileSearchFilter,
} from "@/pages/mobile/mobile_search_filters";

const FILTERS: { id: MobileSearchFilter; label: TranslationKey }[] = [
  { id: "all", label: "mail.all" },
  { id: "unread", label: "mail.unread" },
  { id: "attachments", label: "mail.attachments" },
  { id: "starred", label: "mail.starred" },
];

function MobileSearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav_state = location.state as {
    search_query?: string;
    search_view?: string;
  } | null;
  const search_view = nav_state?.search_view;
  const initial_query = scope_search_query(
    nav_state?.search_query || "",
    search_view,
  );
  const scope_label_key = search_placeholder_label_key(search_view);
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const search = use_search();
  const { preferences } = use_preferences();
  const page_size = resolve_effective_page_size(
    preferences.inbox_page_size,
    preferences.low_network_mode,
  );
  const input_ref = useRef<HTMLInputElement>(null);
  const [query, set_query] = useState(initial_query);
  const [submitted_query, set_submitted_query] = useState(initial_query);
  const [did_search, set_did_search] = useState(false);
  const [visible_count, set_visible_count] = useState(page_size);
  const [star_overrides, set_star_overrides] = useState<
    Record<string, boolean>
  >({});
  const actions = use_email_actions();

  useEffect(() => {
    if (initial_query) return;
    const timer = setTimeout(() => {
      input_ref.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [initial_query]);

  useEffect(() => {
    if (!initial_query) return;
    set_query(initial_query);
    set_submitted_query(initial_query);
    set_star_overrides({});
    set_did_search(true);
    search.search(initial_query);
  }, [initial_query]);

  const handle_back = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const run_search = useCallback(
    (next: string) => {
      set_query(next);
      set_submitted_query(next);
      set_star_overrides({});
      set_did_search(true);
      search.search(next);
    },
    [search],
  );

  const handle_search = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim() && !ends_with_bare_operator(query)) {
        run_search(scope_search_query(query, search_view));
      }
    },
    [query, search_view, run_search],
  );

  const apply_rewritten_query = useCallback(
    (rewritten: string) => {
      const next = scope_search_query(rewritten, search_view);

      if (next) {
        run_search(next);

        return;
      }
      set_query("");
      set_submitted_query("");
      set_star_overrides({});
      set_did_search(false);
      search.clear_results();
    },
    [search_view, run_search, search],
  );

  const handle_filter_press = useCallback(
    (filter: MobileSearchFilter) => {
      apply_rewritten_query(apply_mobile_filter(submitted_query, filter));
    },
    [submitted_query, apply_rewritten_query],
  );

  const handle_clear_filters = useCallback(() => {
    apply_rewritten_query(clear_filter_operators(submitted_query));
  }, [submitted_query, apply_rewritten_query]);

  const active_filter_count = count_filter_operators(submitted_query);

  const scope_chips = search_scope_chips(submitted_query, search_view);

  const handle_scope_change = useCallback(
    (scope: SearchViewScope) => {
      if (!search_view) return;
      run_search(rescope_search_query(submitted_query, search_view, scope));
    },
    [search_view, submitted_query, run_search],
  );

  const handle_clear = useCallback(() => {
    set_query("");
    set_submitted_query("");
    set_star_overrides({});
    set_did_search(false);
    search.clear_results();
    input_ref.current?.focus();
  }, [search]);

  const handle_email_press = useCallback(
    (id: string) => {
      navigate(`/email/${id}`, { state: { from_view: "search" } });
    },
    [navigate],
  );

  const handle_toggle_star = useCallback(
    async (email: InboxEmail) => {
      const next = !email.is_starred;

      set_star_overrides((prev) => ({ ...prev, [email.id]: next }));

      const succeeded = await actions.toggle_star(email);

      if (!succeeded) {
        set_star_overrides((prev) => ({ ...prev, [email.id]: !next }));
      }
    },
    [actions],
  );

  const filtered_results = useMemo(
    () =>
      filter_locked_folder_emails(
        (search.state.results ?? []) as InboxEmail[],
      ).map((email) =>
        email.id in star_overrides
          ? { ...email, is_starred: star_overrides[email.id] }
          : email,
      ),
    [search.state.results, star_overrides],
  );

  useEffect(() => {
    set_visible_count(page_size);
  }, [search.state.results, page_size]);

  const paged_results = useMemo(
    () => filtered_results.slice(0, visible_count),
    [filtered_results, visible_count],
  );

  const handle_load_more = useCallback(() => {
    set_visible_count((prev) =>
      Math.min(prev + page_size, filtered_results.length),
    );
  }, [filtered_results.length, page_size]);

  const is_loading = search.state.is_searching || search.state.index_building;
  const has_results = filtered_results.length > 0;
  const has_searched =
    did_search ||
    (search.state.results ?? []).length > 0 ||
    search.state.is_searching ||
    search.state.index_building;
  const is_empty_after_search =
    !is_loading && !search.state.error && has_searched && !has_results;
  const is_index_pending = is_empty_after_search && search.state.index_pending;
  const is_no_results = is_empty_after_search && !search.state.index_pending;

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full flex-col"
      initial={reduce_motion ? false : { opacity: 0, x: 20 }}
      transition={
        reduce_motion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
      }
    >
      <MobileHeader on_back={handle_back} title={t("common.search")} />

      <form
        className="flex items-center gap-2 border-b border-[var(--border-primary)] px-4 py-2"
        onSubmit={handle_search}
      >
        <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
        <Input
          ref={input_ref}
          className="min-w-0 flex-1 bg-transparent"
          placeholder={
            scope_label_key
              ? `${t("mail.search_in")} ${t(scope_label_key)}`
              : t("mail.search_messages")
          }
          type="text"
          value={query}
          onChange={(e) => set_query(e.target.value)}
        />
        <button
          aria-label={t("common.clear")}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-tertiary)] transition-opacity ${query ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          type="button"
          onClick={handle_clear}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </form>

      {has_searched && (
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-primary)] px-4 py-2">
          {scope_chips.length > 0 && (
            <>
              {scope_chips.map((chip) => (
                <button
                  key={chip.scope}
                  aria-pressed={chip.is_active}
                  className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                    chip.is_active
                      ? "bg-[var(--accent-color,#3b82f6)] text-[var(--accent-fg,#ffffff)]"
                      : "border border-[var(--border-primary)] text-[var(--text-secondary)]"
                  }`}
                  type="button"
                  onClick={() => {
                    if (!chip.is_active) handle_scope_change(chip.scope);
                  }}
                >
                  {chip.folder_label_key
                    ? t(chip.label_key, { value: t(chip.folder_label_key) })
                    : t(chip.label_key)}
                </button>
              ))}
              <span className="w-px shrink-0 self-stretch bg-[var(--border-primary)]" />
            </>
          )}
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              aria-pressed={is_mobile_filter_active(submitted_query, filter.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                is_mobile_filter_active(submitted_query, filter.id)
                  ? "bg-[var(--accent-color,#3b82f6)] text-[var(--accent-fg,#ffffff)]"
                  : "border border-[var(--border-primary)] text-[var(--text-secondary)]"
              }`}
              data-filter={filter.id}
              type="button"
              onClick={() => handle_filter_press(filter.id)}
            >
              {t(filter.label)}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {is_loading && (
          <div className="flex flex-col items-center justify-center gap-3 pt-20">
            <Spinner size="lg" />
            <p className="text-[14px] text-[var(--text-muted)]">
              {t("common.searching")}
            </p>
          </div>
        )}

        {!is_loading && !has_searched && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-20">
            <MagnifyingGlassIcon className="h-16 w-16 text-[var(--text-muted)] opacity-40" />
            <p className="text-center text-[15px] text-[var(--text-muted)]">
              {t("mail.search_messages")}
            </p>
          </div>
        )}

        {!is_loading && search.state.error && !has_results && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-20">
            <p className="text-center text-[15px] text-[var(--text-muted)]">
              {t("common.something_went_wrong_try_again")}
            </p>
          </div>
        )}

        {is_index_pending && (
          <div
            className="flex flex-col items-center justify-center gap-3 px-8 pt-20"
            data-testid="mobile-search-indexing"
          >
            <Spinner size="lg" />
            <p className="text-center text-[15px] font-medium text-[var(--text-primary)]">
              {t("mail.indexing_messages")}
            </p>
            <p className="text-center text-[14px] text-[var(--text-muted)]">
              {t("mail.message_download_count", {
                done: search.state.indexed_count,
              })}
            </p>
          </div>
        )}

        {is_no_results && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-20">
            <p className="text-center text-[15px] font-medium text-[var(--text-primary)]">
              {t("mail.no_results_found")}
            </p>
            {active_filter_count > 0 && (
              <p className="text-center text-[14px] text-[var(--text-muted)]">
                {t("mail.search_filters_active")}
              </p>
            )}
            {active_filter_count > 0 && (
              <button
                className="text-[14px] font-medium text-[var(--accent-color,#3b82f6)]"
                data-testid="mobile-search-clear-filters"
                type="button"
                onClick={handle_clear_filters}
              >
                {t("mail.clear_filters")}
              </button>
            )}
          </div>
        )}

        {!is_loading &&
          paged_results.map((email) => (
            <MobileEmailRow
              key={email.id}
              email={email}
              on_press={handle_email_press}
              on_toggle_star={handle_toggle_star}
            />
          ))}

        {!is_loading && paged_results.length < filtered_results.length && (
          <button
            className="w-full py-4 text-center text-[14px] font-medium text-[var(--accent-color,#3b82f6)]"
            type="button"
            onClick={handle_load_more}
          >
            {t("mail.load_more_results", {
              remaining: filtered_results.length - paged_results.length,
            })}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default MobileSearchPage;
