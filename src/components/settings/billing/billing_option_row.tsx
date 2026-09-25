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

export type BillingOptionNoteTone = "muted" | "accent" | "success";

const note_tone_color: Record<BillingOptionNoteTone, string> = {
  muted: "var(--text-muted)",
  accent: "var(--accent-color)",
  success: "var(--color-success)",
};

interface BillingOptionRowProps {
  selected: boolean;
  title: ReactNode;
  title_note?: ReactNode;
  note_tone?: BillingOptionNoteTone;
  subtitle?: ReactNode;
  price?: ReactNode;
  unit?: ReactNode;
  disabled?: boolean;
  on_select: () => void;
  data_plan?: string;
  data_featured?: boolean;
}

export function BillingOptionRow({
  selected,
  title,
  title_note,
  note_tone = "muted",
  subtitle,
  price,
  unit,
  disabled = false,
  on_select,
  data_plan,
  data_featured,
}: BillingOptionRowProps) {
  return (
    <button
      aria-checked={selected}
      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      data-featured={data_featured === undefined ? undefined : String(data_featured)}
      data-plan={data_plan}
      disabled={disabled}
      role="radio"
      style={{
        backgroundColor: selected ? "var(--aster-selected)" : undefined,
      }}
      type="button"
      onClick={on_select}
    >
      <span
        aria-hidden="true"
        className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full"
        style={{
          boxShadow: selected
            ? "inset 0 0 0 2px var(--accent-color)"
            : "inset 0 0 0 1.5px color-mix(in srgb, var(--text-primary) 28%, transparent)",
        }}
      >
        {selected && (
          <span
            className="h-[11px] w-[11px] rounded-full"
            style={{ backgroundColor: "var(--accent-color)" }}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-medium leading-5 text-txt-primary">
            {title}
          </span>
          {title_note && (
            <span
              className="text-[12px] font-medium leading-4"
              style={{ color: note_tone_color[note_tone] }}
            >
              {title_note}
            </span>
          )}
        </span>
        {subtitle && (
          <span className="text-[13px] leading-[18px] text-txt-muted">
            {subtitle}
          </span>
        )}
      </span>
      {price && (
        <span className="flex flex-shrink-0 items-baseline gap-0.5 text-end">
          <span className="text-[15px] font-semibold tabular-nums text-txt-primary">
            {price}
          </span>
          {unit && <span className="text-[12px] text-txt-muted">{unit}</span>}
        </span>
      )}
    </button>
  );
}
