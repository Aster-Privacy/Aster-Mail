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
import type { InboxFilterType } from "@/types/email";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDownIcon,
  ArchiveBoxArrowDownIcon,
  TrashIcon,
  EnvelopeOpenIcon,
  EnvelopeIcon,
  ShieldExclamationIcon,
  ArrowUturnLeftIcon,
  InboxIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  TagIcon,
  CheckIcon,
  StarIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { Checkbox, Tooltip } from "@aster/ui";
import { Capacitor } from "@capacitor/core";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { SearchBar } from "@/components/search/search_bar";
import { use_i18n } from "@/lib/i18n/context";
import {
  HeaderToolbar,
  MobileOverflowMenu,
  ToolbarModals,
  use_batch_actions,
} from "@/components/inbox/header/header_toolbar";
import { FilterDropdown } from "@/components/inbox/header/header_filters";
import { HeaderPagination } from "@/components/inbox/header/header_pagination";

interface FolderOption {
  folder_token: string;
  name: string;
  color: string;
  status: "all" | "some" | "none";
}

interface TagOption {
  tag_token: string;
  name: string;
  color: string;
  status: "all" | "some" | "none";
}

interface InboxHeaderProps {
  on_settings_click: () => void;
  view_title: string;
  on_compose?: () => void;
  active_filter?: InboxFilterType;
  on_filter_change?: (filter: InboxFilterType) => void;
  on_search_click?: () => void;
  on_search_result_click?: (id: string) => void;
  on_search_submit?: (query: string) => void;
  search_context?: string;
  all_selected?: boolean;
  some_selected?: boolean;
  on_toggle_select_all?: () => void;
  filtered_count?: number;
  display_count?: number;
  total_messages?: number;
  current_page?: number;
  page_size?: number;
  on_page_change?: (page: number) => void;
  is_trash_view?: boolean;
  on_empty_trash?: () => void;
  trash_count?: number;
  is_spam_view?: boolean;
  on_empty_spam?: () => void;
  spam_count?: number;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_email_index?: number;
  total_email_count?: number;
  on_view_change?: (route: string) => void;
  selected_count?: number;
  on_archive?: () => void;
  on_unarchive?: () => void;
  on_delete?: () => void;
  on_mark_read?: () => void;
  on_mark_unread?: () => void;
  on_toggle_star?: () => void;
  on_select_by_filter?: (
    mode: "all" | "none" | "read" | "unread" | "starred" | "unstarred",
  ) => void;
  on_spam?: () => void;
  on_restore?: () => void;
  is_archive_view?: boolean;
  on_snooze?: (snooze_until: Date) => void;
  folders?: FolderOption[];
  on_folder_toggle?: (folder_token: string) => void;
  tags?: TagOption[];
  on_tag_toggle?: (tag_token: string) => void;
  hide_view_switcher?: boolean;
  leading_toolbar_slot?: React.ReactNode;
  leading_left_slot?: React.ReactNode;
}

