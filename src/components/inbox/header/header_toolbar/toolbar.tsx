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

import {
  ArrowPathIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";


export interface HeaderToolbarProps {
  on_settings_click: () => void;
  on_quick_settings_click?: () => void;
  is_trash_view: boolean;
  on_empty_trash?: () => void;
  trash_count: number;
  is_spam_view: boolean;
  on_empty_spam?: () => void;
  spam_count: number;
  handle_refresh: () => void;
  is_refreshing: boolean;
  handle_batch_action: (action: string) => Promise<void>;
  filter_slot?: React.ReactNode;
  leading_slot?: React.ReactNode;
  hide_refresh?: boolean;
  hide_quick_actions?: boolean;
}

export function HeaderToolbar({
  on_settings_click: _on_settings_click,
  on_quick_settings_click: _on_quick_settings_click,
  is_trash_view,
  on_empty_trash,
  trash_count,
  is_spam_view,
  on_empty_spam,
  spam_count,
  handle_refresh,
  is_refreshing,
  handle_batch_action,
  filter_slot,
  leading_slot,
  hide_refresh = false,
  hide_quick_actions = false,
}: HeaderToolbarProps) {
  const { t } = use_i18n();

  return (
    <>
      {is_trash_view && on_empty_trash && trash_count > 0 && (
        <Button
          className="hidden md:flex h-8 px-3 gap-1.5 text-xs font-medium text-red-400/80 hover:text-red-500 hover:bg-red-500/10"
          size="md"
          variant="ghost"
          onClick={on_empty_trash}
        >
          {t("mail.empty_trash_button")}
        </Button>
      )}

      {is_spam_view && on_empty_spam && spam_count > 0 && (
        <Button
          className="hidden md:flex h-8 px-3 gap-1.5 text-xs font-medium text-red-400/80 hover:text-red-500 hover:bg-red-500/10"
          size="md"
          variant="ghost"
          onClick={on_empty_spam}
        >
          {t("mail.empty_spam_button")}
        </Button>
      )}

      {leading_slot}

      {!hide_refresh && (
        <Tooltip tip={t("common.refresh")}>
          <Button
            className="hidden md:flex h-9 w-9 rounded-[10px] text-[var(--icon-secondary)] hover:text-[var(--icon-active)] hover:bg-[var(--bg-hover)]"
            size="icon"
            variant="ghost"
            onClick={handle_refresh}
          >
            <ArrowPathIcon
              className={`w-[18px] h-[18px] ${is_refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </Tooltip>
      )}

      {filter_slot}

      {!hide_quick_actions && (
        <DropdownMenu>
          <Tooltip tip={t("mail.quick_actions")}>
            <DropdownMenuTrigger asChild>
              <Button
                className="hidden md:flex h-9 w-9 rounded-[10px] text-[var(--icon-secondary)] hover:text-[var(--icon-active)] hover:bg-[var(--bg-hover)]"
                size="icon"
                variant="ghost"
              >
                <BoltIcon className="w-[18px] h-[18px]" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("mail.quick_actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handle_batch_action("mark_all_read")}
            >
              {t("mail.mark_all_read")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("archive_all_read")}
            >
              {t("mail.archive_all_read_emails")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handle_batch_action("delete_old")}>
              {t("mail.delete_emails_older_than_30_days")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("mail.sender_actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handle_batch_action("archive_from_sender")}
            >
              {t("mail.archive_all_from_sender")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("delete_from_sender")}
            >
              {t("mail.delete_all_from_sender")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("move_from_sender")}
            >
              {t("mail.move_all_from_sender")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("mail.smart_actions")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handle_batch_action("snooze_similar")}
            >
              {t("mail.snooze_similar_emails")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("unsubscribe_bulk")}
            >
              {t("mail.bulk_unsubscribe")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handle_batch_action("archive_newsletters")}
            >
              {t("mail.archive_all_newsletters")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

