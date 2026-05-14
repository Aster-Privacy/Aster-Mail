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

import { use_i18n } from "@/lib/i18n/context";
import { FieldDropdown } from "@/components/mail_rules/dropdowns/field_dropdown";
import type { ConditionField } from "@/services/api/mail_rules";

interface AddConditionChipProps {
  on_pick: (field: ConditionField) => void;
  force_open?: boolean;
  on_force_open_handled?: () => void;
}

export function AddConditionChip({
  on_pick,
  force_open,
  on_force_open_handled,
}: AddConditionChipProps) {
  const { t } = use_i18n();
  const [open, set_open] = React.useState(false);
  const trigger_ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (force_open) {
      set_open(true);
      on_force_open_handled?.();
    }
  }, [force_open, on_force_open_handled]);

  return (
    <FieldDropdown
      open={open}
      on_open_change={set_open}
      on_pick={(f) => {
        set_open(false);
        on_pick(f);
      }}
      trigger={
        <button
          ref={trigger_ref}
          type="button"
          onClick={() => set_open(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[12px] border border-dashed border-neutral-300 dark:border-neutral-700 text-[12.5px] text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>{t("mail_rules.add_condition")}</span>
        </button>
      }
    />
  );
}
