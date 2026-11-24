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
import type { ReactNode } from "react";

import { button_variants } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

interface CancelStepActionsProps {
  primary_slot?: ReactNode;
  keep_plan_slot?: ReactNode;
  cancel_slot?: ReactNode;
  is_busy?: boolean;
  on_back?: () => void;
  on_cancel?: () => void;
}

export function CancelStepActions({
  primary_slot,
  keep_plan_slot,
  cancel_slot,
  is_busy,
  on_back,
  on_cancel,
}: CancelStepActionsProps) {
  const { t } = use_i18n();

  return (
    <div className="mt-5 flex flex-col gap-2">
      {primary_slot && (
        <div className="flex flex-col [&>*]:w-full">{primary_slot}</div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>*]:mt-0 [&>*]:w-full [&>*]:whitespace-nowrap">
        {keep_plan_slot}
        {cancel_slot ?? (
          <button
            className={button_variants({ variant: "outline" })}
            type="button"
            onClick={on_cancel}
          >
            {t("settings.cancel_now")}
          </button>
        )}
      </div>
      {on_back && (
        <button
          className="mx-auto mt-1 rounded-md px-3 py-1.5 text-sm font-medium text-txt-muted transition-colors hover:text-txt-primary disabled:opacity-50"
          disabled={is_busy}
          type="button"
          onClick={on_back}
        >
          {t("common.back")}
        </button>
      )}
    </div>
  );
}
