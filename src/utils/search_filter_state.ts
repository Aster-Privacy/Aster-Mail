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
import type {
  FilterState,
  SearchScope,
  SearchSizeUnit,
} from "@/components/search/search_modal_types";
import type { ParsedOperator } from "@/utils/search_operators";

import {
  date_range_operators,
  parse_search_query,
} from "@/utils/search_operators";
import {
  DATE_REGEX,
  RELATIVE_DAYS_REGEX,
} from "@/utils/search_operators/types";
import { local_date_key } from "@/utils/date_format";
import {
  SEARCH_SCOPES,
  default_search_scope,
  query_search_scope,
  set_search_scope,
} from "@/utils/search_query";

export const SEARCH_WITHIN_DAYS = ["", "7", "30", "183", "365"] as const;

const FORM_OPERATOR_TYPES = new Set([
  "from",
  "to",
  "subject",
  "in",
  "before",
  "after",
  "date",
  "larger",
  "smaller",
  "text",
]);

const UNIT_BYTES: Record<SearchSizeUnit, number> = {
  bytes: 1,
  kb: 1024,
  mb: 1024 * 1024,
};

export function default_filter_state(scope: SearchScope = "all"): FilterState {
  return {
    fields: ["all"],
    has_attachments: undefined,
    is_starred: undefined,
    date_from: "",
    date_to: "",
    scope,
    search_content: true,
    from: "",
    to: "",
    subject: "",
    has_words: "",
    does_not_have: "",
    size_op: "greater",
    size_value: "",
    size_unit: "mb",
    within_days: "",
  };
}

function quote(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function filter_state_operators(filters: FilterState): string[] {
  const parts: string[] = [];

  if (filters.from.trim()) parts.push(`from:${quote(filters.from.trim())}`);
  if (filters.to.trim()) parts.push(`to:${quote(filters.to.trim())}`);
  if (filters.subject.trim()) {
    parts.push(`subject:${quote(filters.subject.trim())}`);
  }
  if (filters.has_words.trim()) parts.push(filters.has_words.trim());
  if (filters.does_not_have.trim()) {
    parts.push(
      ...filters.does_not_have
        .trim()
        .split(/\s+/)
        .map((word) => `-${word.replace(/^-+/, "")}`),
    );
  }
  if (filters.has_attachments) parts.push("has:attachment");
  if (filters.is_starred) parts.push("is:starred");

  if (filters.size_value) {
    const amount = parseInt(filters.size_value, 10);

    if (!isNaN(amount) && amount > 0) {
      const bytes = amount * UNIT_BYTES[filters.size_unit];

      parts.push(
        `${filters.size_op === "greater" ? "larger" : "smaller"}:${bytes}`,
      );
    }
  }

  const within = parseInt(filters.within_days, 10);

  if (!isNaN(within) && within > 0) parts.push(`after:${within}d`);
  parts.push(...date_range_operators(filters.date_from, filters.date_to));

  return parts;
}

export function build_query_from_filter_state(
  filters: FilterState,
  view?: string,
): string {
  const base = filter_state_operators(filters).join(" ");

  return set_search_scope(base, view, filters.scope);
}

export function apply_filter_state_to_query(
  query: string,
  filters: FilterState,
  view?: string,
): string {
  const kept = parse_search_query(query)
    .operators.filter(
      (operator) =>
        !FORM_OPERATOR_TYPES.has(operator.type) &&
        !(
          operator.type === "has" &&
          !operator.negated &&
          /^attachments?$/i.test(operator.value)
        ) &&
        !(
          operator.type === "is" &&
          !operator.negated &&
          operator.value.toLowerCase() === "starred"
        ),
    )
    .map((operator) => operator.raw.trim());
  const base = [...kept, ...filter_state_operators(filters)].join(" ");

  return set_search_scope(base, view, filters.scope);
}

function single_positive(
  operators: ParsedOperator[],
  type: string,
): string | undefined {
  const matches = operators.filter(
    (operator) => operator.type === type && !operator.negated,
  );

  return matches.length === 1 ? matches[0].value : undefined;
}

function day_before(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  return local_date_key(new Date(year, month - 1, day - 1));
}

function size_fields(
  bytes: number,
): Pick<FilterState, "size_value" | "size_unit"> {
  for (const unit of ["mb", "kb", "bytes"] as const) {
    if (bytes % UNIT_BYTES[unit] === 0) {
      return { size_value: String(bytes / UNIT_BYTES[unit]), size_unit: unit };
    }
  }

  return { size_value: String(bytes), size_unit: "bytes" };
}

export function filter_state_from_query(
  query: string,
  view?: string,
): FilterState {
  const parsed = parse_search_query(query);
  const operators = parsed.operators;
  const scope_state = query_search_scope(query, view);
  const scope = scope_state?.scope ?? default_search_scope(view);
  const state = default_filter_state(
    (SEARCH_SCOPES as readonly string[]).includes(scope)
      ? (scope as SearchScope)
      : "all",
  );

  state.from = single_positive(operators, "from") ?? "";
  state.to = single_positive(operators, "to") ?? "";
  state.subject = single_positive(operators, "subject") ?? "";
  state.has_words = parsed.text_query;
  state.does_not_have = operators
    .filter((operator) => operator.type === "text" && operator.negated)
    .map((operator) => operator.value)
    .join(" ");
  state.has_attachments = operators.some(
    (operator) =>
      operator.type === "has" &&
      !operator.negated &&
      /^attachments?$/i.test(operator.value),
  )
    ? true
    : undefined;
  state.is_starred = operators.some(
    (operator) =>
      operator.type === "is" &&
      !operator.negated &&
      operator.value.toLowerCase() === "starred",
  )
    ? true
    : undefined;

  const after = single_positive(operators, "after");
  const before = single_positive(operators, "before");

  if (after && RELATIVE_DAYS_REGEX.test(after)) {
    const days = String(parseInt(after, 10));

    if ((SEARCH_WITHIN_DAYS as readonly string[]).includes(days)) {
      state.within_days = days;
    } else {
      state.date_from = local_date_key(
        new Date(Date.now() - parseInt(days, 10) * 86_400_000),
      );
    }
  } else if (after && DATE_REGEX.test(after)) {
    state.date_from = after;
  }
  if (before && DATE_REGEX.test(before)) state.date_to = day_before(before);

  const larger = single_positive(operators, "larger");
  const smaller = single_positive(operators, "smaller");
  const size_source = larger ?? smaller;

  if (size_source && /^\d+$/.test(size_source)) {
    Object.assign(state, size_fields(parseInt(size_source, 10)));
    state.size_op = larger ? "greater" : "less";
  }

  return state;
}
