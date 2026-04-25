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
import type { SearchModalProps } from "@/components/search/search_modal_types";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

import { Spinner } from "@/components/ui/spinner";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { SearchInputBar } from "@/components/search/search_input";
import {
  SearchResultSkeleton,
  EmptySearchState,
  FirstTimeSearchState,
} from "@/components/search/search_results_list";
import {
  SearchHistorySection,
  SavedSearchesSection,
  SaveSearchDialog,
} from "@/components/search/search_filters_panel";
import {
  SearchResultRow,
  FolderResultRow,
} from "@/components/search/search_result_item";
import { SearchModalFilterPanel } from "@/components/search/search_modal_filter_panel";
import { use_search_modal } from "@/components/search/use_search_modal";

export { AdvancedSearchModal } from "@/components/search/advanced_search_modal";

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  bottom: number;
}

const MOBILE_BREAKPOINT = 640;
const DESKTOP_MIN_WIDTH = 560;
const ANCHOR_SELECTOR = '[data-onboarding="search-bar"]';

function use_anchor_rect(
  anchor_ref: SearchModalProps["anchor_ref"],
  active: boolean,
): AnchorRect | null {
  const [rect, set_rect] = useState<AnchorRect | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      set_rect(null);

      return;
    }

    const resolve_el = (): HTMLElement | null => {
      if (anchor_ref?.current) return anchor_ref.current;

      return document.querySelector(ANCHOR_SELECTOR) as HTMLElement | null;
    };

    const update = () => {
      const el = resolve_el();

      if (!el) return;
      const r = el.getBoundingClientRect();

      set_rect({
        top: r.top,
        left: r.left,
        width: r.width,
        bottom: r.bottom,
      });
    };

    update();
    const raf = requestAnimationFrame(update);

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor_ref, active]);

  return rect;
}

function use_is_mobile(): boolean {
  const [mobile, set_mobile] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < MOBILE_BREAKPOINT
      : false,
  );

  useEffect(() => {
    const update = () => set_mobile(window.innerWidth < MOBILE_BREAKPOINT);

    window.addEventListener("resize", update);

    return () => window.removeEventListener("resize", update);
  }, []);

  return mobile;
}

