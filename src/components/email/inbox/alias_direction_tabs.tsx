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

import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  InboxArrowDownIcon,
  InboxStackIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";

import {
  ALIAS_DIRECTIONS,
  DEFAULT_ALIAS_DIRECTION,
  type AliasDirection,
} from "@/hooks/email_list_helpers/alias_view";
import { use_i18n } from "@/lib/i18n/context";

const DIRECTION_LABEL_KEYS: Record<AliasDirection, TranslationKey> = {
  all: "mail.alias_direction_all",
  received: "mail.alias_direction_received",
  sent: "mail.alias_direction_sent",
};

const DIRECTION_ICONS: Record<AliasDirection, typeof InboxStackIcon> = {
  all: InboxStackIcon,
  received: InboxArrowDownIcon,
  sent: PaperAirplaneIcon,
};

export function AliasDirectionTabs({
  direction,
}: {
  direction: AliasDirection;
}) {
  const { t } = use_i18n();
  const [search_params, set_search_params] = useSearchParams();

  const select = (next: AliasDirection) => {
    if (next === direction) return;
    const params = new URLSearchParams(search_params);

    if (next === DEFAULT_ALIAS_DIRECTION) {
      params.delete("direction");
    } else {
      params.set("direction", next);
    }
    set_search_params(params, { replace: true });
  };

  return (
    <div
      aria-label={t("mail.alias_direction_label")}
      className="grid shrink-0 select-none grid-cols-3 border-b border-edge-primary bg-surf-primary px-2 sm:flex sm:px-3"
      data-testid="alias_direction_tabs"
      role="tablist"
    >
      {ALIAS_DIRECTIONS.map((candidate) => {
        const is_active = candidate === direction;
        const Icon = DIRECTION_ICONS[candidate];

        return (
          <button
            key={candidate}
            aria-selected={is_active}
            className={`relative flex h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap px-3.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:bg-surf-hover sm:justify-start ${
              is_active
                ? "text-brand"
                : "text-txt-secondary hover:text-txt-primary"
            }`}
            data-testid={`alias_direction_${candidate}`}
            role="tab"
            type="button"
            onClick={() => select(candidate)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 ${is_active ? "text-brand" : "text-txt-muted"}`}
            />
            <span className="truncate">
              {t(DIRECTION_LABEL_KEYS[candidate])}
            </span>
            {is_active && (
              <motion.span
                className="pointer-events-none absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-brand"
                layoutId="alias_direction_underline"
                transition={{ type: "spring", stiffness: 520, damping: 44 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
