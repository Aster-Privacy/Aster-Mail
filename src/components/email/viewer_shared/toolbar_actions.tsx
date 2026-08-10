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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { MailItem } from "@/services/api/mail";
import type { } from "@/services/api/multi_drafts";
import type { } from "@/lib/html_sanitizer";
import type { DecryptedEmail } from "@/components/email/use_email_viewer";
import type { } from "@/components/email/hooks/preload_cache";

import React, {    } from "react";
import {
  XMarkIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  TrashIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  EllipsisHorizontalIcon,
  PrinterIcon,
  FolderIcon,
  InboxIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  AdjustmentsHorizontalIcon,
  CheckIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { PinIcon } from "@/components/common/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";

import {
  type ThreadMessagesListRef,
} from "@/components/email/thread_message_block";

export interface ViewerToolbarActionsProps {
  is_pinned: boolean;
  is_pin_loading: boolean;
  is_archive_loading: boolean;
  is_trash_loading: boolean;
  is_spam_loading: boolean;
  is_read: boolean;
  thread_messages: DecryptedThreadMessage[];
  thread_expand_state: {
    all_expanded: boolean;
    all_collapsed: boolean;
    has_unread: boolean;
  };
  thread_list_ref: React.RefObject<ThreadMessagesListRef | null>;
  email: DecryptedEmail;
  mail_item: MailItem | null;
  on_pin_toggle: () => void;
  on_archive: () => void;
  is_archived?: boolean;
  on_unarchive?: () => void;
  on_trash: () => void;
  on_read_toggle: () => void;
  on_spam: () => void;
  on_not_spam?: () => void;
  is_spam?: boolean;
  on_print: () => void;
  on_unsubscribe: () => void;
  on_snooze?: () => void;
  on_block_sender_on_alias?: () => void;
  show_block_sender_on_alias?: boolean;
  folders?: { id: string; name: string; color: string }[];
  on_folder_toggle?: (folder_id: string) => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  current_index?: number;
  total_count?: number;
  button_size?: string;
  button_px?: number;
  icon_size?: string;
  dropdown_align?: "start" | "end";
  hide_class?: string;
  spread_layout?: boolean;
  show_nav?: boolean;
  show_pin?: boolean;
  show_read_toggle?: boolean;
  on_reply?: () => void;
  on_forward?: () => void;
}

export function ViewerToolbarActions({
  is_pinned,
  is_pin_loading,
  is_archive_loading,
  is_trash_loading,
  is_spam_loading,
  is_read,
  thread_messages,
  thread_expand_state,
  thread_list_ref,
  email,
  mail_item,
  on_pin_toggle,
  on_archive,
  is_archived = false,
  on_unarchive,
  on_trash,
  on_read_toggle,
  on_spam,
  on_not_spam,
  is_spam,
  on_print,
  on_unsubscribe,
  on_snooze,
  on_block_sender_on_alias,
  show_block_sender_on_alias = false,
  folders = [],
  on_folder_toggle,
  button_size = "h-9 w-9",
  button_px,
  icon_size = "w-5 h-5",
  dropdown_align = "end",
  hide_class = "",
  spread_layout = false,
  show_nav = false,
  show_pin = true,
  show_read_toggle,
  on_reply,
  on_forward,
  can_go_prev,
  can_go_next,
  on_navigate_prev,
  on_navigate_next,
  current_index,
  total_count,
}: ViewerToolbarActionsProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const is_advanced = preferences.viewer_toolbar_mode === "advanced";
  const btn_style = button_px
    ? {
        width: button_px,
        height: button_px,
        minWidth: button_px,
        minHeight: button_px,
      }
    : undefined;

  const muted_style = btn_style
    ? { ...btn_style, color: "var(--text-muted)" }
    : { color: "var(--text-muted)" };
  const btn_common = `flex-shrink-0 ${hide_class} ${button_size}`;
  const btn_base = `${btn_common} hover:!text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`;
  const btn_trash = btn_base;
  const btn_spam = btn_base;

  const collapse_expand_button =
    thread_messages.length > 1 ? (
      <Tooltip
        tip={
          thread_expand_state.all_expanded
            ? t("common.collapse_all")
            : t("common.expand_all")
        }
      >
        <Button
          className={btn_base}
          size="icon"
          style={muted_style}
          variant="ghost"
          onClick={() => {
            if (thread_expand_state.all_expanded) {
              thread_list_ref.current?.collapse_all();
            } else {
              thread_list_ref.current?.expand_all();
            }
          }}
        >
          {thread_expand_state.all_expanded ? (
            <ChevronDoubleUpIcon className={icon_size} />
          ) : (
            <ChevronDoubleDownIcon className={icon_size} />
          )}
        </Button>
      </Tooltip>
    ) : null;

  const nav_buttons =
    (spread_layout || show_nav) && (on_navigate_prev || on_navigate_next) ? (
      <div className="flex select-none items-center gap-0.5">
        <Tooltip tip={t("mail.shortcut_previous_email")}>
          <Button
            aria-disabled={!can_go_prev}
            className={`flex-shrink-0 ${button_size} ${can_go_prev ? "hover:!text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" : "opacity-40 cursor-default"}`}
            size="icon"
            style={muted_style}
            tabIndex={can_go_prev ? undefined : -1}
            variant="ghost"
            onClick={() => {
              if (can_go_prev) on_navigate_prev?.();
            }}
          >
            <ChevronLeftIcon className={icon_size} />
          </Button>
        </Tooltip>
        {current_index != null && total_count != null && total_count > 0 && (
          <span className="tabular-nums whitespace-nowrap px-1 text-[13px] text-[var(--text-muted)]">
            {(current_index + 1).toLocaleString()} {t("common.of")}{" "}
            {total_count.toLocaleString()}
          </span>
        )}
        <Tooltip tip={t("mail.shortcut_next_email")}>
          <Button
            aria-disabled={!can_go_next}
            className={`flex-shrink-0 ${button_size} ${can_go_next ? "hover:!text-[var(--text-primary)] hover:bg-[var(--bg-hover)]" : "opacity-40 cursor-default"}`}
            size="icon"
            style={muted_style}
            tabIndex={can_go_next ? undefined : -1}
            variant="ghost"
            onClick={() => {
              if (can_go_next) on_navigate_next?.();
            }}
          >
            <ChevronRightIcon className={icon_size} />
          </Button>
        </Tooltip>
      </div>
    ) : null;

  const inline_read_toggle = show_read_toggle ?? is_advanced;

  return (
    <>
      {on_reply && (
        <Tooltip tip={t("mail.reply")}>
          <Button
            aria-label={t("mail.reply")}
            className={btn_base}
            size="icon"
            style={muted_style}
            variant="ghost"
            onClick={on_reply}
          >
            <ArrowUturnLeftIcon className={icon_size} />
          </Button>
        </Tooltip>
      )}

      {on_forward && (
        <Tooltip tip={t("mail.forward")}>
          <Button
            aria-label={t("mail.forward")}
            className={btn_base}
            size="icon"
            style={muted_style}
            variant="ghost"
            onClick={on_forward}
          >
            <ArrowUturnRightIcon className={icon_size} />
          </Button>
        </Tooltip>
      )}

      {show_pin && (
        <Tooltip tip={is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}>
          <Button
            aria-label={is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}
            className={`${btn_common} ${is_pinned ? "!text-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_12%,transparent)]" : "hover:!text-[var(--accent-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_12%,transparent)]"}`}
            disabled={is_pin_loading}
            size="icon"
            style={is_pinned ? btn_style : muted_style}
            variant="ghost"
            onClick={on_pin_toggle}
          >
            <PinIcon
              className={`${icon_size} ${is_pinned ? "-rotate-[38deg]" : ""}`}
              filled={is_pinned}
            />
          </Button>
        </Tooltip>
      )}

      {is_archived && on_unarchive ? (
        <Tooltip tip={t("mail.move_to_inbox")}>
          <Button
            aria-label={t("mail.move_to_inbox")}
            className={btn_base}
            disabled={is_archive_loading}
            size="icon"
            style={muted_style}
            variant="ghost"
            onClick={on_unarchive}
          >
            <InboxIcon className={icon_size} />
          </Button>
        </Tooltip>
      ) : (
        <Tooltip tip={t("mail.archive")}>
          <Button
            aria-label={t("mail.archive")}
            className={btn_base}
            disabled={is_archive_loading}
            size="icon"
            style={muted_style}
            variant="ghost"
            onClick={on_archive}
          >
            <ArchiveBoxIcon className={icon_size} />
          </Button>
        </Tooltip>
      )}

      {is_advanced &&
        (is_spam && on_not_spam ? (
          <Tooltip tip={t("mail.not_spam")}>
            <Button
              aria-label={t("mail.not_spam")}
              className={btn_base}
              disabled={is_spam_loading}
              size="icon"
              style={muted_style}
              variant="ghost"
              onClick={on_not_spam}
            >
              <NoSymbolIcon className={icon_size} />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip tip={t("mail.report_spam")}>
            <Button
              aria-label={t("mail.report_spam")}
              className={btn_spam}
              disabled={is_spam_loading}
              size="icon"
              style={muted_style}
              variant="ghost"
              onClick={on_spam}
            >
              <NoSymbolIcon className={icon_size} />
            </Button>
          </Tooltip>
        ))}

      <Tooltip tip={t("mail.move_to_trash")}>
        <Button
          aria-label={t("mail.move_to_trash")}
          className={btn_trash}
          disabled={is_trash_loading}
          size="icon"
          style={muted_style}
          variant="ghost"
          onClick={on_trash}
        >
          <TrashIcon className={icon_size} />
        </Button>
      </Tooltip>

      {inline_read_toggle && (
        <Tooltip
          tip={is_read ? t("mail.mark_as_unread") : t("mail.mark_as_read")}
        >
          <Button
            aria-label={
              is_read ? t("mail.mark_as_unread") : t("mail.mark_as_read")
            }
            className={btn_base}
            size="icon"
            style={muted_style}
            variant="ghost"
            onClick={on_read_toggle}
          >
            {is_read ? (
              <EnvelopeIcon className={icon_size} />
            ) : (
              <EnvelopeOpenIcon className={icon_size} />
            )}
          </Button>
        </Tooltip>
      )}

      {is_advanced && (
        <>
          {on_snooze && (
            <Tooltip tip={t("mail.snooze")}>
              <Button
                className={btn_base}
                size="icon"
                style={muted_style}
                variant="ghost"
                onClick={on_snooze}
              >
                <ClockIcon className={icon_size} />
              </Button>
            </Tooltip>
          )}

          {folders.length > 0 && on_folder_toggle ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("mail.move_to_folder")}
                  className={btn_base}
                  size="icon"
                  style={muted_style}
                  title={t("mail.move_to_folder")}
                  variant="ghost"
                >
                  <FolderIcon className={icon_size} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {folders.map((folder) => {
                  const current_folders = mail_item?.folders || [];
                  const is_current = current_folders.some(
                    (f) => f.token === folder.id,
                  );

                  return (
                    <DropdownMenuItem
                      key={folder.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        on_folder_toggle(folder.id);
                      }}
                    >
                      {is_current && (
                        <CheckIcon className="mr-0.5 h-3 w-3 flex-shrink-0" />
                      )}
                      <span
                        className="mr-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={
                          folder.color.startsWith("#")
                            ? { backgroundColor: folder.color }
                            : {}
                        }
                      />
                      <span className="truncate">{folder.name}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip tip={t("mail.move_to_folder")}>
              <Button
                className={btn_base}
                disabled
                size="icon"
                style={muted_style}
                variant="ghost"
              >
                <FolderIcon className={icon_size} />
              </Button>
            </Tooltip>
          )}
        </>
      )}

      {!spread_layout && collapse_expand_button}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={`${button_size} hover:!text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}
            size="icon"
            style={muted_style}
            title={t("common.more")}
            variant="ghost"
          >
            <EllipsisHorizontalIcon className={icon_size} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={dropdown_align} className="w-48">
          <DropdownMenuItem onClick={on_read_toggle}>
            {is_read ? (
              <>
                <EnvelopeIcon className="w-4 h-4 mr-2" />
                {t("mail.mark_as_unread")}
              </>
            ) : (
              <>
                <EnvelopeOpenIcon className="w-4 h-4 mr-2" />
                {t("mail.mark_as_read")}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={on_pin_toggle}>
            <PinIcon
              className={`w-4 h-4 mr-2 ${is_pinned ? "-rotate-[38deg] text-blue-500" : ""}`}
              filled={is_pinned}
            />
            {is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {is_spam && on_not_spam ? (
            <DropdownMenuItem disabled={is_spam_loading} onClick={on_not_spam}>
              <NoSymbolIcon className="w-4 h-4 mr-2" />
              {t("mail.not_spam")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={is_spam_loading} onClick={on_spam}>
              <NoSymbolIcon className="w-4 h-4 mr-2" />
              {t("mail.report_spam")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={is_trash_loading} onClick={on_trash}>
            <TrashIcon className="w-4 h-4 mr-2" />
            {mail_item?.is_trashed || email?.is_trashed
              ? t("mail.delete_permanently")
              : t("mail.move_to_trash")}
          </DropdownMenuItem>
          {folders.length > 0 && on_folder_toggle ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderIcon className="w-4 h-4 mr-2" />
                {t("mail.move_to_folder")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {folders.map((folder) => {
                  const current_folders = mail_item?.folders || [];
                  const is_current = current_folders.some(
                    (f) => f.token === folder.id,
                  );

                  return (
                    <DropdownMenuItem
                      key={folder.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        on_folder_toggle(folder.id);
                      }}
                    >
                      {is_current && (
                        <CheckIcon className="mr-0.5 h-3 w-3 flex-shrink-0" />
                      )}
                      <span
                        className="mr-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={
                          folder.color.startsWith("#")
                            ? { backgroundColor: folder.color }
                            : {}
                        }
                      />
                      <span className="truncate">{folder.name}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem disabled>
              <FolderIcon className="w-4 h-4 mr-2" />
              {t("mail.move_to_folder")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={on_print}>
            <PrinterIcon className="w-4 h-4 mr-2" />
            {t("mail.print")}
          </DropdownMenuItem>
          {thread_messages.length > 1 && thread_expand_state.has_unread && (
            <DropdownMenuItem
              onClick={() => thread_list_ref.current?.mark_all_read()}
            >
              <CheckCircleIcon className="w-4 h-4 mr-2" />
              {t("mail.mark_all_read")}
            </DropdownMenuItem>
          )}
          {email.unsubscribe_info?.has_unsubscribe && (
            <DropdownMenuItem onClick={on_unsubscribe}>
              <XMarkIcon className="w-4 h-4 mr-2" />
              {t("mail.unsubscribe")}
            </DropdownMenuItem>
          )}
          {show_block_sender_on_alias && on_block_sender_on_alias && (
            <DropdownMenuItem onClick={on_block_sender_on_alias}>
              <NoSymbolIcon className="w-4 h-4 mr-2" />
              {t("mail.block_sender_on_alias")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              update_preference(
                "viewer_toolbar_mode",
                is_advanced ? "simple" : "advanced",
                true,
              )
            }
          >
            <AdjustmentsHorizontalIcon className="w-4 h-4 mr-2" />
            {is_advanced
              ? t("common.switch_to_simple")
              : t("common.switch_to_advanced")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {spread_layout && <div className="flex-1" />}

      {spread_layout && collapse_expand_button}

      {nav_buttons}
    </>
  );
}

