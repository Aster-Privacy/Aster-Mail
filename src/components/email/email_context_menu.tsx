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

import { useState, useCallback, useRef } from "react";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  MapPinIcon,
  FolderPlusIcon,
  TagIcon,
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  PrinterIcon,
  InboxIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  ClockIcon,
  CalendarIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context_menu";

interface FolderOption {
  id: string;
  name: string;
  color: string;
}

interface TagOption {
  tag_token: string;
  name: string;
  color: string;
  is_assigned: boolean;
}

interface EmailContextMenuProps {
  children: React.ReactNode;
  email: InboxEmail;
  folders?: FolderOption[];
  tags?: TagOption[];
  current_view?: string;
  on_reply?: () => void;
  on_forward?: () => void;
  on_toggle_read?: () => void;
  on_toggle_pin?: () => void;
  on_snooze?: (snooze_until: Date) => Promise<void>;
  on_custom_snooze?: () => void;
  on_unsnooze?: () => Promise<void>;
  on_archive?: () => void;
  on_spam?: () => void;
  on_delete?: () => void;
  on_print?: () => void;
  on_folder_toggle?: (folder_id: string) => void;
  on_tag_toggle?: (tag_token: string) => void;
  on_move_to_inbox?: () => void;
  on_restore?: () => void;
  on_mark_not_spam?: () => void;
  disabled?: boolean;
}

function get_folder_style(color: string): React.CSSProperties {
  if (color.startsWith("#")) {
    return { backgroundColor: color };
  }

  return {};
}

