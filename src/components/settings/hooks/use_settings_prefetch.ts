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
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import {
  SETTINGS_CACHE_FRESHNESS_WINDOW_MS,
  use_settings_cache,
  type SettingsPanelName,
} from "@/contexts/settings_cache_context";
import { list_forwarding_rules } from "@/services/api/auto_forward";
import { list_blocked_senders } from "@/services/api/blocked_senders";
import { list_allowed_senders } from "@/services/api/allowed_senders";
import { list_signatures } from "@/services/api/signatures";
import { list_templates } from "@/services/api/templates";
import { list_import_jobs } from "@/services/api/email_import";
import { list_external_accounts } from "@/services/api/external_accounts";
import { get_vacation_reply } from "@/services/api/vacation_reply";
import { list_ghost_aliases } from "@/services/api/ghost_aliases";
import { list_sessions } from "@/services/api/sessions";
import { list_devices } from "@/services/api/devices";
import { get_totp_status } from "@/services/api/totp";
import { get_login_alerts_status } from "@/services/api/auth";
import { get_recovery_email } from "@/services/api/recovery_email";
import { get_security_status } from "@/services/api/account";
import { list_hardware_keys } from "@/services/api/webauthn";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ignore_error } from "@/lib/ignore_error";

type Fetcher = () => Promise<unknown>;

function envelope_error(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const candidate = (value as { error?: unknown }).error;

  if (typeof candidate === "string" && candidate.length > 0) return candidate;

  return null;
}

const PANEL_FETCHERS: Record<SettingsPanelName, Fetcher> = {
  auto_forward: () => list_forwarding_rules(),
  blocked: () => list_blocked_senders(),
  allowlist: () => list_allowed_senders(),
  signature: () => list_signatures(),
  templates: () => list_templates(),
  import: () => list_import_jobs(),
  external_accounts: () => list_external_accounts(),
  vacation_reply: () => get_vacation_reply(),
  ghost_aliases: () => list_ghost_aliases(),
  sessions: () => list_sessions(),
  recovery_email: () => Promise.resolve(null),
  preferences: () => Promise.resolve(null),
  trusted_devices: () => list_devices(),
  totp_status: () => get_totp_status(),
  login_alerts_status: () => get_login_alerts_status(),
  recovery_email_status: () => get_recovery_email(get_vault_from_memory()),
  security_status: () => get_security_status(),
  passkey_list: () => list_hardware_keys(),
};

const PREFETCH_PANELS: SettingsPanelName[] = [
  "totp_status",
  "login_alerts_status",
  "recovery_email_status",
  "passkey_list",
  "auto_forward",
  "blocked",
  "allowlist",
  "signature",
  "templates",
  "import",
  "external_accounts",
  "vacation_reply",
  "ghost_aliases",
  "sessions",
  "trusted_devices",
];

const PREFETCH_CONCURRENCY = 4;

const FOREGROUND_RETRY_DELAYS_MS = [1_000, 3_000];

const TRANSIENT_CODES = new Set([
  "NETWORK_ERROR",
  "TIMEOUT_ERROR",
  "RATE_LIMIT_EXCEEDED",
]);

