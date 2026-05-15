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
import { useCallback, useEffect, useRef } from "react";

import {
  SETTINGS_CACHE_FRESHNESS_WINDOW_MS,
  use_settings_cache,
  type SettingsPanelName,
} from "@/contexts/settings_cache_context";
import { list_forwarding_rules } from "@/services/api/auto_forward";
import { list_blocked_senders } from "@/services/api/blocked_senders";
import { list_allowed_senders } from "@/services/api/allowed_senders";
import { list_subscriptions } from "@/services/api/subscriptions";
import { list_signatures } from "@/services/api/signatures";
import { list_templates } from "@/services/api/templates";
import { list_import_jobs } from "@/services/api/email_import";
import { list_external_accounts } from "@/services/api/external_accounts";
import { get_vacation_reply } from "@/services/api/vacation_reply";
import { list_ghost_aliases } from "@/services/api/ghost_aliases";
import { list_aliases } from "@/services/api/aliases";
import { list_sessions } from "@/services/api/sessions";
import { list_devices } from "@/services/api/devices";

type Fetcher = () => Promise<unknown>;

const PANEL_FETCHERS: Record<SettingsPanelName, Fetcher> = {
  auto_forward: () => list_forwarding_rules(),
  blocked: () => list_blocked_senders(),
  allowlist: () => list_allowed_senders(),
  subscriptions: () => list_subscriptions({ status: "active", limit: 100 }),
  signature: () => list_signatures(),
  templates: () => list_templates(),
  import: () => list_import_jobs(),
  external_accounts: () => list_external_accounts(),
  vacation_reply: () => get_vacation_reply(),
  ghost_aliases: () => list_ghost_aliases(),
  aliases: () => list_aliases(),
  sessions: () => list_sessions(),
  recovery_email: () => Promise.resolve(null),
  preferences: () => Promise.resolve(null),
  trusted_devices: () => list_devices(),
};

const PREFETCH_PANELS: SettingsPanelName[] = [
  "auto_forward",
  "blocked",
  "allowlist",
  "subscriptions",
  "signature",
  "templates",
  "import",
  "external_accounts",
  "vacation_reply",
  "ghost_aliases",
  "aliases",
  "sessions",
  "trusted_devices",
];

export function use_settings_prefetch(is_active: boolean) {
  const cache = use_settings_cache();
  const last_run_ref = useRef<number>(0);

  const run_prefetch = useCallback(
    async (force: boolean) => {
      const now = Date.now();

      if (
        !force &&
        now - last_run_ref.current < SETTINGS_CACHE_FRESHNESS_WINDOW_MS
      ) {
        return;
      }
      last_run_ref.current = now;

      await Promise.all(
        PREFETCH_PANELS.map(async (panel) => {
          const existing = cache.get_entry(panel);

          if (
            !force &&
            existing &&
            !existing.error &&
            now - existing.fetched_at < SETTINGS_CACHE_FRESHNESS_WINDOW_MS
          ) {
            return;
          }

          cache.set_entry(panel, {
            data: existing?.data ?? null,
            error: null,
            fetched_at: existing?.fetched_at ?? 0,
            is_loading: true,
          });

          try {
            const data = await PANEL_FETCHERS[panel]();

            cache.set_entry(panel, {
              data,
              error: null,
              fetched_at: Date.now(),
              is_loading: false,
            });
          } catch (error) {
            cache.set_entry(panel, {
              data: existing?.data ?? null,
              error,
              fetched_at: existing?.fetched_at ?? 0,
              is_loading: false,
            });

            if (typeof console !== "undefined") {
              console.error(
                `[settings_prefetch] failed for panel "${panel}"`,
                error,
              );
            }
          }
        }),
      );
    },
    [cache],
  );

  useEffect(() => {
    if (!is_active) return;
    void run_prefetch(false);
  }, [is_active, run_prefetch]);

  return { run_prefetch };
}

export function use_settings_panel_data<T = unknown>(panel: SettingsPanelName) {
  const cache = use_settings_cache();
  const entry = cache.get_entry<T>(panel);

  const revalidate = useCallback(async () => {
    const fetcher = PANEL_FETCHERS[panel];
    const previous = cache.get_entry<T>(panel);

    cache.set_entry<T>(panel, {
      data: previous?.data ?? null,
      error: null,
      fetched_at: previous?.fetched_at ?? 0,
      is_loading: true,
    });

    try {
      const data = (await fetcher()) as T;

      cache.set_entry<T>(panel, {
        data,
        error: null,
        fetched_at: Date.now(),
        is_loading: false,
      });

      return data;
    } catch (error) {
      cache.set_entry<T>(panel, {
        data: previous?.data ?? null,
        error,
        fetched_at: previous?.fetched_at ?? 0,
        is_loading: false,
      });
      throw error;
    }
  }, [cache, panel]);

  useEffect(() => {
    if (cache.is_fresh(panel)) return;
    void revalidate().catch(() => {});
  }, [cache, panel, revalidate]);

  return {
    data: (entry?.data ?? null) as T | null,
    error: entry?.error ?? null,
    is_loading: entry?.is_loading ?? false,
    is_fresh: cache.is_fresh(panel),
    revalidate,
  };
}
