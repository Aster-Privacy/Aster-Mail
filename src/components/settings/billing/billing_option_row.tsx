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

type NoteTone = "accent" | "success" | "muted";

interface BillingOptionRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  note?: ReactNode;
  note_tone?: NoteTone;
  trailing_amount?: ReactNode;
  trailing_unit?: ReactNode;
  selected: boolean;
  disabled?: boolean;
  on_select: () => void;
}

const NOTE_COLOR: Record<NoteTone, string> = {
  accent: "var(--accent-blue)",
  success: "var(--color-success)",
  muted: "var(--text-muted)",
};

export function BillingOptionRow({
  title,
  subtitle,
  note,
  note_tone = "accent",
  trailing_amount,
  trailing_unit,
  selected,
  disabled,
  on_select,
}: BillingOptionRowProps) {
  return (
    <button
      aria-checked={selected}
      className={`flex min-h-[54px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        selected ? "bg-surf-selected" : "hover:bg-surf-hover"
      }`}
      disabled={disabled}
      role="radio"
      type="button"
      onClick={on_select}
    >
      <span
        aria-hidden="true"
        className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{
          borderColor: selected
            ? "var(--accent-blue)"
            : "var(--border-primary)",
        }}
      >
        <span
          className="h-[11px] w-[11px] rounded-full transition-transform"
          style={{
            backgroundColor: "var(--accent-blue)",
            transform: selected ? "scale(1)" : "scale(0)",
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-txt-primary">
          {title}
        </span>
        {note && (
          <span
            className="block text-xs font-semibold"
            style={{ color: NOTE_COLOR[note_tone] }}
          >
            {note}
          </span>
        )}
        {subtitle && (
          <span className="block text-[13px] text-txt-muted">{subtitle}</span>
        )}
      </span>
      {trailing_amount !== undefined && (
        <span className="flex-shrink-0 text-right">
          <span className="text-[15px] font-semibold text-txt-primary">
            {trailing_amount}
          </span>
          {trailing_unit && (
            <span className="text-xs text-txt-muted">{trailing_unit}</span>
          )}
        </span>
      )}
    </button>
  );
}
