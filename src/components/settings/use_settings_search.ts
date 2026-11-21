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
  SearchEntry,
  SettingsSearchPlatform,
} from "@/components/settings/search_registry";
import type { Translations } from "@/lib/i18n/types";

import { useEffect, useMemo, useState } from "react";

import { SETTINGS_SEARCH_REGISTRY } from "@/components/settings/search_registry";
import {
  build_settings_index,
  lookup_in_table,
  rank_settings_index,
} from "@/components/settings/settings_search_index";
import { is_searchable_query } from "@/components/settings/settings_search_match";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_cached_translations,
  get_translations_async,
} from "@/lib/i18n/translations";

export interface SettingsSearchOptions {
  platform: SettingsSearchPlatform;
  is_available: (entry: SearchEntry) => boolean;
  section_label: (entry: SearchEntry) => string | undefined;
  limit?: number;
}

export interface SettingsSearchHit {
  entry: SearchEntry;
  label: string;
  section_label: string | undefined;
  crumb: string | undefined;
}

const DEFAULT_LIMIT = 12;

function use_english_table(language: string): Translations | undefined {
  const [table, set_table] = useState(() => get_cached_translations("en"));

  useEffect(() => {
    if (table || language === "en") return;
    let cancelled = false;

    get_translations_async("en")
      .then((loaded) => {
        if (!cancelled) set_table(loaded);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [table, language]);

  return table;
}

export function use_settings_search(
  query: string,
  options: SettingsSearchOptions,
): SettingsSearchHit[] {
  const { platform, is_available, section_label } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const { t, language, translations } = use_i18n();
  const english = use_english_table(language);

  const index = useMemo(() => {
    const lookups = [lookup_in_table(translations)];

    if (english && english !== translations) {
      lookups.push(lookup_in_table(english));
    }
    const entries = SETTINGS_SEARCH_REGISTRY.filter(
      (entry) =>
        (!entry.platform || entry.platform === platform) && is_available(entry),
    );

    return build_settings_index(entries, lookups, (entry) => {
      const label = section_label(entry);

      return label ? [label] : [];
    });
  }, [translations, english, platform, is_available, section_label]);

  return useMemo(() => {
    if (!is_searchable_query(query)) return [];

    return rank_settings_index(
      index,
      query,
      limit,
      (entry) =>
        `${section_label(entry) ?? entry.section}::${t(entry.label_key)}`,
    ).map(({ entry }) => ({
      entry,
      label: t(entry.label_key),
      section_label: section_label(entry),
      crumb: entry.crumb_key ? t(entry.crumb_key) : undefined,
    }));
  }, [index, query, limit, section_label, t]);
}
