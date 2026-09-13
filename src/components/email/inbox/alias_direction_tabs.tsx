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

import {
  ALIAS_DIRECTIONS,
  DEFAULT_ALIAS_DIRECTION,
  type AliasDirection,
} from "@/hooks/email_list_helpers/alias_view";
import { use_i18n } from "@/lib/i18n/context";
import { chip_class } from "@/components/email/inbox/mail_filter_chips";

const DIRECTION_LABEL_KEYS: Record<AliasDirection, TranslationKey> = {
  all: "mail.alias_direction_all",
  received: "mail.alias_direction_received",
  sent: "mail.alias_direction_sent",
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
      className="flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-[var(--border-secondary)] bg-[var(--bg-primary)]"
      data-testid="alias_direction_tabs"
      role="tablist"
    >
      {ALIAS_DIRECTIONS.map((candidate) => {
        const is_active = candidate === direction;

        return (
          <button
            key={candidate}
            aria-selected={is_active}
            className={chip_class(is_active)}
            data-testid={`alias_direction_${candidate}`}
            role="tab"
            type="button"
            onClick={() => select(candidate)}
          >
            <span>{t(DIRECTION_LABEL_KEYS[candidate])}</span>
          </button>
        );
      })}
    </div>
  );
}
