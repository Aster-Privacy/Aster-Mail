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

import { ChipPill, ChipSegment } from "./chip_pill";
import {
  FieldDropdown,
  get_field_label_key,
} from "./dropdowns/field_dropdown";
import {
  OperatorDropdown,
  get_operator_label_key,
  has_operator_picker,
  type AnyOperator,
} from "./dropdowns/operator_dropdown";
import {
  ValueDropdown,
  pick_unit_for_bytes,
  type SizeUnit,
} from "./dropdowns/value_dropdown";
import {
  default_condition_for_field,
  field_kind,
} from "./field_kind";
import { use_i18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  AuthResultValue,
  ConditionField,
  LeafCondition,
} from "@/services/api/mail_rules";

export type ChipSegmentKind = "field" | "operator" | "value" | null;

interface ConditionChipProps {
  condition: LeafCondition;
  on_change: (condition: LeafCondition) => void;
  on_remove: () => void;
  auto_open?: ChipSegmentKind;
  on_auto_handled?: () => void;
  read_only?: boolean;
}

const AUTH_LABEL_KEY: Record<AuthResultValue, TranslationKey> = {
  pass: "mail_rules.auth_pass",
  fail: "mail_rules.auth_fail",
  none: "mail_rules.auth_none",
  missing: "mail_rules.auth_missing",
};

