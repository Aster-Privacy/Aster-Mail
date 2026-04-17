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
import type { NavigateFunction } from "react-router-dom";

import {
  ArrowLeftIcon,
  ArchiveBoxIcon,
  TrashIcon,
  TagIcon,
  EllipsisVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { MobileMenuButton } from "@/components/layout/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";

interface EmailDetailHeaderProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  navigate: NavigateFunction;
  toggle_mobile_sidebar: () => void;
  preferences: {
    confirm_before_archive: boolean;
    confirm_before_delete: boolean;
  };
  set_is_archive_confirm_open: (open: boolean) => void;
  set_is_trash_confirm_open: (open: boolean) => void;
  handle_archive: () => void;
  handle_trash: () => void;
  handle_print: () => void;
  is_archive_loading: boolean;
  is_trash_loading: boolean;
  email_list: string[];
  current_email_index: number;
  can_go_newer: boolean;
  can_go_older: boolean;
  handle_go_newer: () => void;
  handle_go_older: () => void;
}

export function EmailDetailHeader({
  t,
  navigate,
  toggle_mobile_sidebar,
  preferences,
  set_is_archive_confirm_open,
  set_is_trash_confirm_open,
  handle_archive,
  handle_trash,
  handle_print,
  is_archive_loading,
  is_trash_loading,
  email_list,
  current_email_index,
  can_go_newer,
  can_go_older,
  handle_go_newer,
  handle_go_older,
}: EmailDetailHeaderProps) {
  return (
    <div className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b flex-shrink-0 border-edge-secondary">
      <div className="md:hidden mr-1">
        <MobileMenuButton on_click={toggle_mobile_sidebar} />
      </div>
      <Tooltip tip={t("common.back")}>
        <Button
          className="h-9 w-9 sm:h-8 sm:w-8"
          size="icon"
          variant="ghost"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftIcon className="w-5 h-5 sm:w-4 sm:h-4 text-txt-secondary" />
        </Button>
      </Tooltip>

      <div className="hidden sm:block w-px h-5 mx-1 bg-edge-secondary" />

      <div className="hidden sm:flex items-center gap-1">
        <Tooltip tip={t("common.labels")}>
          <Button className="h-8 w-8" size="icon" variant="ghost">
            <TagIcon className="w-4 h-4 text-txt-secondary" />
          </Button>
        </Tooltip>

        <Tooltip tip={t("mail.archive")}>
          <Button
            className="h-8 w-8"
            disabled={is_archive_loading}
            size="icon"
            variant="ghost"
            onClick={() =>
              preferences.confirm_before_archive
                ? set_is_archive_confirm_open(true)
                : handle_archive()
            }
          >
            <ArchiveBoxIcon className="w-4 h-4 text-txt-secondary" />
          </Button>
        </Tooltip>

        <Tooltip tip={t("mail.report_spam")}>
          <Button className="h-8 w-8" size="icon" variant="ghost">
            <ExclamationCircleIcon className="w-4 h-4 text-txt-secondary" />
          </Button>
        </Tooltip>

        <Tooltip tip={t("mail.move_to_trash")}>
          <Button
            className="h-8 w-8"
            disabled={is_trash_loading}
            size="icon"
            variant="ghost"
            onClick={() =>
              preferences.confirm_before_delete
                ? set_is_trash_confirm_open(true)
                : handle_trash()
            }
          >
            <TrashIcon className="w-4 h-4 text-txt-secondary" />
          </Button>
        </Tooltip>

        <div className="hidden lg:block w-px h-5 mx-1 bg-edge-secondary" />

        <div className="hidden lg:flex items-center gap-1">
          <Tooltip tip={t("common.download")}>
            <Button className="h-8 w-8" size="icon" variant="ghost">
              <ArrowDownTrayIcon className="w-4 h-4 text-txt-secondary" />
            </Button>
          </Tooltip>

          <Tooltip tip={t("mail.print")}>
            <Button
              className="h-8 w-8"
              size="icon"
              variant="ghost"
              onClick={handle_print}
            >
              <PrinterIcon className="w-4 h-4 text-txt-secondary" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="lg:hidden h-8 w-8"
            size="icon"
            title={t("common.more")}
            variant="ghost"
          >
            <EllipsisVerticalIcon className="w-4 h-4 text-txt-secondary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <div className="sm:hidden">
            <DropdownMenuItem
              onClick={() =>
                preferences.confirm_before_archive
                  ? set_is_archive_confirm_open(true)
                  : handle_archive()
              }
            >
              <ArchiveBoxIcon className="w-4 h-4 mr-2" />
              {t("mail.archive")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                preferences.confirm_before_delete
                  ? set_is_trash_confirm_open(true)
                  : handle_trash()
              }
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              {t("common.delete")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <TagIcon className="w-4 h-4 mr-2" />
              {t("mail.move_to_folder")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ExclamationCircleIcon className="w-4 h-4 mr-2" />
              {t("mail.report_spam")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </div>
          <div className="lg:hidden sm:block hidden">
            <DropdownMenuItem>
              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
              {t("common.download")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handle_print}>
              <PrinterIcon className="w-4 h-4 mr-2" />
              {t("mail.print")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </div>
          <DropdownMenuItem>
            <DocumentTextIcon className="w-4 h-4 mr-2" />
            {t("mail.view_source")}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
            {t("mail.open_in_new_window")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {email_list.length > 0 && current_email_index !== -1 && (
        <span className="hidden sm:inline text-xs text-txt-muted mr-1">
          {current_email_index + 1} of {email_list.length}
        </span>
      )}
      <Tooltip tip={t("common.previous")}>
        <Button
          className="h-7 w-7"
          disabled={!can_go_newer}
          size="icon"
          variant="ghost"
          onClick={handle_go_newer}
        >
          <ChevronLeftIcon className="w-4 h-4 text-txt-secondary" />
        </Button>
      </Tooltip>
      <Tooltip tip={t("common.next")}>
        <Button
          className="h-7 w-7"
          disabled={!can_go_older}
          size="icon"
          variant="ghost"
          onClick={handle_go_older}
        >
          <ChevronRightIcon className="w-4 h-4 text-txt-secondary" />
        </Button>
      </Tooltip>
    </div>
  );
}