function is_transient_envelope(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;

  const { code, status } = value as { code?: unknown; status?: unknown };

  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  if (typeof status !== "number") return typeof code !== "string";

  return status === 408 || status === 429 || status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const revalidate_tokens = new Map<SettingsPanelName, number>();

function next_revalidate_token(panel: SettingsPanelName): number {
  const token = (revalidate_tokens.get(panel) ?? 0) + 1;

  revalidate_tokens.set(panel, token);

  return token;
}

function is_current_revalidate(panel: SettingsPanelName, token: number) {
  return revalidate_tokens.get(panel) === token;
}

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

      const fetch_panel = async (panel: SettingsPanelName) => {
        const existing = cache.get_entry(panel);

        if (existing?.is_loading) return;

        if (
          !force &&
          existing &&
          !existing.error &&
          Date.now() - existing.fetched_at < SETTINGS_CACHE_FRESHNESS_WINDOW_MS
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
          const failure = envelope_error(data);

          if (failure) {
            cache.set_entry(panel, {
              data: existing?.data ?? null,
              error: null,
              fetched_at: existing?.fetched_at ?? 0,
              is_loading: false,
            });

            return;
          }

          cache.set_entry(panel, {
            data,
            error: null,
            fetched_at: Date.now(),
            is_loading: false,
          });
        } catch (error) {
          cache.set_entry(panel, {
            data: existing?.data ?? null,
            error: null,
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
      };

      for (
        let index = 0;
        index < PREFETCH_PANELS.length;
        index += PREFETCH_CONCURRENCY
      ) {
        await Promise.all(
          PREFETCH_PANELS.slice(index, index + PREFETCH_CONCURRENCY).map(
            fetch_panel,
          ),
        );
      }
    },
    [cache],
  );

  useEffect(() => {
    if (!is_active) return;

    if (typeof requestIdleCallback === "function") {
      const idle_id = requestIdleCallback(() => void run_prefetch(false), {
        timeout: 1000,
      });

      return () => cancelIdleCallback(idle_id);
    }

    const timeout_id = setTimeout(() => void run_prefetch(false), 200);

    return () => clearTimeout(timeout_id);
  }, [is_active, run_prefetch]);

  return { run_prefetch };
}

export function use_settings_panel_data<T = unknown>(panel: SettingsPanelName) {
  const cache = use_settings_cache();
  const entry = useSyncExternalStore(cache.subscribe, () =>
    cache.get_entry<T>(panel),
  );

  const attempted_ref = useRef<SettingsPanelName | null>(null);
  const entry_loading = entry?.is_loading ?? false;
  const fresh = cache.is_fresh(panel);

  const revalidate = useCallback(async () => {
    const fetcher = PANEL_FETCHERS[panel];
    const previous = cache.get_entry<T>(panel);
    const token = next_revalidate_token(panel);

    cache.set_entry<T>(panel, {
      data: previous?.data ?? null,
      error: null,
      fetched_at: previous?.fetched_at ?? 0,
      is_loading: true,
    });

    for (let attempt = 0; ; attempt += 1) {
      let data: T | undefined;
      let failure: unknown = null;
      let thrown = false;
      let transient = false;

      try {
        data = (await fetcher()) as T;
        failure = envelope_error(data);
        transient = failure !== null && is_transient_envelope(data);
      } catch (error) {
        failure = error;
        thrown = true;
        transient = true;
      }

      if (!is_current_revalidate(panel, token)) {
        if (thrown) throw failure;

        return data as T;
      }

      if (failure === null) {
        cache.set_entry<T>(panel, {
          data: data ?? null,
          error: null,
          fetched_at: Date.now(),
          is_loading: false,
        });

        return data as T;
      }

      if (transient && attempt < FOREGROUND_RETRY_DELAYS_MS.length) {
        await wait(FOREGROUND_RETRY_DELAYS_MS[attempt]);
        if (!is_current_revalidate(panel, token)) return data as T;
        continue;
      }

      cache.set_entry<T>(panel, {
        data: previous?.data ?? null,
        error: failure,
        fetched_at: previous?.fetched_at ?? 0,
        is_loading: false,
      });

      if (thrown) throw failure;

      return data as T;
    }
  }, [cache, panel]);

  useEffect(() => {
    if (attempted_ref.current === panel) return;
    if (cache.is_fresh(panel)) {
      attempted_ref.current = panel;

      return;
    }
    if (cache.get_entry(panel)?.is_loading) return;
    attempted_ref.current = panel;
    void revalidate().catch((caught) =>
      ignore_error(
        "components/settings/hooks/use_settings_prefetch:use_settings_panel_data",
        caught,
      ),
    );
  }, [cache, panel, revalidate, entry_loading]);

  const awaiting_foreground = attempted_ref.current !== panel && !fresh;

  return {
    data: (entry?.data ?? null) as T | null,
    error: entry?.error ?? null,
    is_loading: entry_loading || awaiting_foreground,
    is_fresh: fresh,
    revalidate,
  };
}
