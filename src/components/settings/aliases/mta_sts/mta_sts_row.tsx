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
import type { CustomDomain } from "@/services/api/domains";

import { useState } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button, UpgradeBtn } from "@aster/ui";

import { MtaStsModal } from "./mta_sts_modal";
import { MtaStsStateChip } from "./mta_sts_state_chip";
import { mta_sts_row_message } from "./mta_sts_copy";

import { use_i18n } from "@/lib/i18n/context";
import { normalize_mta_sts_state } from "@/services/api/mta_sts";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";

interface MtaStsRowProps {
  domain: CustomDomain;
  on_changed: () => void;
}

export function MtaStsRow({ domain, on_changed }: MtaStsRowProps) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const state = normalize_mta_sts_state(domain.mta_sts_state);
  const active = domain.status === "active";
  const locked = state === "locked";
  const can_open = !locked && (active || state === "retiring");
  const message =
    locked || can_open
      ? mta_sts_row_message(state, domain.purchased === true)
      : "settings.mta_sts_row_inactive";

  return (
    <div
      className="flex items-center gap-3 py-4 mb-3 border-b border-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))]"
      data-testid="mta-sts-row"
    >
      <ShieldCheckIcon
        aria-hidden="true"
        className="w-5 h-5 flex-shrink-0 self-start mt-0.5 text-txt-muted"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.mta_sts_title")}
          </p>
          <MtaStsStateChip state={state} />
        </div>
        <p className="text-sm mt-0.5 text-txt-muted">{t(message)}</p>
      </div>
      {locked ? (
        <UpgradeBtn
          size="sm"
          onClick={() =>
            prompt_upgrade(
              t("settings.mta_sts_locked_description"),
              undefined,
              "has_mta_sts_hosting",
            )
          }
        >
          {t("common.upgrade")}
        </UpgradeBtn>
      ) : (
        <Button
          className="disabled:opacity-50"
          disabled={!can_open}
          variant="outline"
          onClick={() => set_open(true)}
        >
          {state === "off" ? t("settings.mta_sts_set_up") : t("common.manage")}
        </Button>
      )}
      {can_open && (
        <MtaStsModal
          domain={domain}
          is_open={open}
          on_close={(changed) => {
            set_open(false);
            if (changed) on_changed();
          }}
        />
      )}
    </div>
  );
}
