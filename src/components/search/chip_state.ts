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
import type { ParsedOperator } from "@/utils/search_operators";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SHORTCUT_LABELS = new Map<string, TranslationKey>([
  ["today", "mail.filter_today"],
  ["yesterday", "mail.filter_yesterday"],
  ["this_week", "mail.filter_this_week"],
  ["last_week", "mail.filter_last_week"],
  ["this_month", "mail.filter_this_month"],
  ["last_month", "mail.filter_last_month"],
]);

const CHIP_HAS_VALUES = new Set([
  "attachment",
  "attachments",
  "image",
  "document",
  "pdf",
  "video",
]);

export type DateChipState =
  | { kind: "none" }
  | { kind: "mixed" }
  | { kind: "shortcut"; label_key: TranslationKey }
  | { kind: "day"; value: string }
  | { kind: "after"; value: string }
  | { kind: "before"; value: string }
  | { kind: "range"; from: string; to: string };

function day_before(value: string): string {
  if (!DAY_PATTERN.test(value)) return value;

  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
}

function positive_values(operators: ParsedOperator[], type: string): string[] {
  return operators
    .filter((operator) => operator.type === type && !operator.negated)
    .map((operator) => operator.value);
}

export function describe_date_filter(
  operators: ParsedOperator[],
): DateChipState {
  const before = positive_values(operators, "before");
  const after = positive_values(operators, "after");
  const date = positive_values(operators, "date");
  const total = before.length + after.length + date.length;

  if (total === 0) return { kind: "none" };

  if (date.length === 1 && total === 1) {
    const label_key = SHORTCUT_LABELS.get(date[0].toLowerCase());

    return label_key
      ? { kind: "shortcut", label_key }
      : { kind: "day", value: date[0] };
  }

  if (date.length > 0 || before.length > 1 || after.length > 1) {
    return { kind: "mixed" };
  }

  if (before.length === 0) return { kind: "after", value: after[0] };
  if (after.length === 0) return { kind: "before", value: before[0] };

  const last_day = day_before(before[0]);

  if (last_day === after[0]) return { kind: "day", value: after[0] };

  return { kind: "range", from: after[0], to: last_day };
}

export function person_chip_label(values: string[]): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  return `${values[0]} +${values.length - 1}`;
}

export function is_chip_covered_operator(operator: ParsedOperator): boolean {
  if (operator.type === "in") return true;
  if (operator.negated) return false;

  switch (operator.type) {
    case "from":
    case "to":
    case "before":
    case "after":
    case "date":
      return true;
    case "has":
      return CHIP_HAS_VALUES.has(operator.value.toLowerCase());
    case "is":
      return operator.value.toLowerCase() === "unread";
    default:
      return false;
  }
}
