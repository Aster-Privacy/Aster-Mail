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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";
import type { MatchMode } from "@/services/api/mail_rules";

interface AndOrPillProps {
  mode: MatchMode;
  on_change: (mode: MatchMode) => void;
  read_only?: boolean;
}

export function AndOrPill({ mode, on_change, read_only }: AndOrPillProps) {
  const { t } = use_i18n();
  const [open, set_open] = React.useState(false);
  const label = mode === "all" ? t("mail_rules.and_label") : t("mail_rules.or_label");

  const pill = (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-[11px] font-medium uppercase tracking-wide select-none">
      {label}
    </span>
  );

  if (read_only) return pill;

  return (
    <DropdownMenu open={open} onOpenChange={set_open}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="cursor-pointer">
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={6}
        className="z-[200] w-32"
      >
        <DropdownMenuItem
          onSelect={() => {
            on_change("all");
            set_open(false);
          }}
          className="text-[12.5px]"
        >
          {t("mail_rules.and_label")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            on_change("any");
            set_open(false);
          }}
          className="text-[12.5px]"
        >
          {t("mail_rules.or_label")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
