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
import { PlusIcon } from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import type { Action } from "@/services/api/mail_rules";

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

  return (
    <DropdownMenu open={open} onOpenChange={set_open}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[12px] border border-dashed border-neutral-300 dark:border-neutral-700 text-[12.5px] text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>{t("mail_rules.add_action")}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="z-[200] w-56 data-[state=closed]:!animate-none data-[state=closed]:!duration-0"
      >
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.type}
            disabled={opt.disabled}
            onSelect={(e) => {
              if (opt.disabled) {
                e.preventDefault();
                return;
              }
              on_pick(opt.type);
            }}
            className="justify-between text-[12.5px]"
          >
            <span>{t(opt.label_key)}</span>
            {opt.disabled_hint_key && (
              <span className="text-[10.5px] text-neutral-400">
                {t(opt.disabled_hint_key)}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
