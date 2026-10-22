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

import {
  date_range_operators,
  parse_search_query,
  strip_operators,
} from "@/utils/search_operators";

export const SEARCH_DATE_PRESETS = [
  "any",
  "last_7_days",
  "last_30_days",
  "last_6_months",
  "last_year",
  "older_than_year",
  "custom",
] as const;

export type SearchDatePreset = (typeof SEARCH_DATE_PRESETS)[number];

type TokenPreset = Exclude<SearchDatePreset, "any" | "custom">;

const PRESET_TOKENS: Record<TokenPreset, string> = {
  last_7_days: "after:7d",
  last_30_days: "after:30d",
  last_6_months: "after:183d",
  last_year: "after:365d",
  older_than_year: "before:365d",
};

export const DATE_PRESET_LABEL_KEYS: Record<SearchDatePreset, TranslationKey> =
  {
    any: "mail.chip_any_time",
    last_7_days: "mail.chip_last_7_days",
    last_30_days: "mail.chip_last_30_days",
    last_6_months: "mail.chip_last_6_months",
    last_year: "mail.chip_last_year",
    older_than_year: "mail.chip_older_than_year",
    custom: "mail.chip_custom_range",
  };

export function is_date_operator(operator: ParsedOperator): boolean {
  return (
    !operator.negated &&
    (operator.type === "before" ||
      operator.type === "after" ||
      operator.type === "date")
  );
}

export function detect_date_preset(
  operators: ParsedOperator[],
): SearchDatePreset {
  const dated = operators.filter(is_date_operator);

  if (dated.length === 0) return "any";
  if (dated.length > 1) return "custom";

  const token = `${dated[0].type}:${dated[0].value.toLowerCase()}`;

  for (const preset of Object.keys(PRESET_TOKENS) as TokenPreset[]) {
    if (PRESET_TOKENS[preset] === token) return preset;
  }

  return "custom";
}

export function strip_date_operators(query: string): string {
  return strip_operators(query, is_date_operator);
}

function append_tokens(query: string, tokens: string[]): string {
  return [query.trim(), ...tokens].filter(Boolean).join(" ");
}

export function apply_date_preset(
  query: string,
  preset: Exclude<SearchDatePreset, "custom">,
): string {
  const stripped = strip_date_operators(query);

  if (preset === "any") return stripped;

  return append_tokens(stripped, [PRESET_TOKENS[preset]]);
}

export function apply_custom_date_range(
  query: string,
  from: string,
  to: string,
): string {
  return append_tokens(
    strip_date_operators(query),
    date_range_operators(from, to),
  );
}

export function date_preset_of_query(query: string): SearchDatePreset {
  return detect_date_preset(parse_search_query(query).operators);
}