export function EmailContextMenu({
  children,
  email,
  folders = [],
  tags = [],
  current_view = "inbox",
  on_reply,
  on_forward,
  on_toggle_read,
  on_toggle_pin,
  on_snooze,
  on_custom_snooze,
  on_unsnooze,
  on_archive,
  on_spam,
  on_delete,
  on_print,
  on_folder_toggle,
  on_tag_toggle,
  on_move_to_inbox,
  on_restore,
  on_mark_not_spam,
  disabled = false,
}: EmailContextMenuProps): React.ReactElement {
  const { t } = use_i18n();
  const [loading_action, set_loading_action] = useState<string | null>(null);
  const close_time_ref = useRef(0);

  const handle_open_change = useCallback((open: boolean) => {
    if (!open) {
      close_time_ref.current = Date.now();
    }
  }, []);

  const handle_action = useCallback(
    async (action_name: string, handler?: () => void | Promise<void>) => {
      if (!handler || disabled) return;
      set_loading_action(action_name);
      try {
        await handler();
      } finally {
        set_loading_action(null);
      }
    },
    [disabled],
  );

  const is_trash = current_view === "trash" || email.is_trashed;
  const is_spam = current_view === "spam" || email.is_spam;
  const is_archive = current_view === "archive" || email.is_archived;
  const is_sent = current_view === "sent";
  const is_drafts = current_view === "drafts";
  const is_scheduled = current_view === "scheduled";

  const email_folders = email.folders || [];
  const current_folder_id =
    email_folders.length > 0 ? email_folders[0].folder_token : "";

  const handle_trigger_context_menu = useCallback((e: React.MouseEvent) => {
    if (Date.now() - close_time_ref.current < 300) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <ContextMenu modal={false} onOpenChange={handle_open_change}>
      <ContextMenuTrigger asChild onContextMenu={handle_trigger_context_menu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {on_reply && !is_sent && (
          <ContextMenuItem
            disabled={loading_action === "reply"}
            onClick={() => handle_action("reply", on_reply)}
          >
            <ArrowUturnLeftIcon className="mr-2 h-4 w-4" />
            {t("mail.reply")}
          </ContextMenuItem>
        )}

        {on_forward && (
          <ContextMenuItem
            disabled={loading_action === "forward"}
            onClick={() => handle_action("forward", on_forward)}
          >
            <ArrowUturnRightIcon className="mr-2 h-4 w-4" />
            {t("mail.forward")}
          </ContextMenuItem>
        )}

        {(on_reply || on_forward) && !is_sent && <ContextMenuSeparator />}

        {on_toggle_read && (
          <ContextMenuItem
            disabled={loading_action === "read"}
            onClick={() => handle_action("read", on_toggle_read)}
          >
            {email.is_read ? (
              <>
                <EnvelopeIcon className="mr-2 h-4 w-4" />
                {t("mail.mark_as_unread")}
              </>
            ) : (
              <>
                <EnvelopeOpenIcon className="mr-2 h-4 w-4" />
                {t("mail.mark_as_read")}
              </>
            )}
          </ContextMenuItem>
        )}

        {on_toggle_pin && !is_drafts && !is_scheduled && (
          <ContextMenuItem
            disabled={loading_action === "pin"}
            onClick={() => handle_action("pin", on_toggle_pin)}
          >
            <MapPinIcon
              className={`mr-2 h-4 w-4 ${email.is_pinned ? "fill-blue-500 text-blue-500" : ""}`}
            />
            {email.is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}
          </ContextMenuItem>
        )}

        {!is_drafts &&
          !is_scheduled &&
          !is_trash &&
          email.snoozed_until &&
          on_unsnooze && (
            <ContextMenuItem
              disabled={loading_action === "unsnooze"}
              onClick={() => handle_action("unsnooze", on_unsnooze)}
            >
              <ClockIcon className="mr-2 h-4 w-4" />
              {t("mail.unsnooze")}
            </ContextMenuItem>
          )}

        {!is_drafts &&
          !is_scheduled &&
          !is_trash &&
          !email.snoozed_until &&
          on_snooze && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ClockIcon className="mr-2 h-4 w-4" />
                {t("mail.snooze")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem
                  onClick={() => {
                    const date = new Date();

                    date.setHours(date.getHours() + 4);
                    handle_action("snooze", () => on_snooze(date));
                  }}
                >
                  {t("mail.later_today_snooze")}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const date = new Date();

                    date.setDate(date.getDate() + 1);
                    date.setHours(9, 0, 0, 0);
                    handle_action("snooze", () => on_snooze(date));
                  }}
                >
                  {t("mail.tomorrow_snooze")}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const date = new Date();
                    const day = date.getDay();
                    const days_until_saturday =
                      day === 6 ? 7 : (6 - day + 7) % 7;

                    date.setDate(date.getDate() + days_until_saturday);
                    date.setHours(9, 0, 0, 0);
                    handle_action("snooze", () => on_snooze(date));
                  }}
                >
                  {t("mail.this_weekend_snooze")}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const date = new Date();

                    date.setDate(date.getDate() + 7);
                    date.setHours(9, 0, 0, 0);
                    handle_action("snooze", () => on_snooze(date));
                  }}
                >
                  {t("mail.next_week_snooze")}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    const date = new Date();

                    date.setMonth(date.getMonth() + 1);
                    date.setHours(9, 0, 0, 0);
                    handle_action("snooze", () => on_snooze(date));
                  }}
                >
                  {t("common.next_month")}
                </ContextMenuItem>
                {on_custom_snooze && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={on_custom_snooze}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {t("mail.pick_date_time")}
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

        {((folders.length > 0 && on_folder_toggle) ||
          (tags.length > 0 && on_tag_toggle) ||
          (is_archive && on_move_to_inbox)) && <ContextMenuSeparator />}

        {folders.length > 0 && on_folder_toggle && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderPlusIcon className="mr-2 h-4 w-4" />
              {t("mail.folder")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {folders.map((folder) => (
                <ContextMenuItem
                  key={folder.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    on_folder_toggle(folder.id);
                  }}
                >
                  {current_folder_id === folder.id && (
                    <CheckIcon className="mr-0.5 h-3 w-3 flex-shrink-0" />
                  )}
                  <span
                    className="mr-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={get_folder_style(folder.color)}
                  />
                  <span className="truncate">{folder.name}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {tags.length > 0 && on_tag_toggle && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <TagIcon className="mr-2 h-4 w-4" />
              {t("common.labels")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {tags.map((tag) => (
                <ContextMenuItem
                  key={tag.tag_token}
                  onSelect={(e) => {
                    e.preventDefault();
                    on_tag_toggle(tag.tag_token);
                  }}
                >
                  {tag.is_assigned && (
                    <CheckIcon className="mr-0.5 h-3 w-3 flex-shrink-0" />
                  )}
                  <span
                    className="mr-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.name}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {is_archive && on_move_to_inbox && (
          <ContextMenuItem
            disabled={loading_action === "move_inbox"}
            onClick={() => handle_action("move_inbox", on_move_to_inbox)}
          >
            <InboxIcon className="mr-2 h-4 w-4" />
            {t("mail.move_to_inbox")}
          </ContextMenuItem>
        )}

        {(is_trash ||
          is_spam ||
          (!is_trash && !is_spam && (on_archive || on_spam)) ||
          on_delete) && <ContextMenuSeparator />}

        {is_trash && on_restore && (
          <ContextMenuItem
            disabled={loading_action === "restore"}
            onClick={() => handle_action("restore", on_restore)}
          >
            <ArrowPathIcon className="mr-2 h-4 w-4" />
            {t("mail.restore")}
          </ContextMenuItem>
        )}

        {is_spam && on_mark_not_spam && (
          <ContextMenuItem
            disabled={loading_action === "not_spam"}
            onClick={() => handle_action("not_spam", on_mark_not_spam)}
          >
            <ShieldExclamationIcon className="mr-2 h-4 w-4" />
            {t("mail.not_spam")}
          </ContextMenuItem>
        )}

        {!is_trash && !is_spam && on_archive && !is_archive && (
          <ContextMenuItem
            disabled={loading_action === "archive"}
            onClick={() => handle_action("archive", on_archive)}
          >
            <ArchiveBoxIcon className="mr-2 h-4 w-4" />
            {t("mail.archive")}
          </ContextMenuItem>
        )}

        {!is_trash && !is_spam && on_spam && (
          <ContextMenuItem
            disabled={loading_action === "spam"}
            onClick={() => handle_action("spam", on_spam)}
          >
            <ExclamationTriangleIcon className="mr-2 h-4 w-4" />
            {t("mail.report_spam")}
          </ContextMenuItem>
        )}

        {on_delete && (
          <ContextMenuItem
            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
            disabled={loading_action === "delete"}
            onClick={() => handle_action("delete", on_delete)}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            {is_trash || is_drafts
              ? t("mail.delete_permanently")
              : t("mail.move_to_trash")}
          </ContextMenuItem>
        )}

        {on_print && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={loading_action === "print"}
              onClick={() => handle_action("print", on_print)}
            >
              <PrinterIcon className="mr-2 h-4 w-4" />
              {t("mail.print")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
