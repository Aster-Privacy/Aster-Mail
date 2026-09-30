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
import { useContext } from "react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

export type ChipLayout = "chip" | "row";

export const ChipLayoutContext = React.createContext<ChipLayout>("chip");

export function use_chip_layout(): ChipLayout {
  return useContext(ChipLayoutContext);
}

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

function assign_ref<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export const ChipSegment = React.forwardRef<
  HTMLButtonElement,
  ChipSegmentProps
>(
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
    const layout = use_chip_layout();

    if (layout === "row") {
      return (
        <button
          ref={(node) => {
            assign_ref(ref, node);
            assign_ref(trigger_ref, node);
          }}
          className={cn(
            "h-9 min-w-0 flex-1 flex items-center gap-2 px-3 text-start text-[13px] font-medium only:col-span-2",
            "rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] text-txt-primary transition-colors",
            on_click
              ? "cursor-pointer hover:bg-[var(--aster-field-hover)]"
              : "cursor-default",
            is_active && "bg-[var(--aster-field-hover)]",
            className,
          )}
          data-chip-segment=""
          type="button"
          onClick={on_click}
        >
          {icon && <span className="flex-shrink-0 text-txt-muted">{icon}</span>}
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {on_click && (
            <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 text-txt-muted" />
          )}
        </button>
      );
    }

    return (
      <button
        ref={(node) => {
          assign_ref(ref, node);
          assign_ref(trigger_ref, node);
        }}
        className={cn(
          "h-full flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium transition-colors",
          "text-txt-primary",
          "hover:bg-[var(--aster-field-hover)]",
          is_active && "bg-[var(--aster-field-hover)]",
          is_first && "rounded-s-[11px]",
          is_last && "rounded-e-[11px]",
          className,
        )}
        type="button"
        onClick={on_click}
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

export const ChipPill = React.forwardRef<HTMLDivElement, ChipPillProps>(
  function ChipPill({ children, on_remove, className }, ref) {
    const { t } = use_i18n();
    const layout = use_chip_layout();
    const segments = React.Children.toArray(children).filter(Boolean);

    if (layout === "row") {
      return (
        <div
          ref={ref}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2.5",
            className,
          )}
        >
          <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-2 sm:flex">
            {segments}
          </div>
          {on_remove && (
            <button
              aria-label={t("common.remove")}
              className={cn(
                "h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-full transition-colors",
                "text-txt-muted hover:bg-[var(--aster-field-hover)] hover:text-txt-primary",
              )}
              type="button"
              onClick={on_remove}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-stretch h-7 rounded-[12px] bg-[var(--aster-field-bg)]",
          "overflow-hidden divide-x divide-[var(--aster-floating-divider,var(--border-secondary))]",
          className,
        )}
      >
        {segments}
        {on_remove && (
          <span className="h-full flex items-center pe-1 ps-0.5">
            <button
              aria-label={t("common.remove")}
              className={cn(
                "h-5 w-5 flex items-center justify-center rounded-full transition-colors",
                "text-txt-muted hover:bg-[var(--aster-field-hover)] hover:text-txt-primary",
              )}
              type="button"
              onClick={on_remove}
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>
    );
  },
);
