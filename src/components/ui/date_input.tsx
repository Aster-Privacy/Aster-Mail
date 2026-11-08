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
import type { CSSProperties } from "react";

import { useState } from "react";
import { CalendarIcon } from "@heroicons/react/24/outline";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import { format_iso_date } from "@/utils/date_format";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parse_iso_date(value: string | undefined): Date | undefined {
  const match = value ? ISO_DATE_PATTERN.exec(value.trim()) : null;

  if (!match) return undefined;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return date.getMonth() === Number(month) - 1 ? date : undefined;
}

export function to_iso_date(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

interface DateInputProps {
  value: string;
  on_change: (value: string) => void;
  min?: string;
  max?: string;
  aria_label?: string;
  className?: string;
  style?: CSSProperties;
}

export function DateInput({
  value,
  on_change,
  min,
  max,
  aria_label,
  className,
  style,
}: DateInputProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const selected = parse_iso_date(value);
  const min_date = parse_iso_date(min);
  const max_date = parse_iso_date(max);
  const disabled = [
    ...(min_date ? [{ before: min_date }] : []),
    ...(max_date ? [{ after: max_date }] : []),
  ];

  const handle_select = (date: Date | undefined) => {
    if (!date) return;
    on_change(to_iso_date(date));
    set_is_open(false);
  };

  const handle_clear = () => {
    on_change("");
    set_is_open(false);
  };

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          aria-label={aria_label}
          className={`flex items-center justify-between gap-2 text-start ${className ?? ""}`}
          style={style}
          type="button"
        >
          <span
            className="truncate"
            style={selected ? undefined : { color: "var(--text-muted)" }}
          >
            {selected ? format_iso_date(value) : t("common.select_date")}
          </span>
          <CalendarIcon className="w-4 h-4 flex-shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1.5">
        <Calendar
          defaultMonth={selected ?? max_date ?? min_date}
          disabled={disabled}
          mode="single"
          selected={selected}
          onSelect={handle_select}
        />
        {selected && (
          <button
            className="w-full h-8 rounded-[var(--aster-radius-item)] text-xs font-medium transition-colors hover:bg-[var(--aster-hover)]"
            style={{ color: "var(--text-secondary)" }}
            type="button"
            onClick={handle_clear}
          >
            {t("common.clear")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
