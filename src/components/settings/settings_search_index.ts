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
import type { SearchEntry } from "@/components/settings/search_registry";

import { keyword_key } from "@/components/settings/search_registry";
import {
  prepare_search_fields,
  score_search_fields,
  type PreparedSearchFields,
} from "@/components/settings/settings_search_match";

export type TranslationLookup = (key: string) => string | undefined;

export interface IndexedSettingsEntry {
  entry: SearchEntry;
  fields: PreparedSearchFields;
}

export interface RankedSettingsEntry {
  entry: SearchEntry;
  score: number;
}

export function lookup_in_table(table: unknown): TranslationLookup {
  return (key) => {
    if (!table || typeof table !== "object") return undefined;
    const dot = key.indexOf(".");

    if (dot === -1) return undefined;
    const namespace = (table as Record<string, unknown>)[key.slice(0, dot)];

    if (!namespace || typeof namespace !== "object") return undefined;
    const value = (namespace as Record<string, unknown>)[key.slice(dot + 1)];

    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
}

function collect(lookups: TranslationLookup[], key: string | undefined) {
  if (!key) return [];
  const values: string[] = [];

  for (const lookup of lookups) {
    const value = lookup(key);

    if (value && !values.includes(value)) values.push(value);
  }

  return values;
}

export function build_settings_index(
  entries: SearchEntry[],
  lookups: TranslationLookup[],
  section_labels: (entry: SearchEntry) => string[] = () => [],
): IndexedSettingsEntry[] {
  return entries.map((entry) => ({
    entry,
    fields: prepare_search_fields({
      labels: collect(lookups, entry.label_key),
      keywords: collect(lookups, keyword_key(entry)),
      context: [...collect(lookups, entry.crumb_key), ...section_labels(entry)],
      descriptions: collect(lookups, entry.description_key),
    }),
  }));
}

export function rank_settings_index(
  index: IndexedSettingsEntry[],
  query: string,
  limit: number,
  dedupe_key: (entry: SearchEntry) => string = (entry) => entry.id,
): RankedSettingsEntry[] {
  const best = new Map<string, RankedSettingsEntry & { order: number }>();

  index.forEach(({ entry, fields }, order) => {
    const score = score_search_fields(query, fields);

    if (score <= 0) return;
    const key = dedupe_key(entry);
    const existing = best.get(key);

    if (!existing || existing.score < score) {
      best.set(key, { entry, score, order });
    }
  });

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ entry, score }) => ({ entry, score }));
}
