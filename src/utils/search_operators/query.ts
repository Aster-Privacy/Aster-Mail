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
import { date_from_zoned_parts, get_zoned_parts } from "@/utils/date_format";

import type {} from "@/lib/i18n/types";
import { DATE_REGEX, TranslateFn } from "./types";

export function remove_operator_from_query(
  query: string,
  operator_raw: string,
): string {
  return query.replace(operator_raw, "").replace(/\s+/g, " ").trim();
}

export function add_operator_to_query(
  query: string,
  operator: string,
  value: string,
): string {
  const formatted_value = value.includes(" ") ? `"${value}"` : value;
  const operator_string = `${operator}:${formatted_value}`;

  if (query.trim()) {
    return `${query.trim()} ${operator_string}`;
  }

  return operator_string;
}

export function format_date_for_operator(date: Date): string {
  const parts = get_zoned_parts(date);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");

  return `${parts.year}-${month}-${day}`;
}

function day_after(date: string): string {
  if (!DATE_REGEX.test(date)) return date;

  const [year, month, day] = date.split("-").map(Number);
  const picked = new Date(Date.UTC(year, month - 1, day));

  if (
    picked.getUTCFullYear() !== year ||
    picked.getUTCMonth() !== month - 1 ||
    picked.getUTCDate() !== day
  ) {
    return date;
  }

  const next = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);

  return DATE_REGEX.test(next) ? next : date;
}

export function date_range_operators(from: string, to: string): string[] {
  const operators: string[] = [];

  if (from) operators.push(`after:${from}`);
  if (to) operators.push(`before:${day_after(to)}`);

  return operators;
}

export function parse_operator_date(date_string: string): Date | null {
  if (!DATE_REGEX.test(date_string)) {
    return null;
  }

  const [year, month, day] = date_string.split("-").map(Number);
  const date = date_from_zoned_parts({
    year,
    month,
    day,
    hours: 0,
    minutes: 0,
  });

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function get_quick_filters(t?: TranslateFn): {
  id: string;
  label: string;
  operator: string;
}[] {
  return [
    {
      id: "unread",
      label: t ? t("mail.filter_unread") : "Unread",
      operator: "is:unread",
    },
    {
      id: "starred",
      label: t ? t("mail.filter_starred") : "Starred",
      operator: "is:starred",
    },
    {
      id: "attachment",
      label: t ? t("mail.filter_has_attachment") : "Has attachment",
      operator: "has:attachment",
    },
  ];
}
