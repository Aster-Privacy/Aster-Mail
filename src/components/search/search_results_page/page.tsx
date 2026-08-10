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

import { useState, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EllipsisVerticalIcon,
  EnvelopeOpenIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  StarIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import {
  MIN_LIST_WIDTH,
  SearchResultSkeleton,
  SearchResultsPageProps,
  SortOption,
  extract_snippet,
} from "./helpers";
import { use_search_results_page } from "./use_search_results_page";

import { emit_mail_items_removed } from "@/hooks/mail_events";
import { InboxHeader } from "@/components/inbox/inbox_header";
import { InboxEmailListItem } from "@/components/email/inbox_email_list_item";
import { EmailContextMenuContent } from "@/components/email/email_context_menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context_menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { SplitEmailViewer } from "@/components/email/split_email_viewer";
import { FullEmailViewer } from "@/components/email/full_email_viewer";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compute_highlight_ranges, apply_highlights } from "@/hooks/use_search";
import { HighlightedText } from "@/components/search/search_result_item";
import { SearchChipRow } from "@/components/search/search_chip_row";
import { CorrectionNotice } from "@/components/search/correction_notice";
import { AdvancedSearchModal } from "@/components/search/advanced_search_modal";
import { resolve_list_density } from "@/lib/list_density";

