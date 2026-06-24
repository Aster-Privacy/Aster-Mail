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
import type { AuthState, AuthProviderProps } from "./auth_types";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { AuthContext } from "./use_auth_hook";
import {
  store_encrypted_vault,
  get_stored_encrypted_vault,
  clear_stored_encrypted_vault,
  store_session_passphrase,
  get_session_passphrase,
  clear_session_passphrase,
} from "./session_passphrase";
import { decrypt_vault_with_lock } from "./vault_decryption";
import { purge_all_local_data } from "./purge_local_data";

import { ensure_ratchet_keys } from "@/services/crypto/ensure_ratchet_keys";
import { init_desktop_device_auth } from "@/native/desktop_device_auth";

import { api_client } from "@/services/api/client";
import { request_cache } from "@/services/api/request_cache";
import { verify_auth_status, get_user_info } from "@/services/api/auth";
import { set_lockdown_enabled } from "@/services/lockdown_store";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  clear_vault_from_memory,
  has_vault_in_memory,
  re_trigger_keys_ready,
} from "@/services/crypto/memory_key_store";
import {
  type User,
  initialize_accounts,
  get_all_accounts,
  get_current_account,
  add_account as storage_add_account,
  remove_account as storage_remove_account,
  switch_account as storage_switch_account,
  update_account_user,
  update_account_tokens,
} from "@/services/account_manager";
import { get_account_limit } from "@/services/api/switch";
import { sync_client } from "@/services/sync_client";
import {
  start_session_timeout,
  stop_session_timeout,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_plan_limits_cache } from "@/hooks/use_plan_limits";
