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
import { ClockIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { list_select_slot_class } from "@/lib/list_density";
import { cn } from "@/lib/utils";

interface TrashBannerProps {
  retention_days?: number;
  view?: "trash" | "spam";
  family_enforced?: boolean;
  compact?: boolean;
  show_profile_pictures?: boolean;
}

export function TrashBanner({
  retention_days = 30,
  view = "trash",
  family_enforced = false,
  compact = true,
  show_profile_pictures = true,
}: TrashBannerProps) {
  const { t } = use_i18n();

  const message_key =
    view === "spam"
      ? family_enforced
        ? "mail.spam_auto_delete_notice_family"
        : "mail.spam_auto_delete_notice"
      : family_enforced
        ? "mail.trash_auto_delete_notice_family"
        : "mail.trash_auto_delete_notice";

  return (
    <div
      className={cn(
        "flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-b border-edge-secondary text-sm text-txt-muted shrink-0",
        compact ? "py-2" : "py-2.5",
      )}
      data-testid="retention-notice"
      role="note"
    >
      <span
        className={cn(
          "flex flex-shrink-0 items-center justify-center",
          list_select_slot_class(compact, show_profile_pictures),
          "h-auto",
        )}
      >
        <ClockIcon aria-hidden="true" className="w-4 h-4" />
      </span>
      <span className="min-w-0 text-pretty">
        {t(message_key, { days: retention_days })}
      </span>
    </div>
  );
}
