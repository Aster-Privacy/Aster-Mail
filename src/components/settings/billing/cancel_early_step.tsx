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

export const EARLY_CANCEL_WINDOW_HOURS = 72;

export const CANCEL_HELP_URL = "https://astermail.org/help";

export function is_early_cancel(
  started_at: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!started_at) return false;

  const started = new Date(started_at).getTime();

  if (Number.isNaN(started)) return false;

  const elapsed_hours = (now.getTime() - started) / 3_600_000;

  if (elapsed_hours < 0) return false;

  return elapsed_hours < EARLY_CANCEL_WINDOW_HOURS;
}

interface CancelEarlyStepProps {
  keep_plan_slot?: ReactNode;
  on_continue: () => void;
}

export function CancelEarlyStep({
  keep_plan_slot,
  on_continue,
}: CancelEarlyStepProps) {
  const { t } = use_i18n();

  return (
    <div className="py-1">
      <p className="text-sm leading-relaxed text-txt-secondary">
        {t("settings.cancel_early_body")}
      </p>

      <a
        className={`${button_variants({ variant: "secondary", size: "sm" })} mt-4`}
        href={CANCEL_HELP_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("settings.cancel_early_help")}
      </a>

      <div className="mt-5 flex flex-row items-center gap-2">
        {keep_plan_slot}
        <div className="ms-auto flex flex-row items-center gap-2">
          <button
            className={button_variants({ variant: "primary", size: "sm" })}
            type="button"
            onClick={on_continue}
          >
            {t("settings.cancel_early_continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
