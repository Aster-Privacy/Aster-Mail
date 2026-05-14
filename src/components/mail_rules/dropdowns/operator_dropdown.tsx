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
import { field_kind } from "@/components/mail_rules/field_kind";
import type { ConditionField } from "@/services/api/mail_rules";
import type { TranslationKey } from "@/lib/i18n/types";

export type AnyOperator = string;

export interface OperatorOption {
  value: AnyOperator;
  label_key: TranslationKey;
}

const ADDRESS_OPS: OperatorOption[] = [
  { value: "is", label_key: "mail_rules.op_is" },
  { value: "contains", label_key: "mail_rules.op_contains" },
  { value: "is_not", label_key: "mail_rules.op_is_not" },
  { value: "matches_domain", label_key: "mail_rules.op_matches_domain" },
  { value: "matches_regex", label_key: "mail_rules.op_matches_regex" },
];

const TEXT_OPS: OperatorOption[] = [
  { value: "contains", label_key: "mail_rules.op_contains" },
  { value: "does_not_contain", label_key: "mail_rules.op_does_not_contain" },
  { value: "is", label_key: "mail_rules.op_is" },
  { value: "starts_with", label_key: "mail_rules.op_starts_with" },
  { value: "ends_with", label_key: "mail_rules.op_ends_with" },
  { value: "is_empty", label_key: "mail_rules.op_is_empty" },
  { value: "matches_regex", label_key: "mail_rules.op_matches_regex" },
];

const ATTACHMENT_NAME_OPS: OperatorOption[] = [
  { value: "contains", label_key: "mail_rules.op_contains" },
  { value: "ends_with", label_key: "mail_rules.op_ends_with" },
  { value: "matches_regex", label_key: "mail_rules.op_matches_regex" },
];

const NUMERIC_OPS: OperatorOption[] = [
  { value: "greater_than", label_key: "mail_rules.op_greater_than" },
  { value: "less_than", label_key: "mail_rules.op_less_than" },
  { value: "equals", label_key: "mail_rules.op_equals" },
];

const DATE_OPS: OperatorOption[] = [
  { value: "older_than_days", label_key: "mail_rules.op_older_than_days" },
  { value: "newer_than_days", label_key: "mail_rules.op_newer_than_days" },
];

export const OPERATORS_BY_FIELD = (field: ConditionField): OperatorOption[] => {
  const kind = field_kind(field);

  switch (kind) {
    case "address":
      return ADDRESS_OPS;
    case "text":
    case "header":
      return TEXT_OPS;
    case "attachment_name":
      return ATTACHMENT_NAME_OPS;
    case "numeric_size":
    case "numeric_plain":
      return NUMERIC_OPS;
    case "date":
      return DATE_OPS;
    default:
      return [];
  }
};

export function get_operators_for_field(
  field: ConditionField,
): OperatorOption[] {
  return OPERATORS_BY_FIELD(field);
}

export function has_operator_picker(field: ConditionField): boolean {
  const k = field_kind(field);

  return k !== "boolean" && k !== "auth";
}

export function get_operator_label_key(
  field: ConditionField,
  op: AnyOperator | boolean | undefined,
): TranslationKey {
  if (field_kind(field) === "boolean") {
    return op === true || op === "is"
      ? "mail_rules.op_yes"
      : "mail_rules.op_no";
  }
  const list = OPERATORS_BY_FIELD(field);
  const found = list.find((o) => o.value === op);

  return found ? found.label_key : "mail_rules.op_is";
}

interface OperatorDropdownProps {
  field: ConditionField;
  trigger: React.ReactNode;
  open: boolean;
  on_open_change: (open: boolean) => void;
  on_pick: (op: AnyOperator) => void;
}

export function OperatorDropdown({
  field,
  trigger,
  open,
  on_open_change,
  on_pick,
}: OperatorDropdownProps) {
  const { t } = use_i18n();
  const options = OPERATORS_BY_FIELD(field);

  if (options.length === 0) return <>{trigger}</>;

  return (
    <DropdownMenu open={open} onOpenChange={on_open_change}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="z-[200] w-44"
      >
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => on_pick(opt.value)}
            className="text-[12.5px]"
          >
            {t(opt.label_key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
