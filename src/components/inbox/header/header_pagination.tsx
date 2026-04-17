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
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

interface HeaderPaginationProps {
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev: boolean;
  can_go_next: boolean;
  current_email_index?: number;
  total_email_count: number;
  filtered_count: number;
  current_page: number;
  page_size: number;
  on_page_change?: (page: number) => void;
}

export function HeaderPagination({
  on_navigate_prev,
  on_navigate_next,
  can_go_prev,
  can_go_next,
  current_email_index,
  total_email_count,
  filtered_count,
  current_page,
  page_size,
  on_page_change,
}: HeaderPaginationProps) {
  const { t } = use_i18n();

  if (!on_navigate_prev && !on_navigate_next && !on_page_change) {
    return null;
  }

  return (
    <div className="hidden lg:flex items-center gap-1 text-xs text-[var(--text-muted)] ml-1">
      <Tooltip tip={t("common.previous")}>
        <Button
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          disabled={
            on_navigate_prev
              ? !can_go_prev
              : on_page_change
                ? current_page === 0
                : true
          }
          size="icon"
          variant="ghost"
          onClick={() => {
            if (on_navigate_prev && can_go_prev) {
              on_navigate_prev();
            } else if (on_page_change) {
              on_page_change(current_page - 1);
            }
          }}
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </Button>
      </Tooltip>
      <span className="tabular-nums text-sm min-w-[3ch] text-center">
        {on_navigate_prev || on_navigate_next ? (
          <>
            {current_email_index !== undefined ? current_email_index + 1 : 0}
            {total_email_count > 0 && (
              <>
                {" "}
                {t("common.of")} {total_email_count}
              </>
            )}
          </>
        ) : (
          <>
            {filtered_count > 0
              ? `${current_page + 1} ${t("common.of")} ${Math.ceil(filtered_count / page_size)}`
              : "0"}
          </>
        )}
      </span>
      <Tooltip tip={t("common.next")}>
        <Button
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          disabled={
            on_navigate_next
              ? !can_go_next
              : on_page_change
                ? current_page >= Math.ceil(filtered_count / page_size) - 1
                : true
          }
          size="icon"
          variant="ghost"
          onClick={() => {
            if (on_navigate_next && can_go_next) {
              on_navigate_next();
            } else if (on_page_change) {
              on_page_change(current_page + 1);
            }
          }}
        >
          <ChevronRightIcon className="w-4 h-4" />
        </Button>
      </Tooltip>
    </div>
  );
}
