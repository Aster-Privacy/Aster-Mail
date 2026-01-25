"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { button_variants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium [color:var(--text-primary)]",
        nav: "flex items-center gap-1",
        button_previous: cn(
          button_variants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1",
        ),
        button_next: cn(
          button_variants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "rounded-md w-8 font-normal text-[0.8rem] text-center [color:var(--text-muted)]",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [color:var(--text-primary)]",
        day_button: cn(
          button_variants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100 [color:var(--text-primary)] hover:bg-transparent aria-selected:!text-white aria-selected:hover:!text-white",
        ),
        range_start: "day-range-start rounded-l-md",
        range_end: "day-range-end rounded-r-md",
        selected:
          "[background:linear-gradient(to_bottom,#6b8aff_0%,#4f6ef7_50%,#3b5ae8_100%)] rounded-md",
        today:
          "[background:var(--bg-tertiary)] [color:var(--text-primary)] rounded-md",
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
