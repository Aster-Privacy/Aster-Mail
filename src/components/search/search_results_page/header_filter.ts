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
import type { InboxFilterType } from "@/types/email";

import {
  add_operator_to_query,
  parse_search_query,
  strip_operators,
  type ParsedOperator,
} from "@/utils/search_operators";

function header_filter_of(operator: ParsedOperator): InboxFilterType | null {
  if (operator.negated) return null;

  const value = operator.value.toLowerCase();

  if (operator.type === "has") {
    return value === "attachment" || value === "attachments"
      ? "attachments"
      : null;
  }
  if (operator.type === "is") {
    if (value === "read") return "read";
    if (value === "unread") return "unread";
  }

  return null;
}

export function header_filter_for_query(query: string): InboxFilterType {
  const found = new Set<InboxFilterType>();

  for (const operator of parse_search_query(query).operators) {
    const filter = header_filter_of(operator);

    if (filter) found.add(filter);
  }

  if (found.has("attachments")) return "attachments";
  if (found.has("read")) return "read";
  if (found.has("unread")) return "unread";

  return "all";
}

export function apply_header_filter(
  query: string,
  filter: InboxFilterType,
): string {
  const stripped = strip_operators(
    query,
    (operator) => header_filter_of(operator) !== null,
  );

  if (filter === "read") return add_operator_to_query(stripped, "is", "read");
  if (filter === "unread") {
    return add_operator_to_query(stripped, "is", "unread");
  }
  if (filter === "attachments") {
    return add_operator_to_query(stripped, "has", "attachment");
  }

  return stripped;
}
