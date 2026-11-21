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
import { CheckIcon } from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ChipSegment } from "@/components/mail_rules/chip_pill";
import { use_external_sources } from "@/hooks/use_external_sources";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  SOURCE_ASTER_VALUE,
  SOURCE_MAX_VALUES,
} from "@/services/api/mail_rules";
import { toggle_source_value } from "@/services/external_sources";

interface SourceValueDropdownProps {
  values: string[];
  open: boolean;
  read_only?: boolean;
  on_open: () => void;
  on_open_change: (open: boolean) => void;
  on_change: (values: string[]) => void;
  should_ignore_outside?: () => boolean;
}

export function SourceValueDropdown({
  values,
  open,
  read_only,
  on_open,
  on_open_change,
  on_change,
  should_ignore_outside,
}: SourceValueDropdownProps) {
  const { t } = use_i18n();
  const { options, label_for } = use_external_sources();

  const rows = React.useMemo(() => {
    const known = [
      { value: SOURCE_ASTER_VALUE, label: label_for(SOURCE_ASTER_VALUE) },
      ...options,
    ];
    const known_values = new Set(known.map((row) => row.value));
    const stale = values
      .filter((value) => !known_values.has(value))
      .map((value) => ({ value, label: label_for(value) }));

    return [...known, ...stale];
  }, [options, values, label_for]);

  const summary = values.map(label_for).join(", ");
  const at_limit = values.length >= SOURCE_MAX_VALUES;

  return (
    <Popover open={open} onOpenChange={on_open_change}>
      <PopoverTrigger asChild>
        <ChipSegment
          is_active={open}
          on_click={read_only ? undefined : on_open}
        >
          <span className={values.length === 0 ? "text-txt-muted" : undefined}>
            {summary || t("mail_rules.value_placeholder")}
          </span>
        </ChipSegment>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[200] p-1.5"
        sideOffset={6}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (should_ignore_outside?.()) e.preventDefault();
        }}
      >
        <div className="w-64 max-h-72 overflow-y-auto" role="listbox">
          {rows.map((row) => {
            const checked = values.includes(row.value);
            const disabled = !checked && at_limit;

            return (
              <button
                key={row.value}
                aria-selected={checked}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-txt-primary hover:bg-[var(--aster-field-hover)]",
                  disabled && "opacity-50",
                )}
                data-source-value={row.value}
                disabled={disabled}
                role="option"
                type="button"
                onClick={() =>
                  on_change(
                    toggle_source_value(values, row.value, SOURCE_MAX_VALUES),
                  )
                }
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {checked && <CheckIcon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
