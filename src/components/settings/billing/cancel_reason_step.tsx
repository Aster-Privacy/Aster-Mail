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

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio_group";
import { use_i18n } from "@/lib/i18n/context";

export const CANCEL_REASONS = [
  "too_expensive",
  "not_using",
  "missing_feature",
  "switched_provider",
  "bugs",
  "privacy_trust",
  "just_testing",
  "other",
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export const MAX_CANCEL_REASON_TEXT = 2000;

export const CANCEL_REASONS_NEEDING_DETAIL: readonly CancelReason[] = [
  "missing_feature",
  "other",
];

export function clamp_cancel_reason_text(input: string): string {
  return input.slice(0, MAX_CANCEL_REASON_TEXT);
}

export function cancel_reason_needs_detail(
  reason: CancelReason | null,
): boolean {
  return reason !== null && CANCEL_REASONS_NEEDING_DETAIL.includes(reason);
}

export function can_continue_cancel_reason(
  reason: CancelReason | null,
  reason_text: string,
): boolean {
  if (reason === null) return false;
  if (!cancel_reason_needs_detail(reason)) return true;

  return reason_text.trim().length > 0;
}

interface CancelReasonStepProps {
  reason: CancelReason | null;
  set_reason: (reason: CancelReason | null) => void;
  reason_text: string;
  set_reason_text: (text: string) => void;
  on_skip: () => void;
  on_continue: () => void;
  keep_plan_slot?: ReactNode;
}

export function CancelReasonStep({
  reason,
  set_reason,
  reason_text,
  set_reason_text,
  on_skip,
  on_continue,
  keep_plan_slot,
}: CancelReasonStepProps) {
  const { t } = use_i18n();
  const needs_detail = cancel_reason_needs_detail(reason);
  const detail_missing = needs_detail && reason_text.trim().length === 0;
  const can_continue = can_continue_cancel_reason(reason, reason_text);

  return (
    <div className="py-1">
      <RadioGroup
        className="grid grid-cols-1 gap-x-5 gap-y-0.5 sm:grid-cols-2"
        value={reason ?? ""}
        onValueChange={(value) => set_reason(value as CancelReason)}
      >
        {CANCEL_REASONS.map((option) => (
          <label
            key={option}
            className="flex items-center gap-3 py-1.5 cursor-pointer text-sm text-txt-secondary"
            htmlFor={`cancel_reason_${option}`}
          >
            <RadioGroupItem id={`cancel_reason_${option}`} value={option} />
            <span>{t(`settings.cancel_reason_${option}`)}</span>
          </label>
        ))}
      </RadioGroup>

      <textarea
        className="mt-3 w-full rounded-md border border-edge-secondary bg-transparent px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand resize-none"
        maxLength={MAX_CANCEL_REASON_TEXT}
        placeholder={
          reason
            ? t(`settings.cancel_reason_placeholder_${reason}`)
            : t("settings.cancel_reason_text_placeholder")
        }
        rows={3}
        value={reason_text}
        onChange={(e) =>
          set_reason_text(clamp_cancel_reason_text(e.target.value))
        }
      />

      {detail_missing ? (
        <p className="mt-2 text-xs text-txt-muted">
          {t("settings.cancel_reason_detail_required")}
        </p>
      ) : null}

      <div className="mt-5 flex flex-row items-center gap-2">
        {keep_plan_slot}
        <div className="ms-auto flex flex-row items-center gap-3">
          <button
            className="text-xs text-txt-muted underline underline-offset-2 hover:text-txt-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-brand rounded-sm"
            type="button"
            onClick={on_skip}
          >
            {t("settings.cancel_reason_skip")}
          </button>
          <button
            className={button_variants({ variant: "primary", size: "sm" })}
            disabled={!can_continue}
            type="button"
            onClick={on_continue}
          >
            {t("settings.cancel_reason_continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