export function InboxHeader({
  on_settings_click,
  view_title,
  on_compose: _on_compose,
  active_filter = "all",
  on_filter_change,
  on_search_click: _on_search_click,
  on_search_result_click,
  on_search_submit,
  search_context,
  all_selected = false,
  some_selected = false,
  on_toggle_select_all,
  filtered_count = 0,
  display_count,
  total_messages: _total_messages = 0,
  current_page = 0,
  page_size = 30,
  on_page_change,
  is_trash_view = false,
  on_empty_trash,
  trash_count = 0,
  is_spam_view = false,
  on_empty_spam,
  spam_count = 0,
  on_navigate_prev,
  on_navigate_next,
  can_go_prev = false,
  can_go_next = false,
  current_email_index,
  total_email_count = 0,
  on_view_change,
  selected_count = 0,
  on_archive,
  on_unarchive,
  on_delete,
  on_mark_read,
  on_mark_unread,
  on_toggle_star,
  on_select_by_filter,
  on_spam,
  on_restore,
  is_archive_view = false,
  on_snooze,
  folders = [],
  on_folder_toggle,
  tags = [],
  on_tag_toggle,
  hide_view_switcher = false,
  leading_toolbar_slot,
  leading_left_slot,
}: InboxHeaderProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const is_native = Capacitor.isNativePlatform();
  const has_selection = all_selected || some_selected;
  const [advanced_toolbar, set_advanced_toolbar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("astermail:advanced_toolbar") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "astermail:advanced_toolbar",
        advanced_toolbar ? "1" : "0",
      );
    } catch {}
  }, [advanced_toolbar]);

  const {
    is_refreshing,
    handle_refresh,
    handle_batch_action,
    is_sender_modal_open,
    set_is_sender_modal_open,
    sender_modal_action,
    is_unsubscribe_modal_open,
    set_is_unsubscribe_modal_open,
    is_snooze_modal_open,
    set_is_snooze_modal_open,
  } = use_batch_actions(t);

  const handle_view_change = (key: string) => {
    const routes: Record<string, string> = {
      inbox: "/",
      starred: "/starred",
      sent: "/sent",
      drafts: "/drafts",
      scheduled: "/scheduled",
      archive: "/archive",
      spam: "/spam",
      trash: "/trash",
    };
    const route = routes[key];

    if (route) {
      if (on_view_change) {
        on_view_change(route);
      } else {
        navigate(route);
      }
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2 sm:py-2.5 min-h-[56px] border-b border-[var(--border-secondary)] overflow-hidden">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
          {leading_left_slot}
          {on_toggle_select_all && (
            <div className="group flex items-center flex-shrink-0 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
              <Tooltip tip={t("common.select_all")}>
                <div
                  className="w-9 h-9 flex items-center justify-center cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => on_toggle_select_all()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      on_toggle_select_all();
                    }
                  }}
                >
                  <Checkbox
                    checked={all_selected}
                    className="pointer-events-none scale-110"
                    indeterminate={!all_selected && some_selected}
                  />
                </div>
              </Tooltip>
              {on_select_by_filter && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={t("common.select_label")}
                      className="-ml-2 h-9 w-5 flex items-center justify-center focus:outline-none"
                    >
                      <ChevronDownIcon className="w-4 h-4 stroke-[1.75] text-[#d1d5db] dark:text-white/25" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-40"
                    sideOffset={4}
                  >
                    <DropdownMenuItem
                      onClick={() => on_select_by_filter("all")}
                    >
                      {t("common.all_short")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => on_select_by_filter("none")}
                    >
                      {t("common.select_none")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => on_select_by_filter("read")}
                    >
                      {t("common.select_read")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => on_select_by_filter("unread")}
                    >
                      {t("common.select_unread")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => on_select_by_filter("starred")}
                    >
                      {t("common.select_starred")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => on_select_by_filter("unstarred")}
                    >
                      {t("common.select_unstarred")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}

          {!has_selection && !hide_view_switcher && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors min-w-0 select-none focus:outline-none focus-visible:outline-none">
                  <span className="text-base leading-tight font-semibold text-[var(--text-primary)] truncate max-w-[80px] sm:max-w-[140px]">
                    {view_title}
                  </span>
                  {(display_count ?? filtered_count) > 0 && (
                    <span className="text-base leading-tight font-extrabold text-blue-500 tabular-nums flex-shrink-0">
                      {(display_count ?? filtered_count).toLocaleString()}
                    </span>
                  )}
                  <ChevronDownIcon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel>{t("mail.views")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handle_view_change("inbox")}>
                  {t("mail.inbox")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("sent")}>
                  {t("mail.sent")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handle_view_change("scheduled")}
                >
                  {t("mail.scheduled")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("drafts")}>
                  {t("mail.drafts")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("common.more")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handle_view_change("starred")}>
                  {t("mail.starred")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("archive")}>
                  {t("mail.archive")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("spam")}>
                  {t("mail.spam")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handle_view_change("trash")}>
                  {t("mail.trash")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {has_selection ? (
          <div className="flex-1 flex items-center gap-0.5 min-w-0">
            <span className="text-base leading-tight font-extrabold text-blue-500 tabular-nums px-1.5 flex-shrink-0">
              {selected_count}
            </span>
            <span
              className="text-base leading-tight flex-shrink-0 mr-2"
              style={{ color: "var(--text-muted)" }}
            >
              {t("common.selected")}
            </span>

            <div className="flex items-center gap-0.5">
              {(is_trash_view || is_spam_view) && on_restore && (
                <Tooltip tip={t("mail.restore")}>
                  <button
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    onClick={on_restore}
                  >
                    <ArrowUturnLeftIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                  </button>
                </Tooltip>
              )}

              {!is_trash_view &&
                !is_spam_view &&
                (is_archive_view ? (
                  <Tooltip tip={t("mail.move_to_inbox")}>
                    <button
                      className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                      onClick={on_unarchive}
                    >
                      <InboxIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip tip={t("mail.archive")}>
                    <button
                      className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                      onClick={on_archive}
                    >
                      <ArchiveBoxArrowDownIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                    </button>
                  </Tooltip>
                ))}

              <Tooltip
                tip={
                  is_trash_view
                    ? t("mail.delete_permanently")
                    : t("common.delete")
                }
              >
                <button
                  className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                  onClick={on_delete}
                >
                  <TrashIcon className="w-[18px] h-[18px] text-red-500" />
                </button>
              </Tooltip>

              <Tooltip tip={t("mail.mark_as_read")}>
                <button
                  className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                  onClick={on_mark_read}
                >
                  <EnvelopeOpenIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                </button>
              </Tooltip>

              {advanced_toolbar && on_toggle_star && (
                <Tooltip tip={t("common.star_selected")}>
                  <button
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    onClick={on_toggle_star}
                  >
                    <StarIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                  </button>
                </Tooltip>
              )}

              {advanced_toolbar && on_snooze && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={t("common.snooze_until")}
                      className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                      title={t("common.snooze_until")}
                    >
                      <ClockIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={8}>
                    <DropdownMenuLabel>
                      {t("common.snooze_until")}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setHours(date.getHours() + 4);
                        on_snooze(date);
                      }}
                    >
                      <ClockIcon className="w-4 h-4 mr-2" />
                      {t("mail.later_today_snooze")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 1);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      <ClockIcon className="w-4 h-4 mr-2" />
                      {t("mail.tomorrow_snooze")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 7);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      <ClockIcon className="w-4 h-4 mr-2" />
                      {t("mail.next_week_snooze")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {advanced_toolbar &&
                !is_trash_view &&
                !is_spam_view &&
                on_spam && (
                  <Tooltip tip={t("mail.report_spam")}>
                    <button
                      className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                      onClick={on_spam}
                    >
                      <ShieldExclamationIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                    </button>
                  </Tooltip>
                )}

              {advanced_toolbar &&
                !is_native &&
                folders.length > 0 &&
                on_folder_toggle && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label={t("common.folders")}
                        className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                        title={t("common.folders")}
                      >
                        <FolderIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-64 overflow-y-auto"
                      sideOffset={8}
                    >
                      {folders.map((folder) => (
                        <DropdownMenuItem
                          key={folder.folder_token}
                          onClick={() => on_folder_toggle(folder.folder_token)}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: folder.color }}
                          />
                          <span className="flex-1 truncate">{folder.name}</span>
                          {(folder.status === "all" ||
                            folder.status === "some") && (
                            <CheckIcon
                              className={`w-4 h-4 ml-2 flex-shrink-0 ${folder.status === "some" ? "opacity-50" : ""}`}
                            />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

              {advanced_toolbar &&
                !is_native &&
                tags.length > 0 &&
                on_tag_toggle && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label={t("common.labels")}
                        className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                        title={t("common.labels")}
                      >
                        <TagIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-64 overflow-y-auto"
                      sideOffset={8}
                    >
                      {tags.map((tag) => (
                        <DropdownMenuItem
                          key={tag.tag_token}
                          onClick={() => on_tag_toggle(tag.tag_token)}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="flex-1 truncate">{tag.name}</span>
                          {(tag.status === "all" || tag.status === "some") && (
                            <CheckIcon
                              className={`w-4 h-4 ml-2 flex-shrink-0 ${tag.status === "some" ? "opacity-50" : ""}`}
                            />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("common.more")}
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    title={t("common.more")}
                  >
                    <EllipsisHorizontalIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={8}>
                  {on_mark_unread && (
                    <DropdownMenuItem onClick={on_mark_unread}>
                      <EnvelopeIcon className="w-4 h-4 mr-2" />
                      {t("mail.mark_as_unread")}
                    </DropdownMenuItem>
                  )}
                  {!advanced_toolbar && on_toggle_star && (
                    <DropdownMenuItem onClick={on_toggle_star}>
                      <StarIcon className="w-4 h-4 mr-2" />
                      {t("common.star_selected")}
                    </DropdownMenuItem>
                  )}
                  {!advanced_toolbar &&
                    !is_trash_view &&
                    !is_spam_view &&
                    on_spam && (
                      <DropdownMenuItem onClick={on_spam}>
                        <ShieldExclamationIcon className="w-4 h-4 mr-2" />
                        {t("mail.report_spam")}
                      </DropdownMenuItem>
                    )}
                  {!advanced_toolbar && on_snooze && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>
                        {t("common.snooze_until")}
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => {
                          const date = new Date();

                          date.setHours(date.getHours() + 4);
                          on_snooze(date);
                        }}
                      >
                        <ClockIcon className="w-4 h-4 mr-2" />
                        {t("mail.later_today_snooze")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const date = new Date();

                          date.setDate(date.getDate() + 1);
                          date.setHours(9, 0, 0, 0);
                          on_snooze(date);
                        }}
                      >
                        <ClockIcon className="w-4 h-4 mr-2" />
                        {t("mail.tomorrow_snooze")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const date = new Date();

                          date.setDate(date.getDate() + 7);
                          date.setHours(9, 0, 0, 0);
                          on_snooze(date);
                        }}
                      >
                        <ClockIcon className="w-4 h-4 mr-2" />
                        {t("mail.next_week_snooze")}
                      </DropdownMenuItem>
                    </>
                  )}
                  {!advanced_toolbar &&
                    !is_native &&
                    tags.length > 0 &&
                    on_tag_toggle && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>
                          {t("common.labels")}
                        </DropdownMenuLabel>
                        {tags.slice(0, 8).map((tag) => (
                          <DropdownMenuItem
                            key={tag.tag_token}
                            onClick={() => on_tag_toggle(tag.tag_token)}
                          >
                            <div
                              className="w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="flex-1 truncate">{tag.name}</span>
                            {(tag.status === "all" ||
                              tag.status === "some") && (
                              <CheckIcon
                                className={`w-4 h-4 ml-2 flex-shrink-0 ${tag.status === "some" ? "opacity-50" : ""}`}
                              />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      set_advanced_toolbar((v) => !v);
                    }}
                  >
                    <AdjustmentsHorizontalIcon className="w-4 h-4 mr-2" />
                    {advanced_toolbar
                      ? t("common.simple_toolbar")
                      : t("common.advanced_toolbar")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
              <SearchBar
                on_result_click={on_search_result_click}
                on_search_submit={on_search_submit}
                search_context={search_context}
              />
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <HeaderToolbar
                leading_slot={leading_toolbar_slot}
                filter_slot={
                  <FilterDropdown
                    active_filter={active_filter}
                    on_filter_change={on_filter_change}
                  />
                }
                handle_batch_action={handle_batch_action}
                handle_refresh={handle_refresh}
                is_refreshing={is_refreshing}
                is_spam_view={is_spam_view}
                is_trash_view={is_trash_view}
                on_empty_spam={on_empty_spam}
                on_empty_trash={on_empty_trash}
                on_settings_click={on_settings_click}
                spam_count={spam_count}
                trash_count={trash_count}
              />

              <HeaderPagination
                can_go_next={can_go_next}
                can_go_prev={can_go_prev}
                current_email_index={current_email_index}
                current_page={current_page}
                filtered_count={filtered_count}
                on_navigate_next={on_navigate_next}
                on_navigate_prev={on_navigate_prev}
                on_page_change={on_page_change}
                page_size={page_size}
                total_email_count={total_email_count}
              />

              <div className="md:hidden">
                <MobileOverflowMenu
                  active_filter={active_filter}
                  handle_batch_action={handle_batch_action}
                  handle_refresh={handle_refresh}
                  on_filter_change={on_filter_change}
                  on_settings_click={on_settings_click}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <ToolbarModals
        is_sender_modal_open={is_sender_modal_open}
        is_snooze_modal_open={is_snooze_modal_open}
        is_unsubscribe_modal_open={is_unsubscribe_modal_open}
        sender_modal_action={sender_modal_action}
        set_is_sender_modal_open={set_is_sender_modal_open}
        set_is_snooze_modal_open={set_is_snooze_modal_open}
        set_is_unsubscribe_modal_open={set_is_unsubscribe_modal_open}
      />
    </>
  );
}
