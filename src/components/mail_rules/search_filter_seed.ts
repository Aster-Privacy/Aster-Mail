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
import type { FilterState } from "@/components/search/search_modal_types";
import type { Condition } from "@/services/api/mail_rules";
import type { RuleEditorSeed } from "@/components/mail_rules/rule_templates";

import { RULE_COLORS } from "@/components/modals/rule_editor_helpers";

const MAX_NAME_LEN = 64;
const MAX_VALUE_LEN = 200;

function clean(value: string): string {
  return value
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, MAX_VALUE_LEN);
}

function size_in_bytes(filters: FilterState): number | null {
  const n = parseInt(filters.size_value, 10);

  if (isNaN(n) || n <= 0) return null;
  if (filters.size_unit === "mb") return n * 1024 * 1024;
  if (filters.size_unit === "kb") return n * 1024;

  return n;
}

export function search_filters_to_rule_seed(
  filters: FilterState,
  fallback_name: string,
): RuleEditorSeed {
  const from = clean(filters.from);
  const to = clean(filters.to);
  const subject = clean(filters.subject);
  const has_words = clean(filters.has_words);
  const does_not_have = clean(filters.does_not_have);
  const conditions: Condition[] = [];

  if (from) {
    conditions.push({ type: "from", operator: "contains", value: from });
  }
  if (to) {
    conditions.push({ type: "to", operator: "contains", value: to });
  }
  if (subject) {
    conditions.push({ type: "subject", operator: "contains", value: subject });
  }
  if (has_words) {
    conditions.push({ type: "body", operator: "contains", value: has_words });
  }
  if (does_not_have) {
    conditions.push({
      type: "body",
      operator: "does_not_contain",
      value: does_not_have,
    });
  }
  if (filters.has_attachments) {
    conditions.push({ type: "has_attachment", value: true });
  }

  const bytes = size_in_bytes(filters);

  if (bytes !== null) {
    conditions.push({
      type: "total_size",
      operator: filters.size_op === "greater" ? "greater_than" : "less_than",
      value: bytes,
    });
  }

  const name = (from || subject || to || has_words || fallback_name).slice(
    0,
    MAX_NAME_LEN,
  );

  return {
    name,
    color: RULE_COLORS[0],
    match_mode: "all",
    conditions,
    actions: [],
  };
}
