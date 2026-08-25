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
import type { AuthState } from "./auth_types";

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

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
import {
  AUTH_VERIFY_TIMEOUT_MS,
  clear_account_scoped_caches,
  safe_log_error,
  with_timeout,
} from "./auth_helpers";

import { ensure_ratchet_keys } from "@/services/crypto/ensure_ratchet_keys";
import { init_desktop_device_auth } from "@/native/desktop_device_auth";
import { api_client } from "@/services/api/client";
import { verify_auth_status, get_user_info } from "@/services/api/auth";
import { rekey_pgp_if_needed } from "@/services/pgp_rekey_service";
import { set_lockdown_enabled } from "@/services/lockdown_store";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  clear_vault_from_memory,
  has_vault_in_memory,
  has_vault_in_memory_for,
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
  get_account_kind,
} from "@/services/account_manager";
import {
  sync_shared_mailbox_grants,
  clear_shared_mailbox_session,
} from "@/services/shared_mailbox_session";
import {
  link_account_device,
  unlink_account_device,
} from "@/services/api/switch";
import { sync_client } from "@/services/sync_client";
import {
  start_session_timeout,
  stop_session_timeout,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import { check_and_run_recovery_reencryption } from "@/services/crypto/recovery_reencrypt";
import { emit_auth_ready } from "@/hooks/mail_events";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";
import { prime_server_recovery_email } from "@/services/api/recovery_email";
import { connection_store } from "@/services/routing/connection_store";
import { load_preferred_sender_from_server } from "@/lib/preferred_sender";
import { show_toast } from "@/components/toast/simple_toast";
import { hard_redirect } from "@/lib/hard_redirect";
import { app_pathname } from "@/lib/account_index_url";
import {
  clear_app_lock_config,
  clear_session_unlock,
} from "@/services/app_lock_store";
import { delete_category_index_for_account } from "@/services/category_index";
import { use_i18n } from "@/lib/i18n/context";
import { ignore_error } from "@/lib/ignore_error";

export function use_auth_account_state() {
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
  const [max_account_limit, set_max_account_limit] = useState<number | null>(
    null,
  );

  const handle_identity_mismatch = useCallback(async () => {
    api_client.begin_intentional_logout();
    sync_client.disconnect();
    stop_session_timeout();
    clear_vault_from_memory();

    let all_accounts: Awaited<ReturnType<typeof get_all_accounts>> = [];
    let affected: Awaited<ReturnType<typeof get_current_account>> = null;

    try {
      all_accounts = await get_all_accounts();
      affected = await get_current_account();
    } catch (e) {
      safe_log_error(e);
    }

    if (all_accounts.length > 1 && affected) {
      try {
        await clear_account_scoped_caches();
      } catch (e) {
        safe_log_error(e);
      }

      try {
        await delete_category_index_for_account(affected.id);
      } catch (e) {
        safe_log_error(e);
      }

      clear_stored_encrypted_vault(affected.id);
      clear_session_timeout_data(affected.id);
      clear_session_unlock(affected.id);
      clear_app_lock_config(affected.id);

      try {
        await clear_session_passphrase(affected.id);
      } catch (e) {
        safe_log_error(e);
      }

      try {
        await update_account_tokens(affected.id, null, null);
      } catch (e) {
        safe_log_error(e);
      }

      api_client.clear_dev_token();
      api_client.clear_in_memory_token();

      try {
        await api_client.clear_session_cookies();
      } catch (e) {
        safe_log_error(e);
      }

      api_client.set_expected_user_id(null);
      api_client.set_authenticated(false);
      set_is_adding_account(true);

      set_state((prev) => ({
        ...prev,
        user: null,
        is_loading: false,
        is_authenticated: false,
        has_keys: false,
        accounts: all_accounts,
        current_account_id: affected.id,
      }));

      show_toast(t("errors.session_identity_mismatch"), "error");

      const local = affected.user.email.split("@")[0] ?? "";

      navigate(
        local
          ? `/sign-in?u=${encodeURIComponent(local)}&reason=session_expired`
          : "/sign-in",
      );

      return;
    }

    try {
      await purge_all_local_data();
    } catch (e) {
      safe_log_error(e);
    }

    try {
      await api_client.clear_session_cookies();
    } catch (e) {
      safe_log_error(e);
    }

    api_client.set_expected_user_id(null);
    api_client.set_authenticated(false);

    set_state({
      user: null,
      is_loading: false,
      is_authenticated: false,
      has_keys: false,
      accounts: [],
      current_account_id: null,
    });

    show_toast(t("errors.session_identity_mismatch"), "error");
    hard_redirect("/sign-in");
  }, [t, navigate, set_is_adding_account]);

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
        api_client.set_expected_user_id(current.user.id);

        if ("__TAURI_INTERNALS__" in window) {
          await init_desktop_device_auth();
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

        if (is_auth_valid || verify_timed_out) {
          api_client.set_authenticated(true);
          connection_store
            .sync_from_server()
            .catch((caught) =>
              ignore_error("contexts/auth/use_auth_account_state:init", caught),
            );
          load_preferred_sender_from_server().catch((caught) =>
            ignore_error("contexts/auth/use_auth_account_state:init", caught),
          );
          sync_client.connect().catch((e) => {
            safe_log_error(e);
          });

          let has_keys = has_vault_in_memory_for(current.user.id);

          if (has_vault_in_memory() && !has_keys) {
            clear_vault_from_memory();
          }

          if (!has_keys) {
            let stored_passphrase: string | null = null;

            try {
              stored_passphrase = await get_session_passphrase(current.id);
            } catch (caught) {
              ignore_error("contexts/auth/use_auth_account_state:init", caught);
            }
            const stored_vault = get_stored_encrypted_vault(current.id);

            if (stored_passphrase && stored_vault) {
              try {
                const vault = await decrypt_vault_with_lock(
                  stored_vault.encrypted_vault,
                  stored_vault.vault_nonce,
                  stored_passphrase,
                  current.user.id,
                );

                has_keys = vault !== null;
              } catch (caught) {
                ignore_error(
                  "contexts/auth/use_auth_account_state:init",
                  caught,
                );
              }
            }
          }

          if (!has_keys && "__TAURI_INTERNALS__" in window) {
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              const raw_b64 = await invoke<string | null>(
                "device_get_stored_passphrase",
              );

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
                      current.user.id,
                    );

                    if (recovered !== null) {
                      has_keys = true;
                      store_session_passphrase(
                        current.id,
                        native_passphrase,
                      ).catch((caught) =>
                        ignore_error(
                          "contexts/auth/use_auth_account_state:init",
                          caught,
                        ),
                      );
                    }
                  } catch (caught) {
                    ignore_error(
                      "contexts/auth/use_auth_account_state:init",
                      caught,
                    );
                  }
                }
              }
            } catch (caught) {
              ignore_error("contexts/auth/use_auth_account_state:init", caught);
            }
          }

          if (!has_keys) {
            sync_client.disconnect();
            api_client.set_authenticated(false);

            const current_kind = await get_account_kind(current.id);

            if (current_kind === "shared") {
              await clear_shared_mailbox_session(current.id).catch((caught) =>
                ignore_error(
                  "contexts/auth/use_auth_account_state:init",
                  caught,
                ),
              );
              const remaining = await get_all_accounts();
              const fallback = remaining.find((a) => a.kind !== "shared");

              if (fallback) {
                await storage_switch_account(fallback.id);
                set_state({
                  user: null,
                  is_loading: false,
                  is_authenticated: false,
                  has_keys: false,
                  accounts: remaining,
                  current_account_id: fallback.id,
                });
                navigate(
                  `/sign-in?u=${encodeURIComponent(fallback.user.email.split("@")[0] ?? "")}`,
                );
              } else {
                set_state({
                  user: null,
                  is_loading: false,
                  is_authenticated: false,
                  has_keys: false,
                  accounts: remaining,
                  current_account_id: null,
                });
                navigate("/sign-in");
              }

              return;
            }

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
              : app_pathname();

            if (path !== "/sign-in" && path !== "/register") {
              navigate(`/sign-in?u=${encodeURIComponent(local)}`);
            }

            return;
          }

          start_session_timeout(current.id);

          let synced_user = current.user;
          const cached_info = api_client.get_cached_user_info();

          if (cached_info && cached_info.user_id !== current.user.id) {
            sync_client.disconnect();
            clear_vault_from_memory();
            await handle_identity_mismatch();

            return;
          }

          if (cached_info) {
            synced_user = {
              id: cached_info.user_id,
              username: cached_info.username ?? current.user.username,
              email: cached_info.email ?? current.user.email,
              display_name:
                cached_info.display_name ||
                current.user.display_name ||
                undefined,
              profile_color:
                cached_info.profile_color ||
                current.user.profile_color ||
                undefined,
              profile_picture:
                cached_info.profile_picture ||
                current.user.profile_picture ||
                undefined,
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
          ensure_default_labels(get_vault_from_memory(), t).catch(
            console.error,
          );
          prime_server_recovery_email(get_vault_from_memory()).catch((caught) =>
            ignore_error("contexts/auth/use_auth_account_state:init", caught),
          );

          sync_shared_mailbox_grants()
            .then(async () => {
              const refreshed = await get_all_accounts();

              set_state((prev) => ({ ...prev, accounts: refreshed }));
            })
            .catch((caught) =>
              ignore_error("contexts/auth/use_auth_account_state:init", caught),
            );
        } else {
          api_client.clear_auth_data();
          api_client.set_authenticated(false);
          sync_client.disconnect();

          try {
            await clear_session_passphrase(current.id);
            clear_session_timeout_data(current.id);
          } catch (e) {
            safe_log_error(e);
          }

          const remaining = await get_all_accounts();
          const prefill_local = current.user.email.split("@")[0] ?? "";

          set_state({
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: remaining,
            current_account_id: current.id,
          });

          const uses_hash = "__TAURI_INTERNALS__" in window;
          const path = uses_hash
            ? window.location.hash.slice(1).split("?")[0] || "/"
            : app_pathname();

          if (path !== "/sign-in" && path !== "/register") {
            navigate(
              `/sign-in?u=${encodeURIComponent(prefill_local)}&reason=session_expired`,
            );
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

      if ((info as { pgp_rekey_required?: boolean }).pgp_rekey_required) {
        void rekey_pgp_if_needed(info.email, info.display_name);
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
    } catch (caught) {
      ignore_error(
        "contexts/auth/use_auth_account_state:use_auth_account_state",
        caught,
      );
    }
  }, []);

  const login = useCallback(
    async (
      user: User,
      vault: EncryptedVault,
      passphrase: string,
      encrypted_vault?: string,
      vault_nonce?: string,
    ) => {
      await store_vault_in_memory(vault, passphrase, user.id);
      api_client.set_expected_user_id(user.id);

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
      } catch (caught) {
        ignore_error("contexts/auth/use_auth_account_state:init", caught);
      }

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

      check_and_run_recovery_reencryption(vault, passphrase).catch((caught) =>
        ignore_error("contexts/auth/use_auth_account_state:init", caught),
      );
      ensure_ratchet_keys().catch((caught) =>
        ignore_error("contexts/auth/use_auth_account_state:init", caught),
      );
      ensure_default_labels(vault, t).catch(console.error);
      prime_server_recovery_email(vault).catch((caught) =>
        ignore_error("contexts/auth/use_auth_account_state:init", caught),
      );
      connection_store
        .sync_from_server()
        .catch((caught) =>
          ignore_error("contexts/auth/use_auth_account_state:init", caught),
        );
      load_preferred_sender_from_server().catch((caught) =>
        ignore_error("contexts/auth/use_auth_account_state:init", caught),
      );
      sync_client.connect().catch((e) => {
        safe_log_error(e);
      });

      start_session_timeout(user.id);

      const loaded_accounts = await with_timeout(get_all_accounts(), 3000);

      set_state((prev) => {
        const known = loaded_accounts ?? prev.accounts;
        const accounts = known.some((a) => a.id === user.id)
          ? known
          : [...known, { id: user.id, user, added_at: Date.now() }];

        return {
          user,
          is_loading: false,
          is_authenticated: true,
          has_keys: true,
          accounts,
          current_account_id: user.id,
        };
      });
      set_is_adding_account(false);

      backfill_user_profile(user);

      sync_shared_mailbox_grants()
        .then(async () => {
          const refreshed = await get_all_accounts();

          set_state((prev) =>
            prev.current_account_id === user.id
              ? { ...prev, accounts: refreshed }
              : prev,
          );
        })
        .catch((caught) =>
          ignore_error("contexts/auth/use_auth_account_state:accounts", caught),
        );
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
      await store_vault_in_memory(vault, passphrase, user.id);
      api_client.set_expected_user_id(user.id);

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
      } catch (caught) {
        ignore_error("contexts/auth/use_auth_account_state:init", caught);
      }

      if (encrypted_vault && vault_nonce) {
        store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
      }

      const result = await storage_add_account(user);

      if (!result.success) {
        clear_vault_from_memory();
        set_is_adding_account(false);

        return result;
      }

      const link_result = await link_account_device();

      if (link_result.error) {
        await storage_remove_account(user.id);
        clear_vault_from_memory();
        set_is_adding_account(false);

        return {
          success: false,
          error:
            link_result.code === "FORBIDDEN"
              ? t("auth.account_limit_for_plan", {
                  max: link_result.data?.max_accounts ?? 0,
                })
              : link_result.error,
        };
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
        check_and_run_recovery_reencryption(vault, passphrase).catch((caught) =>
          ignore_error("contexts/auth/use_auth_account_state:accounts", caught),
        );
        ensure_ratchet_keys().catch((caught) =>
          ignore_error("contexts/auth/use_auth_account_state:accounts", caught),
        );
        ensure_default_labels(vault, t).catch(console.error);
        prime_server_recovery_email(vault).catch((caught) =>
          ignore_error("contexts/auth/use_auth_account_state:accounts", caught),
        );
        connection_store
          .sync_from_server()
          .catch((caught) =>
            ignore_error(
              "contexts/auth/use_auth_account_state:accounts",
              caught,
            ),
          );
        load_preferred_sender_from_server().catch((caught) =>
          ignore_error("contexts/auth/use_auth_account_state:accounts", caught),
        );
        sync_client.connect().catch((e) => {
          safe_log_error(e);
        });
        start_session_timeout(user.id);

        const loaded_accounts = await with_timeout(get_all_accounts(), 3000);

        set_state((prev) => {
          const known = loaded_accounts ?? prev.accounts;
          const accounts = known.some((a) => a.id === user.id)
            ? known
            : [...known, { id: user.id, user, added_at: Date.now() }];

          return {
            user,
            is_loading: false,
            is_authenticated: true,
            has_keys: true,
            accounts,
            current_account_id: user.id,
          };
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
          await unlink_account_device();
        } catch (e) {
          safe_log_error(e);
        }
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
      } else {
        const target = state.accounts.find((a) => a.id === account_id);
        const target_user_id = target?.user.id ?? account_id;

        try {
          await unlink_account_device(target_user_id);
        } catch (e) {
          safe_log_error(e);
        }
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
    [state.current_account_id, state.accounts, set_is_adding_account, navigate],
  );

  return {
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
  };
}
