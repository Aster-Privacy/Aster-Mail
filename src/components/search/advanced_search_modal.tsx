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
import type { AdvancedSearchModalProps } from "@/components/search/search_modal_types";

import { motion, AnimatePresence } from "framer-motion";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  SearchResultSkeleton,
  EmptySearchState,
  FirstTimeSearchState,
} from "@/components/search/search_results_list";
import {
  FilterChip,
  QuickFilterButton,
  SortDropdown,
  FolderResultsBadges,
  OperatorSuggestions,
} from "@/components/search/search_filters_panel";
import { SearchResultRow } from "@/components/search/search_result_item";
import { use_advanced_search_modal } from "@/components/search/use_advanced_search_modal";

export function AdvancedSearchModal({
  is_open,
  on_close,
  current_folder: _current_folder,
  on_result_click,
  on_search_submit,
}: AdvancedSearchModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const {
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
  } = use_advanced_search_modal({
    is_open,
    on_close,
    on_result_click,
    on_search_submit,
  });

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-start sm:items-start justify-center pt-0 sm:pt-12 z-[60] p-0 sm:p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={handle_close}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="rounded-none sm:rounded-2xl w-full h-full sm:h-auto sm:max-w-6xl overflow-hidden transition-colors duration-200 flex flex-col bg-modal-bg border border-edge-secondary"
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            initial={
              reduce_motion ? false : { scale: 0.96, opacity: 0, y: -10 }
            }
            transition={{ duration: reduce_motion ? 0 : 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorBoundary>
              <div className="p-4 border-b transition-colors duration-200 flex-shrink-0 border-edge-secondary">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {state.is_loading || state.is_searching ? (
                      <Spinner
                        className="text-[var(--accent-color)]"
                        size="md"
                      />
                    ) : (
                      <svg
                        className="w-5 h-5 text-txt-muted"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                      </svg>
                    )}
                  </div>
                  <Input
                    ref={input_ref}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="w-full bg-transparent border-none"
                    placeholder={t("mail.search_messages")}
                    type="text"
                    value={state.raw_query}
                    onChange={handle_input_change}
                    onKeyDown={handle_key_down}
                  />
                  {state.raw_query && (
                    <button
                      className="p-1.5 rounded-full text-txt-muted hover:bg-surf-hover transition-colors"
                      onClick={() => {
                        set_raw_query("");
                        clear_results();
                        input_ref.current?.focus();
                      }}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                </div>

                {show_operator_hints && (
                  <OperatorSuggestions
                    on_select={handle_operator_select}
                    partial={state.raw_query}
                  />
                )}
              </div>

              {state.active_filters.length > 0 && (
                <div className="px-4 py-2 border-b flex items-center gap-2 flex-wrap border-edge-secondary">
                  <span className="text-xs text-txt-muted">
                    {t("mail.active_filters")}
                  </span>
                  {state.active_filters.map((filter) => (
                    <FilterChip
                      key={filter.id}
                      filter={filter}
                      on_remove={() => remove_filter(filter.id)}
                    />
                  ))}
                </div>
              )}

              <div className="px-3 sm:px-4 py-2 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0 border-edge-secondary bg-surf-tertiary">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium hidden sm:inline text-txt-muted">
                    {t("mail.quick_filters")}
                  </span>
                  {quick_filters.map((filter) => (
                    <QuickFilterButton
                      key={filter.id}
                      is_active={is_quick_filter_active(filter.operator)}
                      label={filter.label}
                      on_click={() => add_quick_filter(filter.operator)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <SortDropdown
                    on_change={set_sort_option}
                    value={state.sort_option}
                  />
                </div>
              </div>

              <div
                ref={results_container_ref}
                className="flex-1 sm:flex-none sm:max-h-[28rem] overflow-y-auto"
              >
                {state.error && (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4"
                    initial={reduce_motion ? false : { opacity: 0, y: -10 }}
                  >
                    <div
                      className="p-4 rounded-lg text-sm flex items-start gap-3"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "var(--color-danger)",
                      }}
                    >
                      <svg
                        className="w-5 h-5 flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                      </svg>
                      <div>
                        <p className="font-medium">{t("mail.search_error")}</p>
                        <p className="text-xs mt-1 opacity-80">{state.error}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {state.raw_query &&
                  state.is_loading &&
                  filtered_results.length === 0 && (
                    <div className="p-2">
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                      <SearchResultSkeleton />
                    </div>
                  )}

                {filtered_results.length > 0 && (
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs flex items-center justify-between text-txt-muted">
                      <div className="flex items-center gap-3">
                        <span>
                          {t("mail.showing_results", {
                            shown: filtered_results.length,
                            total: state.total_results,
                          })}{" "}
                          {state.search_time_ms > 0 && (
                            <span className="opacity-60">
                              ({state.search_time_ms.toFixed(0)}ms)
                            </span>
                          )}
                        </span>
                        <FolderResultsBadges
                          folder_counts={state.result_folders}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {state.search_time_ms > 0 && (
                          <span className="text-txt-muted">
                            {state.search_time_ms < 1000
                              ? `${Math.round(state.search_time_ms)}ms`
                              : `${(state.search_time_ms / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </div>
                    </div>
                    {filtered_results.map((result) => (
                      <SearchResultRow
                        key={result.id}
                        on_click={() => handle_result_click(result.id)}
                        query_terms={query_terms}
                        quick_actions={quick_action_handlers}
                        result={result}
                      />
                    ))}
                    {(state.is_searching || state.is_loading) &&
                      filtered_results.length > 0 && (
                        <div className="py-2">
                          <div className="flex items-center justify-center gap-2 py-3">
                            <Spinner
                              className="text-[var(--accent-color,#3b82f6)]"
                              size="sm"
                            />
                            <span className="text-xs text-txt-muted">
                              {t("common.loading_more")}
                            </span>
                          </div>
                          <SearchResultSkeleton />
                        </div>
                      )}
                    {state.has_more &&
                      !state.is_searching &&
                      !state.is_loading && (
                        <button
                          className="w-full py-3 text-xs text-center rounded-lg mt-2 text-txt-muted bg-surf-tertiary hover:bg-surf-hover transition-colors"
                          onClick={load_more}
                        >
                          {t("mail.load_more_results", {
                            remaining:
                              state.total_results - filtered_results.length,
                          })}
                        </button>
                      )}
                  </div>
                )}

                {show_empty_state && (
                  <EmptySearchState query={state.text_query} />
                )}

                {!state.raw_query && (
                  <FirstTimeSearchState on_quick_action={handle_quick_search} />
                )}

                {!state.raw_query && (
                  <div className="p-4 border-t border-edge-secondary">
                    <div className="text-xs font-semibold uppercase tracking-wider mb-3 text-txt-muted">
                      {t("mail.search_operators")}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { op: "from:", desc: t("mail.search_by_sender") },
                        { op: "to:", desc: t("mail.search_by_recipient") },
                        { op: "subject:", desc: t("mail.search_in_subject") },
                        {
                          op: "has:attachment",
                          desc: t("mail.has_attachments_search"),
                        },
                        { op: "has:pdf", desc: t("mail.has_pdf_search") },
                        {
                          op: "is:unread",
                          desc: t("mail.unread_emails_search"),
                        },
                        {
                          op: "is:starred",
                          desc: t("mail.starred_emails_search"),
                        },
                        { op: "in:sent", desc: t("mail.in_sent_folder") },
                        {
                          op: "after:YYYY-MM-DD",
                          desc: t("mail.after_date_search"),
                        },
                        { op: "date:today", desc: t("mail.from_today_search") },
                        {
                          op: "larger:5mb",
                          desc: t("mail.larger_than_search"),
                        },
                        { op: "-from:", desc: t("mail.exclude_sender") },
                      ].map((item) => (
                        <button
                          key={item.op}
                          className="flex items-start gap-2 p-2 rounded-lg text-left transition-colors hover_bg text-txt-secondary"
                          onClick={() => {
                            set_raw_query(item.op);
                            search(item.op);
                            input_ref.current?.focus();
                          }}
                        >
                          <code className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-surf-tertiary text-brand">
                            {item.op}
                          </code>
                          <span className="text-xs text-txt-muted">
                            {item.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              <div className="p-3 border-t flex items-center justify-between text-xs flex-shrink-0 border-edge-secondary bg-surf-tertiary text-txt-muted">
                <div className="hidden sm:flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span>{t("mail.navigate")}</span>
                    <kbd className="px-1.5 py-0.5 border rounded flex items-center justify-center bg-surf-card border-edge-secondary">
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M7 14l5-5 5 5z" />
                      </svg>
                    </kbd>
                    <kbd className="px-1.5 py-0.5 border rounded flex items-center justify-center bg-surf-card border-edge-secondary">
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </kbd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>{t("mail.select")}</span>
                    <kbd className="px-1.5 py-0.5 border rounded bg-surf-card border-edge-secondary">
                      Enter
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <button
                    className="px-2 py-1 rounded transition-colors hover:bg-white/5 text-txt-muted"
                    onClick={() => {
                      set_raw_query("");
                      clear_results();
                    }}
                  >
                    {t("common.clear")}
                  </button>
                  <button
                    className="sm:hidden px-3 py-1 rounded transition-colors text-txt-muted bg-surf-card"
                    onClick={handle_close}
                  >
                    {t("common.close")}
                  </button>
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 border rounded bg-surf-card border-edge-secondary">
                    ESC
                  </kbd>
                </div>
              </div>
            </ErrorBoundary>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
