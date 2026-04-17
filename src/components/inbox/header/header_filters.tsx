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

import { FunnelIcon, CheckIcon } from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";

interface FilterDropdownProps {
  active_filter: InboxFilterType;
  on_filter_change?: (filter: InboxFilterType) => void;
}

export function FilterDropdown({
  active_filter,
  on_filter_change,
}: FilterDropdownProps) {
  const { t } = use_i18n();

  return (
    <DropdownMenu>
      <Tooltip tip={t("mail.filter")}>
        <DropdownMenuTrigger asChild>
          <Button
            className={`hidden md:flex h-8 w-8 hover:bg-[var(--bg-hover)] ${active_filter !== "all" ? "text-blue-500" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
            size="icon"
            variant="ghost"
          >
            <FunnelIcon className="w-[18px] h-[18px]" />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("mail.filter")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => on_filter_change?.("all")}>
          <span className="w-4 mr-2">
            {active_filter === "all" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.all_emails")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => on_filter_change?.("unread")}>
          <span className="w-4 mr-2">
            {active_filter === "unread" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.unread_only")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => on_filter_change?.("read")}>
          <span className="w-4 mr-2">
            {active_filter === "read" && <CheckIcon className="w-4 h-4" />}
          </span>
          {t("mail.read_only")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => on_filter_change?.("attachments")}>
          <span className="w-4 mr-2">
            {active_filter === "attachments" && (
              <CheckIcon className="w-4 h-4" />
            )}
          </span>
          {t("mail.with_attachments")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
