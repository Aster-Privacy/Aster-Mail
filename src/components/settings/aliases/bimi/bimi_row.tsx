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
import { PhotoIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { BimiModal } from "./bimi_modal";
import { BimiStateChip } from "./bimi_state_chip";
import { bimi_row_message, normalize_bimi_state } from "./bimi_copy";

import { use_i18n } from "@/lib/i18n/context";

interface BimiRowProps {
  domain: CustomDomain;
  on_changed: () => void;
}

export function BimiRow({ domain, on_changed }: BimiRowProps) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const state = normalize_bimi_state(domain.bimi_state);
  const active = domain.status === "active";
  const message = active
    ? bimi_row_message(state, domain.purchased === true)
    : "settings.bimi_row_inactive";

  return (
    <div className="flex items-center gap-3 py-4 mb-3 border-y border-edge-secondary">
      <PhotoIcon
        aria-hidden="true"
        className="w-5 h-5 flex-shrink-0 self-start mt-0.5 text-txt-muted"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.bimi_title")}
          </p>
          <BimiStateChip state={state} />
        </div>
        <p className="text-sm mt-0.5 text-txt-muted">{t(message)}</p>
      </div>
      <Button
        className="disabled:opacity-50"
        disabled={!active}
        variant="outline"
        onClick={() => set_open(true)}
      >
        {state === "off" ? t("settings.bimi_set_up") : t("common.manage")}
      </Button>
      {active && (
        <BimiModal
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
