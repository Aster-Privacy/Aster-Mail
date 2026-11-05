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
import { useState, type ReactNode } from "react";

import { button_variants } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { format_date } from "@/services/api/billing";
import { BillingSegmented } from "@/components/settings/billing/billing_segmented";
import { ButtonSpinner } from "@/components/ui/spinner";

export type PauseLength = "1" | "2" | "3";

export function add_months_clamped(start: Date, months: number): Date {
  const target_month = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(target_month / 12);
  const month = ((target_month % 12) + 12) % 12;
  const last_day = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(start.getUTCDate(), last_day);

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
    ),
  );
}

export function pause_resume_date(
  pause_starts_at: string | null,
  months: number,
): string | null {
  if (!pause_starts_at) return null;
  const start = new Date(pause_starts_at);

  if (Number.isNaN(start.getTime())) return null;

  return add_months_clamped(start, months).toISOString();
}

interface CancelPauseStepProps {
  plan_name: string;
  pause_starts_at: string | null;
  max_months: number;
  is_busy: boolean;
  keep_plan_slot?: ReactNode;
  on_pause: (months: number) => void;
  on_back: () => void;
  on_continue: () => void;
}

export function CancelPauseStep({
  plan_name,
  pause_starts_at,
  max_months,
  is_busy,
  keep_plan_slot,
  on_pause,
  on_back,
  on_continue,
}: CancelPauseStepProps) {
  const { t } = use_i18n();
  const [length, set_length] = useState<PauseLength>("1");

  const all_options: { id: PauseLength; label: string }[] = [
    { id: "1", label: t("settings.pause_length_1") },
    { id: "2", label: t("settings.pause_length_2") },
    { id: "3", label: t("settings.pause_length_3") },
  ];
  const options = all_options.filter((option) => Number(option.id) <= max_months);
  const months = Number(length);
  const resume_at = pause_resume_date(pause_starts_at, months);

  return (
    <div className="py-1">
      <div className="rounded-lg border border-edge-secondary px-3.5 py-3">
        {pause_starts_at && (
          <p className="text-sm leading-relaxed text-txt-secondary">
            {t("settings.pause_offer_body", {
              plan: plan_name,
              date: format_date(pause_starts_at),
            })}
          </p>
        )}
        <div className="mt-3">
          <BillingSegmented
            aria_label={t("settings.pause_offer_length_label")}
            options={options}
            value={length}
            on_change={set_length}
          />
        </div>
        {resume_at && (
          <p className="mt-3 text-center text-xs leading-relaxed text-txt-muted">
            {t("settings.pause_offer_resume_on", {
              date: format_date(resume_at),
            })}
          </p>
        )}
        <button
          className={`${button_variants({ variant: "primary" })} mt-3 w-full`}
          disabled={is_busy}
          type="button"
          onClick={() => on_pause(months)}
        >
          {t("settings.pause_offer_action")}
          {is_busy && <ButtonSpinner />}
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-2 max-sm:[&_button]:w-full sm:flex-row sm:items-center">
        {keep_plan_slot}
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
          <button
            className={`${button_variants({ variant: "ghost" })} whitespace-nowrap`}
            type="button"
            onClick={on_back}
          >
            {t("common.back")}
          </button>
          <button
            className={`${button_variants({ variant: "ghost" })} whitespace-nowrap`}
            disabled={is_busy}
            type="button"
            onClick={on_continue}
          >
            {t("settings.cancel_offer_continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
