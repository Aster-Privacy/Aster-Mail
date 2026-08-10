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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";

import {
  get_stored_encrypted_vault,
  clear_stored_encrypted_vault,
  get_session_passphrase,
  clear_session_passphrase,
} from "./session_passphrase";
import { purge_all_local_data } from "./purge_local_data";


import {
  api_client,
  type SessionReestablishResult,
} from "@/services/api/client";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  clear_vault_from_memory,
  re_trigger_keys_ready,
} from "@/services/crypto/memory_key_store";
import {
  type User,
  type StoredAccount,
  get_all_accounts,
  remove_account as storage_remove_account,
  switch_account as storage_switch_account,
  update_account_user,
  get_account_kind,
  accounts_storage_unreadable,
} from "@/services/account_manager";
import {
  perform_shared_mailbox_login,
  clear_shared_mailbox_session,
} from "@/services/shared_mailbox_session";
import {
  get_account_limit,
  link_account_device,
} from "@/services/api/switch";
import { sync_client } from "@/services/sync_client";
import {
  start_session_timeout,
  stop_session_timeout,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import {
  get_current_plan_code,
  max_accounts_for_plan,
  UNLIMITED_ACCOUNTS,
} from "@/services/plan_limits";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";
import { show_toast } from "@/components/toast/simple_toast";
import { hard_redirect } from "@/lib/hard_redirect";
import { clear_device_session } from "@/native/desktop_device_auth";
import {
  account_index_routing_enabled,
  app_pathname,
  get_active_account_index,
  is_public_entry_path,
  redirect_to_account_index,
  take_url_account_request,
} from "@/lib/account_index_url";
import { clear_app_lock_config, clear_session_unlock } from "@/services/app_lock_store";
import {
  delete_category_index_for_account,
} from "@/services/category_index";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  clear_account_scoped_caches,
  safe_log_error,
  with_timeout,
} from "./auth_helpers";

import { use_auth_account_state } from "./use_auth_account_state";

