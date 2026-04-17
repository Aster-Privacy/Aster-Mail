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
"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      className={cn("p-3 flex flex-col items-center", className)}
      classNames={{
        months: "relative",
        month: "flex flex-col gap-3 w-full",
        month_caption: "flex justify-center items-center h-7",
        caption_label: "text-sm font-medium [color:var(--text-primary)]",
        nav: "absolute top-0 left-0 right-0 flex items-center justify-between h-7 px-1 z-10",
        button_previous: cn(
          "h-7 w-7 min-w-7 p-0 flex items-center justify-center rounded-md border border-edge-secondary [color:var(--text-secondary)] hover:[background:var(--bg-hover)] hover:[color:var(--text-primary)] transition-colors",
        ),
        button_next: cn(
          "h-7 w-7 min-w-7 p-0 flex items-center justify-center rounded-md border border-edge-secondary [color:var(--text-secondary)] hover:[background:var(--bg-hover)] hover:[color:var(--text-primary)] transition-colors",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex justify-center",
        weekday:
          "w-9 font-normal text-[0.8rem] text-center [color:var(--text-muted)]",
        week: "flex w-full justify-center mt-2",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [color:var(--text-primary)]",
        day_button: cn(
          "h-9 w-9 p-0 font-normal rounded-full inline-flex items-center justify-center [color:var(--text-primary)] cursor-pointer transition-colors aria-selected:[color:white] aria-selected:[background:transparent]",
        ),
        range_start: "day-range-start rounded-l-md",
        range_end: "day-range-end rounded-r-md",
        selected:
          "[background:linear-gradient(to_bottom,#6b8aff_0%,#4f6ef7_50%,#3b5ae8_100%)] rounded-full [color:white]",
        today:
          "[background:var(--bg-tertiary)] [color:var(--text-primary)] rounded-full",
        outside: "[color:var(--text-muted)] opacity-50",
        disabled: "[color:var(--text-muted)] opacity-50 cursor-not-allowed",
        range_middle:
          "aria-selected:[background:var(--bg-tertiary)] aria-selected:[color:var(--text-primary)]",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          ),
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
