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

import { useState, useEffect, useMemo, useCallback } from "react";

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

import { api_client } from "@/services/api/client";
import { verify_auth_status } from "@/services/api/auth";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  clear_vault_from_memory,
  has_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import {
  type User,
  initialize_accounts,
  get_all_accounts,
  get_current_account,
  add_account as storage_add_account,
  switch_account as storage_switch_account,
  remove_account as storage_remove_account,
  update_account_user,
  store_switch_token,
  get_switch_token,
  clear_switch_token,
} from "@/services/account_manager";
import {
  request_switch_token,
  switch_account_with_token,
  revoke_switch_token,
  get_account_limit,
} from "@/services/api/switch";
import { sync_client } from "@/services/sync_client";
import {
  start_session_timeout,
  stop_session_timeout,
  clear_session_timeout_data,
} from "@/services/session_timeout_service";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { clear_preload_cache } from "@/components/email/hooks/use_email_detail";
import { ensure_email_recovery_backup } from "@/services/api/recovery_email";
import { emit_auth_ready } from "@/hooks/mail_events";
import { connection_store } from "@/services/routing/connection_store";
import { load_preferred_sender_from_server } from "@/lib/preferred_sender";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

function safe_log_error(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const payload = err instanceof Error ? { name: err.name } : { kind: typeof err };

  console.error("auth error", JSON.stringify(payload));
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = use_i18n();
  const [state, set_state] = useState<AuthState>({
    user: null,
    is_loading: true,
    is_authenticated: false,
    has_keys: false,
    accounts: [],
    current_account_id: null,
  });

  const [is_adding_account, set_is_adding_account] = useState(false);
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

        const is_auth_valid = await verify_auth_status();

        if (is_auth_valid) {
          api_client.set_authenticated(true);
          connection_store.sync_from_server().catch(() => {});
          load_preferred_sender_from_server().catch(() => {});
          sync_client.connect().catch((e) => {
            safe_log_error(e);
          });

          let has_keys = has_vault_in_memory();

          if (!has_keys) {
            const stored_passphrase = await get_session_passphrase(current.id);
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

            return;
          }

          start_session_timeout(current.id);

          const current_vault = get_vault_from_memory();

          if (current_vault) {
            ensure_email_recovery_backup(current_vault);
          }

          let synced_user = current.user;
          const cached_info = api_client.get_cached_user_info();

          if (cached_info) {
            synced_user = {
              id: cached_info.user_id,
              username: cached_info.username ?? current.user.username,
              email: cached_info.email ?? current.user.email,
              display_name: cached_info.display_name || undefined,
              profile_color: cached_info.profile_color || undefined,
              profile_picture: cached_info.profile_picture || undefined,
            };
            await update_account_user(current.id, synced_user);
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
        } else {
          api_client.clear_auth_data();
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

      if (encrypted_vault && vault_nonce) {
        store_encrypted_vault(user.id, encrypted_vault, vault_nonce);
      }

      await storage_add_account(user);

      api_client.set_authenticated(true);
      connection_store.sync_from_server().catch(() => {});
      load_preferred_sender_from_server().catch(() => {});
      sync_client.connect().catch((e) => {
        safe_log_error(e);
      });

      ensure_email_recovery_backup(vault);

      start_session_timeout(user.id);

      const accounts = await get_all_accounts();

      set_state({
        user,
        is_loading: false,
        is_authenticated: true,
        has_keys: true,
        accounts,
        current_account_id: user.id,
      });
      set_is_adding_account(false);
    },
    [],
  );

  const add_account = useCallback(
    async (
      user: User,
      vault: EncryptedVault,
      passphrase: string,
      encrypted_vault?: string,
      vault_nonce?: string,
      switch_token?: string,
      switch_token_expires_at?: string,
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

      if (result.success) {
        if (switch_token && switch_token_expires_at) {
          await store_switch_token(
            user.id,
            switch_token,
            switch_token_expires_at,
          );
        }
        api_client.set_authenticated(true);
        start_session_timeout(user.id);
        window.location.href = "/";
      }

      return result;
    },
    [],
  );

  const switch_account_handler = useCallback(
    async (account_id: string) => {
      const old_account_id = state.current_account_id;

      stop_session_timeout();
      sync_client.disconnect();

      if (old_account_id && !(await get_switch_token(old_account_id))) {
        try {
          const token_response = await request_switch_token();

          if (token_response.data) {
            await store_switch_token(
              old_account_id,
              token_response.data.switch_token,
              token_response.data.expires_at,
            );
          }
        } catch (e) {
          safe_log_error(e);
        }
      }

      const target_token = await get_switch_token(account_id);

      if (!target_token) {
        sync_client.connect().catch((e) => {
          safe_log_error(e);
        });
        if (old_account_id) start_session_timeout(old_account_id);

        return false;
      }

      try {
        const response = await switch_account_with_token(target_token);

        if (!response.data) {
          await clear_switch_token(account_id);
          sync_client.connect().catch((e) => {
            safe_log_error(e);
          });
          if (old_account_id) start_session_timeout(old_account_id);

          return false;
        }

        await store_switch_token(
          account_id,
          response.data.switch_token,
          response.data.switch_token_expires_at,
        );

        store_encrypted_vault(
          account_id,
          response.data.encrypted_vault,
          response.data.vault_nonce,
        );

        await update_account_user(account_id, {
          id: response.data.user_id,
          username: response.data.username,
          email: response.data.email,
          display_name: response.data.display_name || undefined,
          profile_color: response.data.profile_color || undefined,
        });

        await storage_switch_account(account_id);

        clear_mail_cache();
        clear_mail_stats();
        clear_preload_cache();
        window.location.href = "/";

        return true;
      } catch {
        clear_switch_token(account_id);
        sync_client.connect().catch((e) => {
          safe_log_error(e);
        });
        if (old_account_id) start_session_timeout(old_account_id);

        return false;
      }
    },
    [state.current_account_id],
  );

  const remove_account_handler = useCallback(
    async (account_id: string) => {
      const is_current = account_id === state.current_account_id;

      if (is_current) {
        sync_client.disconnect();
        try {
          await revoke_switch_token();
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
      }

      const result = await storage_remove_account(account_id);

      if (result.removed) {
        stop_session_timeout();
        clear_vault_from_memory();
        clear_mail_stats();
        clear_mail_cache();
        clear_stored_encrypted_vault(account_id);
        await clear_session_passphrase(account_id);
        clear_session_timeout_data(account_id);
        await clear_switch_token(account_id);

        const switched_account = result.switched_to;

        if (switched_account) {
          const target_token = await get_switch_token(switched_account.id);

          if (target_token) {
            try {
              const response = await switch_account_with_token(target_token);

              if (response.data) {
                await store_switch_token(
                  switched_account.id,
                  response.data.switch_token,
                  response.data.switch_token_expires_at,
                );

                store_encrypted_vault(
                  switched_account.id,
                  response.data.encrypted_vault,
                  response.data.vault_nonce,
                );

                await update_account_user(switched_account.id, {
                  id: response.data.user_id,
                  username: response.data.username,
                  email: response.data.email,
                  display_name: response.data.display_name || undefined,
                  profile_color: response.data.profile_color || undefined,
                });

                await storage_switch_account(switched_account.id);

                window.location.reload();

                return;
              }
            } catch {
              clear_switch_token(switched_account.id);
            }
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
        } else {
          api_client.set_authenticated(false);
          set_state({
            user: null,
            is_loading: false,
            is_authenticated: false,
            has_keys: false,
            accounts: [],
            current_account_id: null,
          });
        }
      }
    },
    [state.current_account_id],
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

  const logout = useCallback(async () => {
    api_client.begin_intentional_logout();
    sync_client.disconnect();

    try {
      await api_client.post("/core/v1/auth/logout", {});
    } catch (e) {
      safe_log_error(e);
    }

    await clear_local_auth_data();
    window.location.replace("/sign-in");
  }, [clear_local_auth_data]);

  const logout_all_handler = useCallback(async () => {
    api_client.begin_intentional_logout();
    sync_client.disconnect();

    try {
      await api_client.post("/core/v1/auth/logout-all", {});
    } catch (e) {
      safe_log_error(e);
    }

    await clear_local_auth_data();
    window.location.replace("/sign-in");
  }, [clear_local_auth_data]);

  useEffect(() => {
    const handle_session_expired = async () => {
      sync_client.disconnect();
      api_client.clear_auth_data();
      api_client.set_authenticated(false);
      await clear_local_auth_data();
      show_toast(t("common.session_expired_sign_in"), "info");
      window.location.replace("/sign-in");
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
      window.location.replace("/sign-in");
    };

    const handle_session_revoked = async () => {
      await clear_local_auth_data();
      show_toast(t("common.device_revoked"), "info");
      window.location.replace("/sign-in");
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
  }, [clear_local_auth_data, t]);

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

      set_state((prev) => ({ ...prev, has_keys: true }));
    },
    [state.current_account_id],
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
      switch_account: switch_account_handler,
      remove_account: remove_account_handler,
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
      switch_account_handler,
      remove_account_handler,
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
