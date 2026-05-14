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
import * as React from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";

export interface ChipSegmentProps {
  children: React.ReactNode;
  on_click?: () => void;
  is_active?: boolean;
  is_first?: boolean;
  is_last?: boolean;
  icon?: React.ReactNode;
  className?: string;
  trigger_ref?: React.Ref<HTMLButtonElement>;
}

export const ChipSegment = React.forwardRef<HTMLButtonElement, ChipSegmentProps>(
  (
    {
      children,
      on_click,
      is_active,
      is_first,
      is_last,
      icon,
      className,
      trigger_ref,
    },
    ref,
  ) => {
    return (
      <button
        ref={trigger_ref ?? ref}
        type="button"
        onClick={on_click}
        className={cn(
          "h-full flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium transition-colors",
          "text-neutral-700 dark:text-neutral-200",
          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          is_active && "bg-neutral-100 dark:bg-neutral-800",
          is_first && "rounded-l-[11px]",
          is_last && "rounded-r-[11px]",
          className,
        )}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="truncate max-w-[200px]">{children}</span>
      </button>
    );
  },
);

ChipSegment.displayName = "ChipSegment";

interface ChipPillProps {
  children: React.ReactNode;
  on_remove?: () => void;
  className?: string;
}

export const ChipPill = React.forwardRef<HTMLDivElement, ChipPillProps>(function ChipPill(
  { children, on_remove, className },
  ref,
) {
  const segments = React.Children.toArray(children).filter(Boolean);

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-stretch h-7 rounded-[12px] border bg-transparent",
        "border-neutral-200 dark:border-neutral-700",
        "overflow-hidden divide-x divide-neutral-200 dark:divide-neutral-700",
        className,
      )}
    >
      {segments}
      {on_remove && (
        <span className="h-full flex items-center pr-1 pl-0.5">
          <button
            type="button"
            onClick={on_remove}
            className={cn(
              "h-5 w-5 flex items-center justify-center rounded-full transition-colors",
              "text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700",
              "dark:hover:bg-neutral-700 dark:hover:text-neutral-200",
            )}
            aria-label="remove"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </span>
      )}
    </div>
  );
});
