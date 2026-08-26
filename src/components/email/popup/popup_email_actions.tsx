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
import type { UnsubscribeInfo } from "@/types/email";
import type { MailItem } from "@/services/api/mail";
import type { TranslationKey } from "@/lib/i18n";
import type { PopupSize } from "@/components/email/hooks/use_popup_viewer";

import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  EllipsisHorizontalIcon,
  PrinterIcon,
  FolderIcon,
  NoSymbolIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

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

interface PopupEmailActionsProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  popup_size: PopupSize;
  is_fullscreen: boolean;
  is_dragging: boolean;
  is_read: boolean;
  is_pinned: boolean;
  is_pin_loading: boolean;
  is_archive_loading: boolean;
  is_spam_loading: boolean;
  is_trash_loading: boolean;
  mail_item: MailItem | null;
  is_spam: boolean;
  folders: Array<{ id: string; name: string; color: string }>;
  on_folder_toggle: (folder_token: string) => void;
  unsubscribe_info: UnsubscribeInfo | null;
  on_close: () => void;
  on_drag_start: (e: React.MouseEvent) => void;
  on_toggle_size: () => void;
  on_fullscreen: () => void;
  on_pin_toggle: () => void;
  on_archive: () => void;
  on_spam: () => void;
  on_not_spam: () => void;
  on_trash: () => void;
  on_read_toggle: () => void;
  on_print: () => void;
  on_unsubscribe: () => void;
}

export function PopupEmailActions({
  t,
  popup_size,
  is_fullscreen,
  is_dragging,
  is_read,
  is_pinned,
  is_pin_loading,
  is_archive_loading,
  is_spam_loading,
  is_trash_loading,
  mail_item,
  is_spam,
  folders,
  on_folder_toggle,
  unsubscribe_info,
  on_close,
  on_drag_start,
  on_toggle_size,
  on_fullscreen,
  on_pin_toggle,
  on_archive,
  on_spam,
  on_not_spam,
  on_trash,
  on_read_toggle,
  on_print,
  on_unsubscribe,
}: PopupEmailActionsProps) {
  return (
    <div
      className="flex items-center gap-1 px-3 py-2 flex-shrink-0 select-none border-b border-edge-primary"
      role="presentation"
      style={{
        cursor: is_fullscreen ? "default" : is_dragging ? "grabbing" : "grab",
        borderTopLeftRadius: is_fullscreen ? "16px" : "12px",
        borderTopRightRadius: is_fullscreen ? "16px" : "12px",
      }}
      onMouseDown={on_drag_start}
    >
      <Tooltip tip={t("common.close")}>
        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          size="icon"
          variant="ghost"
          onClick={on_close}
        >
          <XMarkIcon className="w-4 h-4" />
        </Button>
      </Tooltip>

      {!is_fullscreen && (
        <Tooltip
          tip={
            popup_size === "default" ? t("common.expand") : t("common.minimize")
          }
        >
          <Button
            data-no-drag
            className="h-7 w-7 text-txt-muted hover:text-txt-primary"
            size="icon"
            variant="ghost"
            onClick={on_toggle_size}
          >
            {popup_size === "default" ? (
              <ArrowsPointingOutIcon className="w-4 h-4" />
            ) : (
              <ArrowsPointingInIcon className="w-4 h-4" />
            )}
          </Button>
        </Tooltip>
      )}

      <Tooltip
        tip={
          is_fullscreen ? t("common.exit_fullscreen") : t("common.fullscreen")
        }
      >
        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          size="icon"
          variant="ghost"
          onClick={on_fullscreen}
        >
          {is_fullscreen ? (
            <ArrowsPointingInIcon className="w-4 h-4" />
          ) : (
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          )}
        </Button>
      </Tooltip>

      <div className="flex-1" />

      <Tooltip tip={is_pinned ? t("mail.unpin") : t("mail.pin_to_top")}>
        <Button
          data-no-drag
          className={`h-7 w-7 ${is_pinned ? "text-blue-500" : "text-txt-muted hover:text-blue-500"}`}
          disabled={is_pin_loading}
          size="icon"
          variant="ghost"
          onClick={on_pin_toggle}
        >
          <PinIcon
            className={`w-4 h-4 ${is_pinned ? "-rotate-[38deg]" : ""}`}
            filled={is_pinned}
          />
        </Button>
      </Tooltip>

      <Tooltip
        tip={
          mail_item?.is_archived
            ? t("mail.move_to_inbox")
            : t("mail.archive")
        }
      >
        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          disabled={is_archive_loading}
          size="icon"
          variant="ghost"
          onClick={on_archive}
        >
          <ArchiveBoxIcon className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip tip={is_spam ? t("mail.not_spam") : t("mail.report_spam")}>
        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          disabled={is_spam_loading}
          size="icon"
          variant="ghost"
          onClick={is_spam ? on_not_spam : on_spam}
        >
          <NoSymbolIcon className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip tip={t("mail.move_to_trash")}>
        <Button
          data-no-drag
          className="h-7 w-7 text-txt-muted hover:text-txt-primary"
          disabled={is_trash_loading}
          size="icon"
          variant="ghost"
          onClick={on_trash}
        >
          <TrashIcon className="w-4 h-4" />
        </Button>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-no-drag
            className="h-7 w-7 text-txt-muted hover:text-txt-primary"
            size="icon"
            title={t("common.more")}
            variant="ghost"
          >
            <EllipsisHorizontalIcon className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
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
            {is_pinned ? t("mail.unpin") : t("common.pinned_to_top")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={is_spam_loading}
            onClick={is_spam ? on_not_spam : on_spam}
          >
            <NoSymbolIcon className="w-4 h-4 mr-2" />
            {is_spam ? t("mail.not_spam") : t("mail.report_spam")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={is_trash_loading} onClick={on_trash}>
            <TrashIcon className="w-4 h-4 mr-2" />
            {mail_item?.is_trashed
              ? t("mail.delete_permanently")
              : t("mail.move_to_trash")}
          </DropdownMenuItem>
          {folders.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderIcon className="w-4 h-4 mr-2" />
                {t("mail.move_to_folder")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {folders.map((folder) => {
                  const is_current = (mail_item?.folders || []).some(
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
          {unsubscribe_info?.has_unsubscribe && (
            <DropdownMenuItem onClick={on_unsubscribe}>
              <XMarkIcon className="w-4 h-4 mr-2" />
              {t("mail.unsubscribe")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
