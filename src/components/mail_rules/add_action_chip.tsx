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
import type { TranslationKey } from "@/lib/i18n/types";
import type { Action } from "@/services/api/mail_rules";

import * as React from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { use_chip_layout } from "@/components/mail_rules/chip_pill";
import { use_i18n } from "@/lib/i18n/context";

export type AddableActionType = Action["type"];

export interface AddableActionOption {
  type: AddableActionType;
  label_key: TranslationKey;
  disabled?: boolean;
  disabled_hint_key?: TranslationKey;
}

interface AddActionChipProps {
  options: AddableActionOption[];
  on_pick: (type: AddableActionType) => void;
}

export function AddActionChip({ options, on_pick }: AddActionChipProps) {
  const { t } = use_i18n();
  const [open, set_open] = React.useState(false);
  const is_row = use_chip_layout() === "row";

  return (
    <DropdownMenu open={open} onOpenChange={set_open}>
      <DropdownMenuTrigger asChild>
        <button
          className={
            is_row
              ? "flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-[var(--accent-color,var(--color-blue-500))] hover:bg-[var(--aster-field-hover)] transition-colors"
              : "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] text-[12.5px] text-txt-secondary hover:bg-[var(--aster-field-hover)] hover:text-txt-primary transition-colors"
          }
          type="button"
        >
          <PlusIcon className={is_row ? "w-4 h-4" : "w-3.5 h-3.5"} />
          <span>{t("mail_rules.add_action")}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[200] w-56 data-[state=closed]:!animate-none data-[state=closed]:!duration-0"
        sideOffset={6}
      >
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.type}
            className="justify-between text-[12.5px]"
            disabled={opt.disabled}
            onSelect={(e) => {
              if (opt.disabled) {
                e.preventDefault();

                return;
              }
              on_pick(opt.type);
            }}
          >
            <span>{t(opt.label_key)}</span>
            {opt.disabled_hint_key && (
              <span className="text-[10.5px] text-txt-muted">
                {t(opt.disabled_hint_key)}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
