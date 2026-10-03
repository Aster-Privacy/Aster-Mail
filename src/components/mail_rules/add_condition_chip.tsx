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
import type { ConditionField } from "@/services/api/mail_rules";

import * as React from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { use_chip_layout } from "@/components/mail_rules/chip_pill";
import { use_i18n } from "@/lib/i18n/context";
import { FieldDropdown } from "@/components/mail_rules/dropdowns/field_dropdown";

interface AddConditionChipProps {
  on_pick: (field: ConditionField) => void;
  force_open?: boolean;
  on_force_open_handled?: () => void;
  allowed_fields?: ConditionField[];
}

export function AddConditionChip({
  on_pick,
  force_open,
  on_force_open_handled,
  allowed_fields,
}: AddConditionChipProps) {
  const { t } = use_i18n();
  const [open, set_open] = React.useState(false);
  const is_row = use_chip_layout() === "row";
  const trigger_ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (force_open) {
      set_open(true);
      on_force_open_handled?.();
    }
  }, [force_open, on_force_open_handled]);

  return (
    <FieldDropdown
      allowed_fields={allowed_fields}
      on_open_change={set_open}
      on_pick={(f) => {
        set_open(false);
        on_pick(f);
      }}
      open={open}
      trigger={
        <button
          ref={trigger_ref}
          className={
            is_row
              ? "flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-[var(--accent-color,var(--color-blue-500))] hover:bg-[var(--aster-field-hover)] transition-colors"
              : "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] text-[12.5px] text-txt-secondary hover:bg-[var(--aster-field-hover)] hover:text-txt-primary transition-colors"
          }
          type="button"
          onClick={() => set_open(true)}
        >
          <PlusIcon className={is_row ? "w-4 h-4" : "w-3.5 h-3.5"} />
          <span>{t("mail_rules.add_condition")}</span>
        </button>
      }
    />
  );
}