export function use_auth_provider_state() {
  const {
    t,
    navigate,
    state,
    set_state,
    is_adding_account,
    set_is_adding_account,
    is_completing_registration,
    set_is_completing_registration,
    max_account_limit,
    set_max_account_limit,
    handle_identity_mismatch,
    login,
    add_account,
    remove_account_handler,
  } = use_auth_account_state();

  const location = useLocation();
  const switch_in_flight = useRef(false);
  const session_expired_muted_until = useRef(0);

  const begin_account_reauth = useCallback(
    (target: StoredAccount, previous_account_id: string | null) => {
      set_is_adding_account(true);

      const params = new URLSearchParams();

      params.set("u", target.user.email);
      params.set("reason", "session_expired");
      params.set("reauth", target.id);

      if (previous_account_id && previous_account_id !== target.id) {
        params.set("from", previous_account_id);
      }

      navigate(`/sign-in?${params.toString()}`);
    },
    [navigate, set_is_adding_account],
  );

  const switch_to_account = useCallback(
    async (account_id: string) => {
      if (switch_in_flight.current) return;
      switch_in_flight.current = true;
      session_expired_muted_until.current = Date.now() + 30000;

      try {
        const accounts = await get_all_accounts();
        const target = accounts.find((a) => a.id === account_id);

        if (!target) return;
        if (target.id === state.current_account_id) return;

        const previous_account_id = state.current_account_id;
        const target_kind = await get_account_kind(target.id);

        let stored_passphrase: string | null = null;
        let stored_vault: ReturnType<typeof get_stored_encrypted_vault> = null;

        if (target_kind !== "shared") {
          try {
            stored_passphrase = await get_session_passphrase(target.id);
          } catch {
            stored_passphrase = null;
          }
          stored_vault = get_stored_encrypted_vault(target.id);

          if (!stored_passphrase || !stored_vault) {
            begin_account_reauth(target, previous_account_id);

            return;
          }
        }

        set_is_adding_account(true);
        sync_client.disconnect();
        stop_session_timeout();
        clear_vault_from_memory();
        await clear_account_scoped_caches();

        try {
          await with_timeout(api_client.prepare_for_account_switch(), 5000);
        } catch (e) {
          safe_log_error(e);
        }

        api_client.clear_dev_token();

        try {
          await api_client.clear_session_cookies();
        } catch (e) {
          safe_log_error(e);
        }

        await storage_switch_account(target.id);
        api_client.set_expected_user_id(target.user.id);

        if (target_kind === "shared") {
          try {
            const result = await perform_shared_mailbox_login(
              target.id,
              target.user.email,
              target.user.username,
            );

            await login(
              {
                ...result.user,
                display_name: target.user.display_name,
                profile_color: target.user.profile_color,
              },
              result.vault,
              result.login_secret,
              result.encrypted_vault,
              result.vault_nonce,
            );
            hard_redirect("/");

            return;
          } catch (e) {
            safe_log_error(e);

            const message = e instanceof Error ? e.message : "";
            const access_gone = /unavailable|no longer|not found/i.test(message);

            if (access_gone) {
              await clear_shared_mailbox_session(target.id);
              await storage_remove_account(target.id);
            }

            const remaining = await get_all_accounts();
            const fallback = remaining.find((a) => a.kind !== "shared");

            show_toast(
              access_gone
                ? t("shared_mailboxes.access_unavailable")
                : t("settings.switch_failed"),
              "error",
            );
            set_state((prev) => ({
              ...prev,
              user: null,
              is_loading: false,
              is_authenticated: false,
              has_keys: false,
              accounts: remaining,
              current_account_id: fallback?.id ?? null,
            }));

            if (fallback) {
              await storage_switch_account(fallback.id);
              navigate(
                `/sign-in?u=${encodeURIComponent(fallback.user.email.split("@")[0] ?? "")}`,
              );
            } else {
              navigate("/sign-in");
            }

            return;
          }
        }

        if (stored_passphrase && stored_vault) {
          set_is_adding_account(false);

          const attempt = async (): Promise<SessionReestablishResult> => {
            try {
              return await api_client.reestablish_session_for_account(
                target.id,
              );
            } catch (e) {
              safe_log_error(e);

              return "unavailable";
            }
          };

          let session_result = await attempt();

          if (session_result === "unavailable") {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            session_result = await attempt();
          }

          if (session_result === "ok" || session_result === "unavailable") {
            hard_redirect("/");

            return;
          }
        }

        set_state((prev) => ({
          ...prev,
          user: null,
          is_loading: false,
          is_authenticated: false,
          has_keys: false,
          current_account_id: target.id,
        }));
        begin_account_reauth(target, previous_account_id);
      } finally {
        switch_in_flight.current = false;
        session_expired_muted_until.current = Date.now() + 5000;
      }
    },
    [
      navigate,
      state.current_account_id,
      set_is_adding_account,
      begin_account_reauth,
      login,
      t,
    ],
  );

  const clear_local_auth_data = useCallback(async () => {
    await purge_all_local_data();

    set_state({
      user: null,
      is_loading: false,
      is_authenticated: false,
      has_keys: false,
      accounts: [],
      current_account_id: null,
    });
  }, []);

  const logout_in_flight = useRef(false);

  const logout = useCallback(async () => {
    if (logout_in_flight.current) return;
    logout_in_flight.current = true;

    const current_id = state.current_account_id;
    const other = state.accounts.find((a) => a.id !== current_id);
    let nav_target = other ? "/" : "/sign-in";
    const fallback_timer = window.setTimeout(() => {
      try {
        if ("__TAURI_INTERNALS__" in window) return;
        hard_redirect(nav_target);
      } catch {}
    }, 6000);

    try {
      api_client.begin_intentional_logout();
      try {
        sync_client.disconnect();
      } catch (e) {
        safe_log_error(e);
      }

      await with_timeout(clear_device_session(), 2000).catch(() => {});

      await with_timeout(
        api_client.post("/core/v1/auth/logout", {}),
        3000,
      );

      if (other && current_id) {
        stop_session_timeout();
        clear_vault_from_memory();
        await with_timeout(clear_account_scoped_caches(), 3000);
        await with_timeout(delete_category_index_for_account(current_id), 2000);
        clear_stored_encrypted_vault(current_id);
        await with_timeout(clear_session_passphrase(current_id), 2000);
        clear_session_timeout_data(current_id);
        clear_app_lock_config(current_id);
        clear_session_unlock(current_id);
        api_client.clear_dev_token();

        await with_timeout(api_client.clear_session_cookies(), 2000);

        await with_timeout(storage_remove_account(current_id), 2000);
        await with_timeout(storage_switch_account(other.id), 2000);
        api_client.clear_in_memory_token();

        const survivor_local = other.user.email.split("@")[0] ?? "";

        set_state((prev) => ({
          ...prev,
          user: null,
          is_loading: false,
          is_authenticated: false,
          has_keys: false,
          accounts: prev.accounts.filter((a) => a.id !== current_id),
          current_account_id: other.id,
        }));
        set_is_adding_account(true);
        nav_target = `/sign-in?u=${encodeURIComponent(survivor_local)}`;
      } else {
        await with_timeout(clear_local_auth_data(), 4000);
        nav_target = "/sign-in";
      }
    } catch (e) {
      safe_log_error(e);
    } finally {
      clearTimeout(fallback_timer);
      logout_in_flight.current = false;
      try {
        if (!("__TAURI_INTERNALS__" in window)) {
          navigate(nav_target);
        }
      } catch {}
    }
  }, [clear_local_auth_data, navigate, state.accounts, state.current_account_id]);

  const logout_all_handler = useCallback(async () => {
    const fallback_timer = window.setTimeout(() => {
      try {
        if ("__TAURI_INTERNALS__" in window) return;
        hard_redirect("/sign-in");
      } catch {}
    }, 6000);

    try {
      api_client.begin_intentional_logout();
      try {
        sync_client.disconnect();
      } catch (e) {
        safe_log_error(e);
      }

      await with_timeout(clear_device_session(), 2000).catch(() => {});

      await with_timeout(
        api_client.post("/core/v1/auth/logout-all", {}),
        3000,
      );

      await with_timeout(clear_local_auth_data(), 4000);
    } catch (e) {
      safe_log_error(e);
    } finally {
      clearTimeout(fallback_timer);
      try {
        if (!("__TAURI_INTERNALS__" in window)) {
          navigate("/sign-in");
        }
      } catch {}
    }
  }, [clear_local_auth_data, navigate]);

  useEffect(() => {
    const sign_out_keeping_other_accounts = async (
      message_key: TranslationKey,
      reason?: string,
    ) => {
      await clear_device_session().catch(() => {});

      const path = app_pathname();
      const current_id = state.current_account_id;
      const all_accounts = await get_all_accounts();
      const target = all_accounts.find((a) => a.id === current_id);
      const keep_accounts =
        all_accounts.length > 1 || accounts_storage_unreadable();

      if (!keep_accounts) {
        await clear_local_auth_data();

        if (path === "/sign-in") return;

        show_toast(t(message_key), "info");
        await api_client.clear_session_cookies().catch(() => {});
        navigate("/sign-in");

        return;
      }

      stop_session_timeout();
      clear_vault_from_memory();

      if (current_id) {
        clear_session_timeout_data(current_id);
        clear_session_unlock(current_id);
        await clear_session_passphrase(current_id).catch(() => {});
      }

      set_is_adding_account(true);
      set_state((prev) => ({
        ...prev,
        user: null,
        is_loading: false,
        is_authenticated: false,
        has_keys: false,
        accounts: all_accounts.length > 0 ? all_accounts : prev.accounts,
      }));

      if (path === "/sign-in") return;

      const params = new URLSearchParams();
      const local = target?.user.email.split("@")[0] ?? "";

      if (local) params.set("u", local);
      if (reason) params.set("reason", reason);

      const query = params.toString();

      show_toast(t(message_key), "info");
      navigate(query ? `/sign-in?${query}` : "/sign-in");
    };

    const handle_session_expired = async () => {
      if (Date.now() < session_expired_muted_until.current) return;

      await new Promise((resolve) => setTimeout(resolve, 600));

      if (Date.now() < session_expired_muted_until.current) return;
      const still_valid = await api_client.check_auth_status();
      if (still_valid) {
        api_client.set_authenticated(true);
        re_trigger_keys_ready();
        return;
      }

      sync_client.disconnect();
      api_client.clear_auth_data();
      api_client.set_authenticated(false);

      await sign_out_keeping_other_accounts(
        "common.session_expired_sign_in",
        "session_expired",
      );
    };

    const handle_session_timeout = async () => {
      sync_client.disconnect();

      try {
        await api_client.post("/core/v1/auth/logout", {});
      } catch {
        api_client.clear_session_cookies();
      }

      await sign_out_keeping_other_accounts("common.signed_out_inactivity");
    };

    const handle_session_revoked = async () => {
      await sign_out_keeping_other_accounts("common.device_revoked");
    };

    const handle_identity_mismatch_event = () => {
      handle_identity_mismatch().catch((e) => {
        safe_log_error(e);
      });
    };

    window.addEventListener(
      "astermail:session-expired",
      handle_session_expired,
    );

    window.addEventListener(
      "astermail:identity-mismatch",
      handle_identity_mismatch_event,
    );

    window.addEventListener(
      "astermail:session-timeout",
      handle_session_timeout,
    );

    window.addEventListener(
      "astermail:session-revoked",
      handle_session_revoked,
    );

    return () => {
      window.removeEventListener(
        "astermail:session-expired",
        handle_session_expired,
      );
      window.removeEventListener(
        "astermail:identity-mismatch",
        handle_identity_mismatch_event,
      );
      window.removeEventListener(
        "astermail:session-timeout",
        handle_session_timeout,
      );
      window.removeEventListener(
        "astermail:session-revoked",
        handle_session_revoked,
      );
    };
  }, [
    clear_local_auth_data,
    handle_identity_mismatch,
    set_is_adding_account,
    state.current_account_id,
    t,
  ]);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let last_check = 0;
    const THROTTLE_MS = 30000;

    const handle_focus = () => {
      if (!navigator.onLine) return;
      if (!api_client.is_authenticated()) return;

      const now = Date.now();

      if (now - last_check < THROTTLE_MS) return;
      last_check = now;

      api_client.refresh_session().catch((e) => {
        safe_log_error(e);
      });
    };

    window.addEventListener("focus", handle_focus);

    return () => window.removeEventListener("focus", handle_focus);
  }, [clear_local_auth_data, state.is_authenticated]);

  useEffect(() => {
    if (!state.is_authenticated) return;
    let cancelled = false;

    const resolve_account_limit = async () => {
      const link_result = await link_account_device().catch((e) => {
        safe_log_error(e);

        return null;
      });

      if (cancelled) return;

      let limit = link_result?.data?.max_accounts;

      if (limit === undefined) {
        const limit_result = await get_account_limit().catch((e) => {
          safe_log_error(e);

          return null;
        });

        if (cancelled) return;
        limit = limit_result?.data?.max_accounts;
      }

      if (limit !== undefined && limit !== 0) {
        set_max_account_limit(limit);

        return;
      }

      const plan_code = await get_current_plan_code().catch((e) => {
        safe_log_error(e);

        return null;
      });

      if (cancelled) return;
      set_max_account_limit(max_accounts_for_plan(plan_code));
    };

    resolve_account_limit();

    return () => {
      cancelled = true;
    };
  }, [state.is_authenticated, state.current_account_id]);

  useEffect(() => {
    if (!state.is_authenticated) return;
    if (!state.current_account_id) return;

    const params = new URLSearchParams(window.location.search);
    const requested = params.get("account");

    if (!requested) return;

    params.delete("account");
    const query = params.toString();

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );

    if (requested === state.current_account_id) return;

    switch_to_account(requested).catch((e) => {
      safe_log_error(e);
    });
  }, [state.is_authenticated, state.current_account_id, switch_to_account]);

  useEffect(() => {
    if (!account_index_routing_enabled()) return;
    if (!state.is_authenticated || !state.has_keys) return;
    if (is_public_entry_path(location.pathname)) return;

    const current_index = state.accounts.findIndex(
      (a) => a.id === state.current_account_id,
    );

    if (current_index === -1) return;

    const url_index = get_active_account_index();

    if (url_index === null) return;

    const requested_index = take_url_account_request();

    if (current_index === url_index) return;

    const target =
      requested_index === null ? null : state.accounts[requested_index];

    if (target && target.id !== state.current_account_id) {
      switch_to_account(target.id).catch((e) => {
        safe_log_error(e);
      });

      return;
    }

    redirect_to_account_index(current_index);
  }, [
    state.is_authenticated,
    state.has_keys,
    state.accounts,
    state.current_account_id,
    location.pathname,
    switch_to_account,
  ]);

  const set_vault = useCallback(
    async (vault: EncryptedVault, passphrase: string) => {
      await store_vault_in_memory(
        vault,
        passphrase,
        state.user?.id ?? state.current_account_id ?? undefined,
      );

      if (state.current_account_id) {
        start_session_timeout(state.current_account_id);
      }

      ensure_default_labels(vault, t).catch(console.error);

      set_state((prev) => ({ ...prev, has_keys: true }));
    },
    [state.current_account_id, state.user?.id, t],
  );

  const can_add = useCallback(async () => {
    const personal_count = (await get_all_accounts()).filter(
      (a) => a.kind !== "shared",
    ).length;

    const plan_fallback_limit = async () => {
      try {
        return max_accounts_for_plan(await get_current_plan_code());
      } catch (e) {
        safe_log_error(e);

        return max_accounts_for_plan(null);
      }
    };

    let limit: number;

    try {
      const limit_response = await get_account_limit();

      limit =
        limit_response.data && limit_response.data.max_accounts !== 0
          ? limit_response.data.max_accounts
          : await plan_fallback_limit();
    } catch (e) {
      safe_log_error(e);
      limit = await plan_fallback_limit();
    }

    if (limit === UNLIMITED_ACCOUNTS) return true;

    return personal_count < limit;
  }, []);

  const update_user = useCallback(
    async (updated_user: User) => {
      if (state.current_account_id) {
        await update_account_user(state.current_account_id, updated_user);
      }
      set_state((prev) => ({ ...prev, user: updated_user }));
    },
    [state.current_account_id],
  );

  const get_current_vault = useCallback((): EncryptedVault | null => {
    if (!state.has_keys && !is_completing_registration) {
      return null;
    }

    return get_vault_from_memory();
  }, [state.has_keys, is_completing_registration]);

  const context_value = useMemo(
    () => ({
      ...state,
      vault: get_current_vault(),
      login,
      logout,
      logout_all: logout_all_handler,
      set_vault,
      add_account,
      remove_account: remove_account_handler,
      switch_to_account,
      can_add_account: can_add,
      account_count: state.accounts.length,
      is_adding_account,
      set_is_adding_account,
      update_user,
      is_completing_registration,
      set_is_completing_registration,
      max_account_limit,
    }),
    [
      state,
      get_current_vault,
      login,
      logout,
      logout_all_handler,
      set_vault,
      add_account,
      remove_account_handler,
      switch_to_account,
      can_add,
      is_adding_account,
      set_is_adding_account,
      update_user,
      is_completing_registration,
      set_is_completing_registration,
      max_account_limit,
    ],
  );

  return {
    context_value,
  };
}