import { clear_aliases_cache } from "@/components/settings/hooks/use_aliases";
import { clear_plan_cache } from "@/services/plan_limits";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { clear_folders_cache } from "@/hooks/use_folders";
import { clear_preload_cache } from "@/components/email/hooks/preload_cache";
import { clear_attachment_preview_cache } from "@/hooks/use_attachment_previews";
import { clear_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { clear_all_ratchet_states } from "@/services/crypto/double_ratchet";
import { check_and_run_recovery_reencryption } from "@/services/crypto/recovery_reencrypt";
import { emit_auth_ready } from "@/hooks/mail_events";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";
import { connection_store } from "@/services/routing/connection_store";
import {
  load_preferred_sender_from_server,
  clear_preferred_sender_local,
} from "@/lib/preferred_sender";
import { clear_search_index } from "@/hooks/use_search";
import { clear_undo_send_state } from "@/hooks/use_undo_send";
import { clear_sender_aliases_cache } from "@/hooks/use_sender_aliases";
import { clear_persisted_draft_deletes } from "@/hooks/use_drafts_list";
import { clear_recovery_email_cache } from "@/services/api/recovery_email";
import { clear_preferences_cache } from "@/services/api/preferences";
import { show_toast } from "@/components/toast/simple_toast";
import { hard_redirect } from "@/lib/hard_redirect";
import { clear_app_lock_config, clear_session_unlock } from "@/services/app_lock_store";
import {
  clear_category_index_memory,
  delete_category_index_for_account,
} from "@/services/category_index";
import { use_i18n } from "@/lib/i18n/context";

const AUTH_VERIFY_TIMEOUT_MS = 12000;

async function clear_account_scoped_caches(): Promise<void> {
  clear_mail_stats();
  clear_mail_cache();
  clear_folders_cache();
  clear_preload_cache();
  clear_plan_limits_cache();
  clear_aliases_cache();
  clear_plan_cache();
  clear_search_index();
  clear_recovery_email_cache();
  clear_preferred_sender_local();
  clear_preferences_cache();
  clear_category_index_memory();
  clear_undo_send_state();
  clear_sender_aliases_cache();
  clear_persisted_draft_deletes();
  clear_attachment_preview_cache();
  clear_attachment_keys();
  request_cache.clear();
  await clear_all_ratchet_states();
}

function safe_log_error(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const payload = err instanceof Error ? { name: err.name } : { kind: typeof err };

  console.error("auth error", JSON.stringify(payload));
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [state, set_state] = useState<AuthState>({
    user: null,
    is_loading: true,
    is_authenticated: false,
    has_keys: false,
    accounts: [],
    current_account_id: null,
  });

  const [is_adding_account, _set_is_adding_account] = useState(false);

  const set_is_adding_account = useCallback((value: boolean) => {
    if (value) {
      api_client.suspend_account_persist();
      api_client.begin_account_add();
    } else {
      api_client.resume_account_persist();
      api_client.end_account_add();
    }
    _set_is_adding_account(value);
  }, []);
  const [is_completing_registration, set_is_completing_registration] =
    useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const data = await initialize_accounts();
        const current = await get_current_account();

        if (!current) {
          api_client.set_authenticated(false);
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          }));

          return;
        }

        await api_client.load_tokens_for_account(current.id);

        if ("__TAURI_INTERNALS__" in window) {
          const logout_flag = sessionStorage.getItem("aster_tauri_logout");
          if (logout_flag) {
            sessionStorage.removeItem("aster_tauri_logout");
          } else {
            await init_desktop_device_auth();
          }
        }

        let verify_timed_out = false;
        const is_auth_valid = await Promise.race([
          verify_auth_status(),
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              verify_timed_out = true;
              resolve(false);
            }, AUTH_VERIFY_TIMEOUT_MS),
          ),
        ]);

        if (verify_timed_out) {
          api_client.set_authenticated(false);
          sync_client.disconnect();
          set_state({
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          });

          const local = current.user.email.split("@")[0] ?? "";
          const uses_hash = "__TAURI_INTERNALS__" in window;
          const path = uses_hash
            ? window.location.hash.slice(1).split("?")[0] || "/"
            : window.location.pathname;
          if (path !== "/sign-in" && path !== "/register") {
            navigate(`/sign-in?u=${encodeURIComponent(local)}`);
          }

          return;
        }

        if (is_auth_valid) {
          api_client.set_authenticated(true);
          connection_store.sync_from_server().catch(() => {});
          load_preferred_sender_from_server().catch(() => {});
          sync_client.connect().catch((e) => {
            safe_log_error(e);
          });

          let has_keys = has_vault_in_memory();

          if (!has_keys) {
            let stored_passphrase: string | null = null;

            try {
              stored_passphrase = await get_session_passphrase(current.id);
            } catch {
              await clear_session_passphrase(current.id);
            }
            const stored_vault = get_stored_encrypted_vault(current.id);

            if (stored_passphrase && stored_vault) {
              try {
                const vault = await decrypt_vault_with_lock(
                  stored_vault.encrypted_vault,
                  stored_vault.vault_nonce,
                  stored_passphrase,
                );

                has_keys = vault !== null;
              } catch {
                await clear_session_passphrase(current.id);
              }
            }
          }

          if (!has_keys && "__TAURI_INTERNALS__" in window) {
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              const raw_b64 = await invoke<string | null>("device_get_stored_passphrase");
              if (raw_b64) {
                const bytes = Uint8Array.from(
                  atob(raw_b64.replace(/-/g, "+").replace(/_/g, "/")),
                  (c) => c.charCodeAt(0),
                );
                const native_passphrase = new TextDecoder().decode(bytes);
                const stored_vault = get_stored_encrypted_vault(current.id);
                if (stored_vault) {
                  try {
                    const recovered = await decrypt_vault_with_lock(
                      stored_vault.encrypted_vault,
                      stored_vault.vault_nonce,
                      native_passphrase,
                    );
                    if (recovered !== null) {
                      has_keys = true;
                      store_session_passphrase(current.id, native_passphrase).catch(() => {});
                    }
                  } catch {}
                }
              }
            } catch {}
          }

          if (!has_keys) {
            sync_client.disconnect();
            api_client.set_authenticated(false);
            set_state({
              user: null,
              is_loading: false,
              is_authenticated: false,
              has_keys: false,
              accounts: data.accounts,
              current_account_id: data.current_account_id,
            });

            const local = current.user.email.split("@")[0] ?? "";
            const uses_hash = "__TAURI_INTERNALS__" in window;
            const path = uses_hash
              ? window.location.hash.slice(1).split("?")[0] || "/"
              : window.location.pathname;
            if (path !== "/sign-in" && path !== "/register") {
              navigate(`/sign-in?u=${encodeURIComponent(local)}`);
            }

            return;
          }

          start_session_timeout(current.id);

          let synced_user = current.user;
          const cached_info = api_client.get_cached_user_info();

          if (cached_info && cached_info.user_id === current.user.id) {
            synced_user = {
              id: cached_info.user_id,
              username: cached_info.username ?? current.user.username,
              email: cached_info.email ?? current.user.email,
              display_name: cached_info.display_name || current.user.display_name || undefined,
              profile_color: cached_info.profile_color || current.user.profile_color || undefined,
              profile_picture: cached_info.profile_picture || current.user.profile_picture || undefined,
            };
            await update_account_user(current.id, synced_user);
          }

          if (cached_info?.lockdown_mode_enabled !== undefined) {
            set_lockdown_enabled(current.id, cached_info.lockdown_mode_enabled);
          }

          set_state({
            user: synced_user,
            is_loading: false,
            is_authenticated: true,
            has_keys: true,
            accounts: data.accounts,
            current_account_id: data.current_account_id,
          });

          emit_auth_ready();

          backfill_user_profile(synced_user);
          ensure_default_labels(get_vault_from_memory(), t).catch(console.error);
        } else {
          api_client.clear_auth_data();
          api_client.set_authenticated(false);
          sync_client.disconnect();

          try {
            await storage_remove_account(current.id);
            clear_stored_encrypted_vault(current.id);
            await clear_session_passphrase(current.id);
            clear_session_timeout_data(current.id);
          } catch (e) {
            safe_log_error(e);
          }

          const remaining = await get_all_accounts();
          const local = current.user.email.split("@")[0] ?? "";

          set_state({
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: remaining,
            current_account_id: remaining[0]?.id ?? null,
          });

          const uses_hash = "__TAURI_INTERNALS__" in window;
          const path = uses_hash
            ? window.location.hash.slice(1).split("?")[0] || "/"
            : window.location.pathname;
          if (path !== "/sign-in" && path !== "/register") {
            navigate(`/sign-in?u=${encodeURIComponent(local)}`);
          }
        }
      } catch (e) {
        safe_log_error(e);
        sync_client.disconnect();
        set_state((prev) => ({
          ...prev,
          is_loading: false,
        }));
      }
    };

    init().finally(() => {
      window.dispatchEvent(new CustomEvent("astermail:auth-loaded"));
    });
  }, []);

  const backfill_user_profile = useCallback(async (logged_in_user: User) => {
    try {
      const response = await get_user_info();
      const info = response?.data;

      if (!info) return;

      if (info.lockdown_mode_enabled !== undefined) {
        set_lockdown_enabled(logged_in_user.id, info.lockdown_mode_enabled);
      }

      const merged: User = {
        ...logged_in_user,
        display_name:
          logged_in_user.display_name || info.display_name || undefined,
        profile_color:
          logged_in_user.profile_color || info.profile_color || undefined,
        profile_picture:
          logged_in_user.profile_picture || info.profile_picture || undefined,
      };

      if (
        merged.display_name === logged_in_user.display_name &&
        merged.profile_color === logged_in_user.profile_color &&
        merged.profile_picture === logged_in_user.profile_picture
      ) {
        return;
      }

      await update_account_user(logged_in_user.id, merged);
      set_state((prev) =>
        prev.current_account_id === logged_in_user.id && prev.user
          ? {
              ...prev,
              user: {
                ...prev.user,
                display_name: prev.user.display_name || merged.display_name,
                profile_color: prev.user.profile_color || merged.profile_color,
                profile_picture:
                  prev.user.profile_picture || merged.profile_picture,
              },
            }
          : prev,
      );
    } catch {}
  }, []);

  const login = useCallback(
    async (
      user: User,
      vault: EncryptedVault,
      passphrase: string,
      encrypted_vault?: string,
      vault_nonce?: string,
    ) => {
      await store_vault_in_memory(vault, passphrase);

      try {
        await Promise.race([
          store_session_passphrase(user.id, passphrase),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("session passphrase timeout")),
              8000,
            ),
          ),
        ]);
      } catch {}

      try {
        if (encrypted_vault && vault_nonce) {
          store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
        }
      } catch (e) {
        safe_log_error(e);
      }

      api_client.set_authenticated(true);

      const add_result = await with_timeout(storage_add_account(user), 5000);
      const persisted = add_result?.success === true;

      if (persisted) {
        const active_token = api_client.get_access_token();
        if (active_token) {
          await with_timeout(
            update_account_tokens(
              user.id,
              active_token,
              api_client.get_active_refresh_token(),
            ),
            3000,
          );
        }
      }

      check_and_run_recovery_reencryption(vault, passphrase).catch(() => {});
      ensure_ratchet_keys().catch(() => {});
      ensure_default_labels(vault, t).catch(console.error);
      connection_store.sync_from_server().catch(() => {});
      load_preferred_sender_from_server().catch(() => {});
      sync_client.connect().catch((e) => {
        safe_log_error(e);
      });

      start_session_timeout(user.id);

      let accounts = (await with_timeout(get_all_accounts(), 3000)) ?? [];

      if (!accounts.some((a) => a.id === user.id)) {
        accounts = [...accounts, { id: user.id, user, added_at: Date.now() }];
      }

      set_state({
        user,
        is_loading: false,
        is_authenticated: true,
        has_keys: true,
        accounts,
        current_account_id: user.id,
      });
      set_is_adding_account(false);

      backfill_user_profile(user);
    },
    [t, backfill_user_profile],
  );

  const add_account = useCallback(
    async (
      user: User,
      vault: EncryptedVault,
      passphrase: string,
      encrypted_vault?: string,
      vault_nonce?: string,
    ) => {
      await store_vault_in_memory(vault, passphrase);

      try {
        await Promise.race([
          store_session_passphrase(user.id, passphrase),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("session passphrase timeout")),
              8000,
            ),
          ),
        ]);
      } catch {}

      if (encrypted_vault && vault_nonce) {
        store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
      }

      const result = await storage_add_account(user);

      if (!result.success) {
        clear_vault_from_memory();
        set_is_adding_account(false);

        return result;
      }

      if (result.success) {
        await clear_account_scoped_caches();

        const active_token = api_client.get_access_token();
        if (active_token) {
          await update_account_tokens(
            user.id,
            active_token,
            api_client.get_active_refresh_token(),
          );
        }
        api_client.set_authenticated(true);
        check_and_run_recovery_reencryption(vault, passphrase).catch(() => {});
        ensure_ratchet_keys().catch(() => {});
        ensure_default_labels(vault, t).catch(console.error);
        connection_store.sync_from_server().catch(() => {});
        load_preferred_sender_from_server().catch(() => {});
        sync_client.connect().catch((e) => {
          safe_log_error(e);
        });
        start_session_timeout(user.id);

        const accounts = (await with_timeout(get_all_accounts(), 3000)) ?? [
          { id: user.id, user, added_at: Date.now() },
        ];

        set_state({
          user,
          is_loading: false,
          is_authenticated: true,
          has_keys: true,
          accounts,
          current_account_id: user.id,
        });
        set_is_adding_account(false);

        emit_auth_ready();
        backfill_user_profile(user);
        navigate("/");
      }

      return result;
    },
    [t, backfill_user_profile, set_is_adding_account, navigate],
  );

  const remove_account_handler = useCallback(
    async (account_id: string) => {
      const is_current = account_id === state.current_account_id;

      if (is_current) {
        sync_client.disconnect();
        try {
          await api_client.post("/core/v1/auth/logout", {});
        } catch {
          if (import.meta.env.DEV) {
            console.error(
              "Failed to call logout endpoint during account removal",
            );
          }
        }
        api_client.clear_auth_data();
      }

      const result = await storage_remove_account(account_id);

      if (result.removed) {
        clear_stored_encrypted_vault(account_id);
        await clear_session_passphrase(account_id);
        clear_session_timeout_data(account_id);
        clear_app_lock_config(account_id);
        clear_session_unlock(account_id);

        if (!is_current) {
          set_state((prev) => ({
            ...prev,
            accounts: prev.accounts.filter((a) => a.id !== account_id),
          }));

          return;
        }

        stop_session_timeout();
        clear_vault_from_memory();
        await clear_account_scoped_caches();

        if (result.switched_to) {
          const survivor = result.switched_to;
          const local = survivor.user.email.split("@")[0] ?? "";

          set_state({
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: await get_all_accounts(),
            current_account_id: survivor.id,
          });
          set_is_adding_account(true);
          navigate(`/sign-in?u=${encodeURIComponent(local)}`);

          return;
        }

        api_client.set_authenticated(false);
        set_state({
          user: null,
          is_loading: false,
          is_authenticated: false,
          has_keys: false,
          accounts: await get_all_accounts(),
          current_account_id: null,
        });
      }
    },
    [state.current_account_id, set_is_adding_account, navigate],
  );

  const switch_in_flight = useRef(false);

  const switch_to_account = useCallback(
    async (account_id: string) => {
      if (switch_in_flight.current) return;
      switch_in_flight.current = true;

      try {
        const accounts = await get_all_accounts();
        const target = accounts.find((a) => a.id === account_id);

        if (!target) return;
        if (target.id === state.current_account_id) return;

        const local = target.user.email.split("@")[0] ?? "";

        set_is_adding_account(true);
        sync_client.disconnect();
        stop_session_timeout();
        clear_vault_from_memory();
        await clear_account_scoped_caches();
        api_client.clear_dev_token();

        try {
          await api_client.clear_session_cookies();
        } catch (e) {
          safe_log_error(e);
        }

        await storage_switch_account(target.id);

        set_state((prev) => ({
          ...prev,
          user: null,
          is_loading: false,
          is_authenticated: false,
          has_keys: false,
          current_account_id: target.id,
        }));
        navigate(`/sign-in?u=${encodeURIComponent(local)}`);
      } finally {
        switch_in_flight.current = false;
      }
    },
    [navigate, state.current_account_id, set_is_adding_account],
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

  const with_timeout = async <T,>(p: Promise<T>, ms: number): Promise<T | null> => {
    return Promise.race<T | null>([
      p.catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  };

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
    const handle_session_expired = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const still_valid = await api_client.check_auth_status();
      if (still_valid) {
        api_client.set_authenticated(true);
        re_trigger_keys_ready();
        return;
      }

      sync_client.disconnect();
      api_client.clear_auth_data();
      api_client.set_authenticated(false);

      const path = window.location.pathname;
      const current_id = state.current_account_id;
      const all_accounts = await get_all_accounts();
      const target = all_accounts.find((a) => a.id === current_id);

      if (target && all_accounts.length > 1) {
        set_is_adding_account(true);

        if (path === "/sign-in") {
          set_state((prev) => ({
            ...prev,
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
          }));

          return;
        }

        const local = target.user.email.split("@")[0] ?? "";

        set_state((prev) => ({
          ...prev,
          user: null,
          is_loading: false,
          is_authenticated: false,
          has_keys: false,
        }));
        show_toast(t("common.session_expired_sign_in"), "info");
        navigate(`/sign-in?u=${encodeURIComponent(local)}`);

        return;
      }

      await clear_local_auth_data();

      if (path === "/sign-in") return;

      show_toast(t("common.session_expired_sign_in"), "info");
      await api_client.clear_session_cookies().catch(() => {});
      navigate("/sign-in");
    };

    const handle_session_timeout = async () => {
      sync_client.disconnect();

      try {
        await api_client.post("/core/v1/auth/logout", {});
      } catch {
        api_client.clear_session_cookies();
      }

      await clear_local_auth_data();
      show_toast(t("common.signed_out_inactivity"), "info");
      navigate("/sign-in");
    };

    const handle_session_revoked = async () => {
      await clear_local_auth_data();
      show_toast(t("common.device_revoked"), "info");
      await api_client.clear_session_cookies().catch(() => {});
      navigate("/sign-in");
    };

    window.addEventListener(
      "astermail:session-expired",
      handle_session_expired,
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

  const set_vault = useCallback(
    async (vault: EncryptedVault, passphrase: string) => {
      await store_vault_in_memory(vault, passphrase);

      if (state.current_account_id) {
        start_session_timeout(state.current_account_id);
      }

      ensure_default_labels(vault, t).catch(console.error);

      set_state((prev) => ({ ...prev, has_keys: true }));
    },
    [state.current_account_id, t],
  );

  const can_add = useCallback(async () => {
    try {
      const limit_response = await get_account_limit();

      if (limit_response.data) {
        const count = (await get_all_accounts()).length;

        return count < limit_response.data.max_accounts;
      }
    } catch (e) {
      safe_log_error(e);
    }

    const count = (await get_all_accounts()).length;

    return count < 3;
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
    ],
  );

  return (
    <AuthContext.Provider value={context_value}>
      {children}
    </AuthContext.Provider>
  );
}
