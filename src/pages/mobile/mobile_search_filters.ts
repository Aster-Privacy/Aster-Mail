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

import {
  add_operator_to_query,
  has_operator,
  strip_operators,
  type ParsedOperator,
} from "@/utils/search_operators";

export type MobileSearchFilter = "all" | "unread" | "attachments" | "starred";

function is_unread_operator(operator: ParsedOperator): boolean {
  return (
    !operator.negated &&
    operator.type === "is" &&
    operator.value.toLowerCase() === "unread"
  );
}

function is_attachment_operator(operator: ParsedOperator): boolean {
  return (
    !operator.negated &&
    operator.type === "has" &&
    ["attachment", "attachments"].includes(operator.value.toLowerCase())
  );
}

function is_starred_operator(operator: ParsedOperator): boolean {
  return (
    !operator.negated &&
    operator.type === "is" &&
    operator.value.toLowerCase() === "starred"
  );
}

function is_chip_operator(operator: ParsedOperator): boolean {
  return (
    is_unread_operator(operator) ||
    is_attachment_operator(operator) ||
    is_starred_operator(operator)
  );
}

export function is_mobile_filter_active(
  query: string,
  filter: MobileSearchFilter,
): boolean {
  const is_unread = has_operator(query, "is", "unread");
  const is_attachments =
    has_operator(query, "has", "attachment") ||
    has_operator(query, "has", "attachments");
  const is_starred = has_operator(query, "is", "starred");

  switch (filter) {
    case "unread":
      return is_unread;
    case "attachments":
      return is_attachments;
    case "starred":
      return is_starred;
    default:
      return !is_unread && !is_attachments && !is_starred;
  }
}

export function apply_mobile_filter(
  query: string,
  filter: MobileSearchFilter,
): string {
  switch (filter) {
    case "unread":
      return is_mobile_filter_active(query, "unread")
        ? strip_operators(query, is_unread_operator)
        : add_operator_to_query(query, "is", "unread");
    case "attachments":
      return is_mobile_filter_active(query, "attachments")
        ? strip_operators(query, is_attachment_operator)
        : add_operator_to_query(query, "has", "attachment");
    case "starred":
      return is_mobile_filter_active(query, "starred")
        ? strip_operators(query, is_starred_operator)
        : add_operator_to_query(query, "is", "starred");
    default:
      return strip_operators(query, is_chip_operator);
  }
}
