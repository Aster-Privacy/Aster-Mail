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
  DecryptedExternalAccount,
  ExternalSource,
} from "@/services/api/external_accounts";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  list_external_accounts,
  list_external_sources,
} from "@/services/api/external_accounts";
import {
  build_source_options,
  label_for_source_value,
  type SourceLabels,
  type SourceOption,
} from "@/services/external_sources";
import { use_i18n } from "@/lib/i18n/context";

interface LoadedSources {
  sources: ExternalSource[];
  accounts: DecryptedExternalAccount[];
}

const CACHE_MS = 30_000;

let cached: { at: number; promise: Promise<LoadedSources> } | null = null;

async function fetch_sources(): Promise<LoadedSources> {
  const sources_result = await list_external_sources();
  const sources = sources_result.data ?? [];

  if (!sources.some((source) => source.kind === "external")) {
    return { sources, accounts: [] };
  }

  const accounts_result = await list_external_accounts();

  return { sources, accounts: accounts_result.data ?? [] };
}

function load_sources(): Promise<LoadedSources> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;

  const promise = fetch_sources().catch(() => {
    cached = null;

    return { sources: [], accounts: [] };
  });

  cached = { at: Date.now(), promise };

  return promise;
}

export function reset_external_sources_cache(): void {
  cached = null;
}

export interface ExternalSourcesState {
  sources: ExternalSource[];
  options: SourceOption[];
  loading: boolean;
  label_for: (value: string) => string;
}

export function use_external_sources(): ExternalSourcesState {
  const { t } = use_i18n();
  const [loaded, set_loaded] = useState<LoadedSources | null>(null);

  useEffect(() => {
    let active = true;

    void load_sources().then((result) => {
      if (active) set_loaded(result);
    });

    return () => {
      active = false;
    };
  }, []);

  const labels: SourceLabels = useMemo(
    () => ({
      aster: t("settings.ext_v2_rule_source_aster"),
      device: t("settings.ext_v2_source_device"),
      forwarding: t("settings.ext_v2_source_forwarding"),
      removed: t("settings.ext_v2_source_removed"),
    }),
    [t],
  );

  const options = useMemo(
    () =>
      loaded
        ? build_source_options(loaded.sources, loaded.accounts, labels)
        : [],
    [loaded, labels],
  );

  const label_for = useCallback(
    (value: string) => label_for_source_value(value, options, labels),
    [options, labels],
  );

  return {
    sources: loaded?.sources ?? [],
    options,
    loading: loaded === null,
    label_for,
  };
}