export function SearchModal({
  is_open,
  on_close,
  initial_query,
  on_initial_query_consumed,
  on_search_submit,
  on_result_click,
  anchor_ref,
}: SearchModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const is_mobile = use_is_mobile();
  const rect = use_anchor_rect(anchor_ref, is_open && !is_mobile);
  const dropdown_ref = useRef<HTMLDivElement>(null);

  const {
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
    build_advanced_query,
  } = use_search_modal({
    is_open,
    on_close,
    initial_query,
    on_initial_query_consumed,
    on_search_submit,
    on_result_click,
  });

  useEffect(() => {
    if (!is_open) return;
    const on_pointer_down = (e: MouseEvent | TouchEvent) => {
      const node = dropdown_ref.current;
      const anchor = anchor_ref?.current;
      const target = e.target as Node | null;

      if (!node || !target) return;
      if (node.contains(target)) return;
      if (anchor && anchor.contains(target)) return;
      handle_close();
    };

    window.addEventListener("mousedown", on_pointer_down);
    window.addEventListener("touchstart", on_pointer_down, { passive: true });

    return () => {
      window.removeEventListener("mousedown", on_pointer_down);
      window.removeEventListener("touchstart", on_pointer_down);
    };
  }, [is_open, handle_close, anchor_ref]);

  const handle_submit_advanced = () => {
    const query = build_advanced_query();

    if (!query) return;
    set_query(query);
    set_show_filters(false);
    if (on_search_submit) {
      on_search_submit(query);
      handle_close();

      return;
    }
    handle_search(query);
  };

  if (!is_open) return null;

  const show_first_time_state = !state.query;
  const show_empty_state =
    state.query &&
    !state.is_loading &&
    !state.is_searching &&
    filtered_results.length === 0 &&
    filtered_folders.length === 0 &&
    !state.error;

  const desktop_style: React.CSSProperties | undefined = rect
    ? {
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, DESKTOP_MIN_WIDTH),
        maxWidth: "calc(100vw - 16px)",
        zIndex: 60,
      }
    : undefined;

  const content = (
    <>
      <SearchInputBar
        has_results={filtered_results.length > 0}
        input_ref={input_ref}
        is_loading={state.is_loading}
        is_searching={state.is_searching}
        on_clear_data={handle_clear_data}
        on_clear_query={() => {
          set_query("");
          clear_results();
          input_ref.current?.focus();
        }}
        on_close={handle_close}
        on_input_change={handle_input_change}
        on_key_down={handle_key_down}
        on_search_submit={on_search_submit}
        on_show_save_dialog={() => set_show_save_dialog(true)}
        on_toggle_clear_menu={() => set_show_clear_menu((prev) => !prev)}
        on_toggle_filters={() => set_show_filters((prev) => !prev)}
        query={state.query}
        show_clear_menu={show_clear_menu}
        show_filters={show_filters}
      />

      <SearchModalFilterPanel
        filters={filters}
        on_submit={handle_submit_advanced}
        set_filters={set_filters}
        show_filters={show_filters}
      />

      <div
        ref={results_container_ref}
        className="flex-1 sm:flex-none sm:max-h-[26rem] overflow-y-auto"
      >
        {state.error && (
          <div className="p-4">
            <div
              className="p-3 rounded-lg text-sm flex items-start gap-3"
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
          </div>
        )}

        {state.query &&
          state.is_loading &&
          filtered_results.length === 0 &&
          filtered_folders.length === 0 && (
            <div className="p-2">
              <SearchResultSkeleton />
              <SearchResultSkeleton />
              <SearchResultSkeleton />
            </div>
          )}

        {state.query && filtered_folders.length > 0 && (
          <div className="p-2 pb-0">
            <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
              {t("mail.folders")}
            </div>
            {filtered_folders.slice(0, 5).map((folder) => (
              <FolderResultRow
                key={folder.id}
                folder={folder}
                on_click={() => handle_folder_click(folder)}
              />
            ))}
            {filtered_folders.length > 5 && (
              <div className="px-3 py-1.5 text-[11px] text-txt-muted">
                {t("mail.more_folders_count", {
                  count: filtered_folders.length - 5,
                })}
              </div>
            )}
          </div>
        )}

        {state.query && filtered_results.length > 0 && (
          <div className="p-2">
            {filtered_folders.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-txt-muted">
                {t("mail.emails")}
              </div>
            )}
            <div className="px-3 py-2 text-xs flex items-center justify-between text-txt-muted">
              <span>
                {t("mail.showing_results", {
                  shown: filtered_results.length,
                  total: state.total_results,
                })}
              </span>
              {state.index_building && (
                <span className="flex items-center gap-1 text-amber-500">
                  <Spinner size="xs" />
                  {t("mail.indexing")}
                </span>
              )}
            </div>
            <AnimatePresence mode="popLayout">
              {filtered_results.map((result) => (
                <SearchResultRow
                  key={result.id}
                  on_click={() => handle_result_click(result.id)}
                  query_terms={query_terms}
                  quick_actions={quick_action_handlers}
                  result={result}
                />
              ))}
            </AnimatePresence>
            {(state.is_searching || state.is_loading_more) && (
              <div className="py-2">
                <div className="flex items-center justify-center gap-2 py-3">
                  <Spinner
                    className="text-[var(--accent-color,#3b82f6)]"
                    size="sm"
                  />
                  <span className="text-xs text-txt-muted">
                    {state.is_loading_more
                      ? t("common.loading_more")
                      : t("mail.searching")}
                  </span>
                </div>
                {state.is_loading_more && <SearchResultSkeleton />}
              </div>
            )}
            {state.has_more &&
              !state.is_searching &&
              !state.is_loading_more && (
                <button
                  className="w-full py-3 text-xs text-center transition-all duration-150 rounded-lg mt-2 text-txt-muted bg-surf-tertiary hover:bg-surf-hover"
                  onClick={load_more}
                >
                  {t("mail.load_more_results", {
                    remaining: state.total_results - filtered_results.length,
                  })}
                </button>
              )}
          </div>
        )}

        {show_empty_state && <EmptySearchState query={state.query} />}

        {show_first_time_state && (
          <>
            {search_history.length > 0 || saved_searches.length > 0 ? (
              <>
                <SearchHistorySection
                  history={search_history}
                  on_clear_all={handle_clear_all_history}
                  on_remove={handle_history_remove}
                  on_select={handle_history_select}
                />
                <SavedSearchesSection
                  on_delete={handle_saved_search_delete}
                  on_select={handle_saved_search_select}
                  saved_searches={saved_searches}
                />
              </>
            ) : (
              <FirstTimeSearchState on_quick_action={handle_quick_search} />
            )}
          </>
        )}
      </div>

      <SaveSearchDialog
        is_open={show_save_dialog}
        on_close={() => set_show_save_dialog(false)}
        on_save={handle_save_search}
        query={state.query}
      />
    </>
  );

  if (is_mobile) {
    return createPortal(
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60]"
        exit={{ opacity: 0 }}
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.15 }}
        onClick={handle_close}
      >
        <motion.div
          ref={dropdown_ref}
          animate={{ y: 0, opacity: 1 }}
          className="w-full h-full flex flex-col bg-modal-bg"
          exit={{ y: -10, opacity: 0 }}
          initial={reduce_motion ? false : { y: -10, opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.18, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </motion.div>
      </motion.div>,
      document.body,
    );
  }

  const fallback_style: React.CSSProperties = {
    position: "fixed",
    top: 56,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(720px, calc(100vw - 32px))",
    zIndex: 60,
  };

  return createPortal(
    <motion.div
      ref={dropdown_ref}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden flex flex-col bg-modal-bg border border-edge-secondary"
      exit={{ opacity: 0, y: -4 }}
      initial={reduce_motion ? false : { opacity: 0, y: -4 }}
      style={{
        ...(desktop_style ?? fallback_style),
        boxShadow:
          "0 20px 40px -10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.04)",
      }}
      transition={{ duration: reduce_motion ? 0 : 0.14, ease: "easeOut" }}
    >
      {content}
    </motion.div>,
    document.body,
  );
}
