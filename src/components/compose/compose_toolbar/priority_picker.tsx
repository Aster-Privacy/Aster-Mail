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
import type { ComposeToolbarState } from "@/components/compose/compose_shared";
import type { MailPriority } from "@/services/mail_priority";

import { CheckIcon, FlagIcon } from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { PriorityBadge } from "@/components/email/priority_badge";
import { use_i18n } from "@/lib/i18n/context";
import { MAIL_PRIORITIES } from "@/services/mail_priority";

const PRIORITY_LABEL_KEYS: Record<MailPriority, TranslationKey> = {
  high: "mail.priority_high",
  normal: "mail.priority_normal",
  low: "mail.priority_low",
};

export function PriorityPicker({ compose }: { compose: ComposeToolbarState }) {
  const { t } = use_i18n();
  const set_priority = compose.set_priority;
  const priority = compose.priority ?? "normal";

  if (!set_priority) return null;

  const is_set = priority !== "normal";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("mail.priority")}
          className={`press_scale w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full transition-transform duration-150 ${is_set ? "bg-black/10 text-txt-primary dark:bg-white/10 dark:text-white" : "hover:bg-[var(--aster-hover)] text-txt-tertiary hover:text-txt-primary"}`}
          title={t("mail.priority")}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
        >
          <FlagIcon className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {MAIL_PRIORITIES.map((level) => (
          <DropdownMenuItem
            key={level}
            aria-checked={level === priority}
            role="menuitemradio"
            onClick={() => set_priority(level)}
          >
            <CheckIcon
              aria-hidden
              className={`w-4 h-4 ${level === priority ? "opacity-100" : "opacity-0"}`}
            />
            {t(PRIORITY_LABEL_KEYS[level])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityTag({ compose }: { compose: ComposeToolbarState }) {
  if (!compose.set_priority) return null;

  return <PriorityBadge priority={compose.priority ?? "normal"} />;
}
