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
import type { ParsedOperator, SearchOperatorType } from "./types";

import { locate_operators } from "./parse";
import { add_operator_to_query } from "./query";

export function strip_operators(
  query: string,
  predicate: (operator: ParsedOperator) => boolean,
): string {
  const kept: string[] = [];
  let position = 0;

  for (const entry of locate_operators(query)) {
    if (!predicate(entry.operator)) continue;
    kept.push(query.slice(position, entry.start));
    position = entry.end;
  }
  kept.push(query.slice(position));

  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export function remove_operator_at(query: string, index: number): string {
  let position = -1;

  return strip_operators(query, () => {
    position += 1;

    return position === index;
  });
}

function is_positive_match(
  operator: ParsedOperator,
  type: SearchOperatorType,
  value: string,
): boolean {
  return (
    operator.type === type &&
    !operator.negated &&
    operator.value.toLowerCase() === value.toLowerCase()
  );
}

export function has_operator(
  query: string,
  type: SearchOperatorType,
  value: string,
): boolean {
  return locate_operators(query).some((entry) =>
    is_positive_match(entry.operator, type, value),
  );
}

export function toggle_operator(
  query: string,
  type: SearchOperatorType,
  value: string,
): string {
  if (has_operator(query, type, value)) {
    return strip_operators(query, (operator) =>
      is_positive_match(operator, type, value),
    );
  }

  return add_operator_to_query(query, type, value);
}

export function is_filter_operator(operator: ParsedOperator): boolean {
  return operator.type !== "in";
}

export function count_filter_operators(query: string): number {
  return locate_operators(query).filter((entry) =>
    is_filter_operator(entry.operator),
  ).length;
}

export function clear_filter_operators(query: string): string {
  return strip_operators(query, is_filter_operator);
}

const BARE_OPERATOR_PREFIX =
  /(?:^|\s)-?(?:from|to|contact|subject|has|is|in|before|after|label|folder|date|filename|attachment|larger|smaller|size|id):$/i;

export function ends_with_bare_operator(query: string): boolean {
  return BARE_OPERATOR_PREFIX.test(query.trimEnd());
}