export function ConditionChip({
  condition,
  on_change,
  on_remove,
  auto_open,
  on_auto_handled,
  read_only,
}: ConditionChipProps) {
  const { t } = use_i18n();
  const [open_segment, set_open_segment] = React.useState<ChipSegmentKind>(
    auto_open ?? null,
  );
  const auto_open_guard_until = React.useRef<number>(0);
  const should_ignore_outside_now = React.useCallback(
    () => Date.now() < auto_open_guard_until.current,
    [],
  );
  const [size_unit, set_size_unit] = React.useState<SizeUnit>(() => {
    if (field_kind(condition.type) === "numeric_size") {
      return pick_unit_for_bytes(Number((condition as { value: number }).value) || 0).unit;
    }
    return "MB";
  });

  React.useEffect(() => {
    if (auto_open && auto_open !== open_segment) {
      set_open_segment(auto_open);
    }
  }, [auto_open]);

  const close = React.useCallback(() => {
    set_open_segment(null);
    on_auto_handled?.();
  }, [on_auto_handled]);

  const make_segment_open_handler = React.useCallback(
    (segment: Exclude<ChipSegmentKind, null>) => (o: boolean) => {
      if (o) {
        set_open_segment(segment);
      } else {
        if (segment === "value" && should_ignore_outside_now()) return;
        set_open_segment((prev) => (prev === segment ? null : prev));
      }
    },
    [should_ignore_outside_now],
  );

  const field = condition.type;
  const kind = field_kind(field);
  const field_label = t(get_field_label_key(field));

  const has_op_picker = has_operator_picker(field);
  const case_sensitive =
    "case_sensitive" in condition ? !!condition.case_sensitive : false;

  const handle_field_change = (new_field: ConditionField) => {
    const next = default_condition_for_field(new_field);

    on_change(next);
    const next_kind = field_kind(new_field);

    if (next_kind === "numeric_size") {
      set_size_unit("MB");
    }
    const next_segment: ChipSegmentKind = has_operator_picker(new_field)
      ? "operator"
      : "value";

    auto_open_guard_until.current = Date.now() + 400;
    queueMicrotask(() => set_open_segment(next_segment));
  };

  const handle_op_change = (op: AnyOperator) => {
    if ("operator" in condition) {
      on_change({ ...condition, operator: op } as LeafCondition);
    }
    auto_open_guard_until.current = Date.now() + 400;
    queueMicrotask(() => set_open_segment("value"));
  };

  const handle_value_change = (v: string | boolean | number) => {
    if (kind === "boolean" && typeof v === "boolean") {
      on_change({
        ...(condition as Extract<LeafCondition, { value: boolean }>),
        value: v,
      });
      close();
    } else if (kind === "auth" && typeof v === "string") {
      on_change({
        ...(condition as Extract<LeafCondition, { value: AuthResultValue }>),
        value: v as AuthResultValue,
      });
      close();
    } else if (
      (kind === "numeric_size" ||
        kind === "numeric_plain" ||
        kind === "date") &&
      typeof v === "number"
    ) {
      on_change({ ...condition, value: v } as LeafCondition);
    } else if (typeof v === "string") {
      on_change({ ...condition, value: v } as LeafCondition);
    }
  };

  const handle_header_name_change = (name: string) => {
    if (condition.type === "header") {
      on_change({ ...condition, name });
    }
  };

  const handle_toggle_case = (next: boolean) => {
    if ("operator" in condition && kind !== "numeric_size" && kind !== "numeric_plain" && kind !== "date") {
      on_change({ ...condition, case_sensitive: next } as LeafCondition);
    }
  };

  const operator_label = (() => {
    if (kind === "boolean") {
      return (condition as { value: boolean }).value
        ? t("mail_rules.op_yes")
        : t("mail_rules.op_no");
    }
    if (kind === "auth") {
      const v = (condition as { value: AuthResultValue }).value;

      return t(AUTH_LABEL_KEY[v] ?? "mail_rules.auth_pass");
    }
    if ("operator" in condition) {
      return t(get_operator_label_key(field, condition.operator as AnyOperator));
    }
    return "";
  })();

  const value_label = (() => {
    if (kind === "boolean" || kind === "auth") return "";
    if (kind === "numeric_size") {
      const bytes = Number((condition as { value: number }).value) || 0;
      const display = bytes / [1, 1024, 1024 * 1024, 1024 * 1024 * 1024]["BKMG".indexOf(size_unit[0]) as number] || bytes;
      const factor =
        size_unit === "B"
          ? 1
          : size_unit === "KB"
            ? 1024
            : size_unit === "MB"
              ? 1024 * 1024
              : 1024 * 1024 * 1024;
      const shown = bytes / factor;
      const unit_label =
        size_unit === "B"
          ? t("mail_rules.value_unit_bytes")
          : size_unit === "KB"
            ? t("mail_rules.value_unit_kb")
            : size_unit === "MB"
              ? t("mail_rules.value_unit_mb")
              : t("mail_rules.value_unit_gb");

      void display;
      return bytes === 0
        ? t("mail_rules.value_placeholder")
        : `${shown} ${unit_label}`;
    }
    if (kind === "numeric_plain") {
      const n = Number((condition as { value: number }).value);

      return Number.isNaN(n) ? t("mail_rules.value_placeholder") : String(n);
    }
    if (kind === "date") {
      const n = Number((condition as { value: number }).value) || 0;

      return `${n} ${t("mail_rules.value_unit_days")}`;
    }
    const raw = String((condition as { value?: unknown }).value ?? "");

    return raw || t("mail_rules.value_placeholder");
  })();

  const field_trigger = (
    <ChipSegment
      is_first
      is_active={open_segment === "field"}
      on_click={read_only ? undefined : () => set_open_segment("field")}
    >
      {field_label}
    </ChipSegment>
  );

  const remove = read_only ? undefined : on_remove;

  if (kind === "boolean") {
    const bcond = condition as Extract<LeafCondition, { value: boolean }>;

    return (
      <ChipPill on_remove={remove}>
        <FieldDropdown
          open={open_segment === "field"}
          on_open_change={make_segment_open_handler("field")}
          on_pick={handle_field_change}
          trigger={field_trigger}
        />
        <ValueDropdown
          field={field}
          value={bcond.value}
          open={open_segment === "value"}
          on_open_change={make_segment_open_handler("value")}
          on_commit={handle_value_change}
          trigger={
            <ChipSegment
              is_active={open_segment === "value"}
              on_click={
                read_only ? undefined : () => set_open_segment("value")
              }
            >
              {operator_label}
            </ChipSegment>
          }
        />
      </ChipPill>
    );
  }

  if (kind === "auth") {
    return (
      <ChipPill on_remove={remove}>
        <FieldDropdown
          open={open_segment === "field"}
          on_open_change={make_segment_open_handler("field")}
          on_pick={handle_field_change}
          trigger={field_trigger}
        />
        <ValueDropdown
          field={field}
          value={(condition as { value: AuthResultValue }).value}
          open={open_segment === "value"}
          on_open_change={make_segment_open_handler("value")}
          on_commit={handle_value_change}
          trigger={
            <ChipSegment
              is_active={open_segment === "value"}
              on_click={
                read_only ? undefined : () => set_open_segment("value")
              }
            >
              {operator_label}
            </ChipSegment>
          }
        />
      </ChipPill>
    );
  }

  const header_name_segment =
    condition.type === "header" ? (
      <ChipSegment
        is_active={false}
        on_click={
          read_only ? undefined : () => set_open_segment("value")
        }
      >
        <span className={!condition.name ? "text-neutral-400" : undefined}>
          {condition.name || t("mail_rules.header_name_placeholder")}
        </span>
      </ChipSegment>
    ) : null;

  const operator_segment_node = has_op_picker ? (
    <OperatorDropdown
      field={field}
      open={open_segment === "operator"}
      on_open_change={make_segment_open_handler("operator")}
      on_pick={handle_op_change}
      trigger={
        <ChipSegment
          is_active={open_segment === "operator"}
          on_click={
            read_only ? undefined : () => set_open_segment("operator")
          }
        >
          {operator_label}
        </ChipSegment>
      }
    />
  ) : null;

  const value_segment_node = (
    <ValueDropdown
      field={field}
      operator={
        "operator" in condition ? (condition.operator as string) : undefined
      }
      value={(condition as { value: unknown }).value as string | number | boolean}
      header_name={
        condition.type === "header" ? condition.name : undefined
      }
      size_unit={size_unit}
      case_sensitive={case_sensitive}
      open={open_segment === "value"}
      on_open_change={make_segment_open_handler("value")}
      on_commit={handle_value_change}
      on_commit_header_name={handle_header_name_change}
      on_commit_size_unit={set_size_unit}
      on_toggle_case_sensitive={handle_toggle_case}
      should_ignore_outside={should_ignore_outside_now}
      trigger={
        <ChipSegment
          is_active={open_segment === "value"}
          on_click={read_only ? undefined : () => set_open_segment("value")}
        >
          <span
            className={
              !(condition as { value?: unknown }).value
                ? "text-neutral-400"
                : undefined
            }
          >
            {value_label}
          </span>
        </ChipSegment>
      }
    />
  );

  return (
    <ChipPill on_remove={remove}>
      <FieldDropdown
        open={open_segment === "field"}
        on_open_change={make_segment_open_handler("field")}
        on_pick={handle_field_change}
        trigger={field_trigger}
      />
      {header_name_segment}
      {operator_segment_node}
      {value_segment_node}
    </ChipPill>
  );
}