export function SearchResultsPage(props: SearchResultsPageProps) {
  const {
    query,
    on_close,
    on_result_click,
    on_search_submit,
    split_email_id,
    on_split_close,
    on_settings_click,
    on_quick_settings_click,
  } = props;
  const {
    t,
    preferences,
    search_page_size,
    state,
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
  } = use_search_results_page(props);
  const is_split_view = !!split_email_id;

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

  const menu_email_ref = useRef<InboxEmail | null>(null);
  const [menu_email, set_menu_email] = useState<InboxEmail | null>(null);

  const handle_row_context_menu = useCallback((email: InboxEmail) => {
    set_menu_email(email);
    menu_email_ref.current = email;
  }, []);

  const menu_selection = useMemo(() => {
    if (
      !menu_email ||
      selected_ids.size < 2 ||
      !selected_ids.has(menu_email.id)
    ) {
      return null;
    }

    const selected = filtered_results.filter((r) => selected_ids.has(r.id));

    return {
      count: selected_ids.size,
      is_all_mode: false,
      has_unread: selected.some((r) => !r.is_read),
      has_read: selected.some((r) => r.is_read),
    };
  }, [menu_email, selected_ids, filtered_results]);

  const run_single = useCallback(
    async (
      fn: (emails: InboxEmail[]) => Promise<unknown>,
      removes: boolean,
    ) => {
      const target = menu_email_ref.current;

      if (!target) return;

      const emails = await fetch_as_minimal_emails([target.id]);

      if (emails.length === 0) return;

      await fn(emails);

      if (removes) emit_mail_items_removed({ ids: emails.map((e) => e.id) });
    },
    [fetch_as_minimal_emails],
  );

  const overflow_menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("common.more")}
          className="h-9 w-9 rounded-[10px] flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)] text-[var(--icon-secondary)] hover:text-[var(--icon-active)] flex-shrink-0"
          type="button"
        >
          <EllipsisVerticalIcon className="w-[18px] h-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => handle_select_by_filter("unread")}>
          <EnvelopeOpenIcon className="w-4 h-4" />
          {t("common.select_unread")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle_select_by_filter("starred")}>
          <StarIcon className="w-4 h-4" />
          {t("common.select_starred")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handle_select_all_visible}>
          <CheckCircleIcon className="w-4 h-4" />
          {t("common.select_all")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={selected_ids.size === 0}
          onClick={handle_bulk_mark_read}
        >
          <EnvelopeOpenIcon className="w-4 h-4" />
          {t("mail.mark_as_read")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => set_advanced_open(true)}>
          <AdjustmentsHorizontalIcon className="w-4 h-4" />
          {t("mail.chip_advanced_search")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const handle_refine_query = useCallback(() => {
    window.dispatchEvent(new Event("aster:focus-search"));
  }, []);

  const handle_find_from_sender = useCallback(
    (email: { sender_email?: string | null }) => {
      const sender = (email.sender_email || "").trim();

      if (!sender) return;
      set_selected_ids(new Set());
      window.dispatchEvent(
        new CustomEvent("astermail:open-search-with-query", {
          detail: { query: `from:${sender}` },
        }),
      );
    },
    [],
  );

  const slow_notice = (
    <div className="flex flex-col items-center justify-center text-center gap-1.5 px-4 py-8 border-b border-edge-secondary">
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {t("mail.search_taking_too_long")}
      </p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("mail.search_refine_terms")}
      </p>
      <div className="flex items-center justify-center gap-3 mt-1.5">
        <button
          className="flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors"
          type="button"
          onClick={handle_refine_query}
        >
          {t("mail.refine_your_search_action")}
        </button>
        {content_search_enabled && (
          <button
            className="flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors"
            type="button"
            onClick={handle_disable_content_search}
          >
            {t("mail.turn_off_indexing_action")}
          </button>
        )}
      </div>
    </div>
  );

  const email_list_body = (
    <>
      {is_loading && filtered_results.length === 0 ? (
        <div>
          {is_slow && slow_notice}
          {Array.from({ length: 10 }).map((_, i) => (
            <SearchResultSkeleton key={i} />
          ))}
        </div>
      ) : state.error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <ExclamationTriangleIcon
            className="w-10 h-10 mb-4"
            style={{ color: "var(--text-muted)" }}
          />
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {state.error}
          </p>
          <button
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium transition-colors bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)] hover:opacity-90"
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
          <MagnifyingGlassIcon
            className="w-10 h-10 mb-4"
            style={{ color: "var(--text-muted)" }}
          />
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {t("mail.no_results_found")}
          </p>
          <p
            className="text-xs text-center max-w-[280px]"
            style={{ color: "var(--text-muted)" }}
          >
            {active_filter_count > 0
              ? t("mail.try_adjusting_filters")
              : t("mail.no_emails_match_query", { query })}
          </p>
        </div>
      ) : (
        <>
          <CorrectionNotice
            className="border-b border-edge-secondary"
            correction={state.correction}
            on_dismiss={dismiss_correction}
          />
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
                className="border-b border-edge-secondary"
                current_view="search"
                density={resolve_list_density(preferences.mail_list_density)}
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
                show_email_preview={preferences.show_email_preview}
                show_message_size={preferences.show_message_size}
                show_profile_pictures={preferences.show_profile_pictures}
                show_thread_count={preferences.conversation_grouping !== false}
                onContextMenu={() =>
                  handle_row_context_menu(email as InboxEmail)
                }
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

  const email_list_content = (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div style={{ display: "contents" }}>{email_list_body}</div>
      </ContextMenuTrigger>
      {menu_email && (
        <EmailContextMenuContent
          key={menu_email.id}
          current_view="search"
          email={menu_email}
          on_archive={() =>
            menu_selection
              ? void handle_bulk_archive()
              : void run_single(
                  (emails) => email_actions.bulk_archive(emails),
                  true,
                )
          }
          on_delete={() =>
            menu_selection
              ? void handle_bulk_delete()
              : void run_single(
                  (emails) => email_actions.bulk_delete(emails),
                  true,
                )
          }
          on_find_from_sender={() => handle_find_from_sender(menu_email)}
          on_mark_read={
            menu_selection ? () => void handle_bulk_mark_read() : undefined
          }
          on_mark_unread={
            menu_selection ? () => void handle_bulk_mark_unread() : undefined
          }
          on_spam={() =>
            menu_selection
              ? void handle_bulk_spam()
              : void run_single(
                  (emails) => email_actions.bulk_mark_spam(emails),
                  true,
                )
          }
          on_toggle_read={() =>
            void run_single(
              (emails) =>
                email_actions.bulk_mark_read(emails, !menu_email.is_read),
              false,
            )
          }
          selection={menu_selection ?? undefined}
        />
      )}
    </ContextMenu>
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {!show_full_email_viewer && (
        <div className="flex-shrink-0 min-w-0">
          <InboxHeader
            active_filter={active_inbox_filter}
            all_selected={selection_all_selected}
            can_go_next={is_split_view ? search_can_go_next : false}
            can_go_prev={is_split_view ? search_can_go_prev : false}
            current_email_index={is_split_view ? search_nav_index : undefined}
            current_page={search_page}
            filtered_count={filtered_results.length}
            hide_quick_actions={true}
            hide_view_switcher={true}
            leading_left_slot={
              <Tooltip tip={t("common.back")}>
                <button
                  aria-label={t("common.back")}
                  className="h-9 w-9 rounded-[10px] flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)] text-[var(--icon-secondary)] hover:text-[var(--icon-active)] flex-shrink-0"
                  type="button"
                  onClick={on_close}
                >
                  <ArrowLeftIcon className="w-[18px] h-[18px]" />
                </button>
              </Tooltip>
            }
            leading_toolbar_slot={sort_dropdown}
            on_archive={handle_bulk_archive}
            on_delete={handle_bulk_delete}
            on_filter_change={handle_inbox_filter_change}
            on_mark_read={handle_bulk_mark_read}
            on_mark_unread={handle_bulk_mark_unread}
            on_navigate_next={
              is_split_view ? handle_search_navigate_next : undefined
            }
            on_navigate_prev={
              is_split_view ? handle_search_navigate_prev : undefined
            }
            on_page_change={is_split_view ? undefined : set_search_page}
            on_quick_settings_click={on_quick_settings_click}
            on_search_result_click={on_result_click}
            on_search_submit={on_search_submit}
            on_select_by_filter={
              paged_results.length > 0 ? handle_select_by_filter : undefined
            }
            on_settings_click={on_settings_click || (() => {})}
            on_spam={handle_bulk_spam}
            on_toggle_select_all={
              paged_results.length > 0 ? handle_select_all_visible : undefined
            }
            on_toggle_star={handle_bulk_toggle_star}
            overflow_menu_slot={overflow_menu}
            page_size={search_page_size}
            search_context={query}
            selected_count={selected_ids.size}
            some_selected={selection_some_selected}
            total_email_count={filtered_results.length}
            view_title={t("common.search")}
          />
          {on_search_submit && (
            <SearchChipRow
              on_advanced_click={() => set_advanced_open(true)}
              on_query_change={on_search_submit}
              query={query}
            />
          )}
          {state.hidden_spam_trash > 0 && (
            <div
              className="flex items-center gap-2 px-4 py-2 text-xs border-b"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-secondary)",
                color: "var(--text-secondary)",
              }}
            >
              <span className="min-w-0">
                {t("mail.spam_trash_hidden_notice")}
              </span>
              {on_search_submit && (
                <button
                  className="flex-shrink-0 font-medium text-blue-500 hover:underline"
                  type="button"
                  onClick={() =>
                    on_search_submit(
                      query.includes("in:anywhere")
                        ? query
                        : `${query.trim()} in:anywhere`.trim(),
                    )
                  }
                >
                  {t("mail.view_spam_trash_messages")}
                </button>
              )}
            </div>
          )}
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
            ref={list_panel_ref}
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
            className="w-px cursor-col-resize relative hover:bg-blue-500"
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
            ref={detail_panel_ref}
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
              current_index={
                search_nav_index >= 0 ? search_nav_index : undefined
              }
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

      <AdvancedSearchModal
        is_open={advanced_open}
        on_close={() => set_advanced_open(false)}
        on_result_click={on_result_click}
        on_search_submit={on_search_submit}
      />
    </div>
  );
}
