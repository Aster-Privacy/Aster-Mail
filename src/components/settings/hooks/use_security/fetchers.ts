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
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { use_i18n } from "@/lib/i18n/context";
import type { use_settings_cache } from "@/contexts/settings_cache_context";
import type { ApiResponse } from "@/services/api/client";
import { api_client } from "@/services/api/client";
import { get_totp_status, TotpStatusResponse } from "@/services/api/totp";
import {
  get_login_alerts_status,
  get_login_events,
  type LoginEventEntry,
} from "@/services/api/auth";
import { list_sessions, type Session } from "@/services/api/sessions";
import { get_recovery_email } from "@/services/api/recovery_email";
import {
  get_security_status,
  backfill_password_strength_tier,
  type SecurityStatusResponse,
} from "@/services/api/account";
import { compute_password_strength_tier } from "@/services/password_strength_score";
import { ignore_error } from "@/lib/ignore_error";

import {
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";

export interface security_fetchers_context {
  t: ReturnType<typeof use_i18n>["t"];
  cache: ReturnType<typeof use_settings_cache>;
  set_totp_status: Dispatch<SetStateAction<TotpStatusResponse | null>>;
  set_login_alerts_enabled: Dispatch<SetStateAction<boolean>>;
  set_login_events: Dispatch<SetStateAction<LoginEventEntry[]>>;
  set_login_events_loading: Dispatch<SetStateAction<boolean>>;
  set_ipfs_available: Dispatch<SetStateAction<boolean>>;
  set_ipfs_storage_enabled: Dispatch<SetStateAction<boolean>>;
  set_sessions: Dispatch<SetStateAction<Session[]>>;
  set_sessions_loading: Dispatch<SetStateAction<boolean>>;
  set_sessions_error: Dispatch<SetStateAction<string | null>>;
  set_recovery_email_verified: Dispatch<SetStateAction<boolean>>;
  set_security_status: Dispatch<SetStateAction<SecurityStatusResponse | null>>;
}

export function use_security_fetchers(ctx: security_fetchers_context) {
  const {
    t,
    cache,
    set_totp_status,
    set_login_alerts_enabled,
    set_login_events,
    set_login_events_loading,
    set_ipfs_available,
    set_ipfs_storage_enabled,
    set_sessions,
    set_sessions_loading,
    set_sessions_error,
    set_recovery_email_verified,
    set_security_status,
  } = ctx;

const fetch_totp_status = useCallback(async () => {
  try {
    const response = await get_totp_status();

    if (response.data) {
      set_totp_status(response.data);
      cache.set_entry("totp_status", {
        data: response,
        error: null,
        fetched_at: Date.now(),
        is_loading: false,
      });
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);

    return;
  }
}, [cache]);

const fetch_login_alerts_status = useCallback(async () => {
  try {
    const response = await get_login_alerts_status();

    if (response.data) {
      set_login_alerts_enabled(response.data.enabled);
      cache.set_entry("login_alerts_status", {
        data: response,
        error: null,
        fetched_at: Date.now(),
        is_loading: false,
      });
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);

    return;
  }
}, [cache]);

const fetch_login_events = useCallback(async () => {
  set_login_events_loading(true);
  try {
    const response = await get_login_events();
    if (response.data) {
      set_login_events(response.data.events);
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
  } finally {
    set_login_events_loading(false);
  }
}, []);

const fetch_ipfs_status = useCallback(async () => {
  try {
    const response = await api_client.get<{
      ipfs_available: boolean;
      ipfs_storage_enabled: boolean;
    }>("/settings/v1/encryption");

    if (response.data) {
      set_ipfs_available(response.data.ipfs_available);
      set_ipfs_storage_enabled(response.data.ipfs_storage_enabled);
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);

    return;
  }
}, []);

const fetch_recovery_email_status = useCallback(async () => {
  const vault = get_vault_from_memory();

  if (!vault) return;

  try {
    const result = await get_recovery_email(vault);

    set_recovery_email_verified(result.data.verified ?? false);
    cache.set_entry("recovery_email_status", {
      data: result,
      error: null,
      fetched_at: Date.now(),
      is_loading: false,
    });
  } catch (caught) {
    ignore_error("components/settings/hooks/use_security/fetchers:use_security_fetchers", caught);
  }
}, [cache]);

const fetch_security_status = useCallback(async () => {
  try {
    const response = await get_security_status();

    if (!response.data) return;

    let status = response.data;

    if (status.password_strength_tier === null) {
      const passphrase = get_passphrase_from_memory();

      if (passphrase) {
        const tier = compute_password_strength_tier(passphrase);

        status = { ...status, password_strength_tier: tier };
        backfill_password_strength_tier(tier).catch((caught) => ignore_error("components/settings/hooks/use_security/fetchers:use_security_fetchers", caught));
      }
    }

    set_security_status(status);
    cache.set_entry("security_status", {
      data: { ...response, data: status },
      error: null,
      fetched_at: Date.now(),
      is_loading: false,
    });
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);

    return;
  }
}, [cache]);

const hydrate_security_status = useCallback(async () => {
  const cached = cache.get_entry<ApiResponse<SecurityStatusResponse>>(
    "security_status",
  );

  if (cache.is_fresh("security_status") && cached?.data?.data) {
    set_security_status(cached.data.data);

    return;
  }

  await fetch_security_status();
}, [cache, fetch_security_status]);

const hydrate_totp_status = useCallback(async () => {
  const cached = cache.get_entry<ApiResponse<TotpStatusResponse>>(
    "totp_status",
  );

  if (cache.is_fresh("totp_status") && cached?.data?.data) {
    set_totp_status(cached.data.data);

    return;
  }

  await fetch_totp_status();
}, [cache, fetch_totp_status]);

const hydrate_login_alerts_status = useCallback(async () => {
  const cached = cache.get_entry<ApiResponse<{ enabled: boolean }>>(
    "login_alerts_status",
  );

  if (cache.is_fresh("login_alerts_status") && cached?.data?.data) {
    set_login_alerts_enabled(cached.data.data.enabled);

    return;
  }

  await fetch_login_alerts_status();
}, [cache, fetch_login_alerts_status]);

const hydrate_recovery_email_status = useCallback(async () => {
  const cached = cache.get_entry<{ data: { verified: boolean } }>(
    "recovery_email_status",
  );

  if (cache.is_fresh("recovery_email_status") && cached?.data) {
    set_recovery_email_verified(cached.data.data.verified ?? false);

    return;
  }

  await fetch_recovery_email_status();
}, [cache, fetch_recovery_email_status]);

const fetch_sessions = useCallback(async () => {
  set_sessions_loading(true);
  set_sessions_error(null);

  try {
    const response = await list_sessions();

    if (response.data) {
      set_sessions(response.data.sessions);
    } else {
      set_sessions_error(
        response.error || t("settings.failed_load_sessions"),
      );
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    set_sessions_error(t("settings.failed_load_sessions"));
  } finally {
    set_sessions_loading(false);
  }
}, [t]);

  return {
    fetch_totp_status,
    fetch_login_alerts_status,
    fetch_login_events,
    fetch_ipfs_status,
    fetch_recovery_email_status,
    fetch_security_status,
    hydrate_security_status,
    hydrate_totp_status,
    hydrate_login_alerts_status,
    hydrate_recovery_email_status,
    fetch_sessions,
  };
}
