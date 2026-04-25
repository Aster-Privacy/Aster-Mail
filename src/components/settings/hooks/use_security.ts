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
import { useState, useEffect, useCallback } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import { get_totp_status, TotpStatusResponse } from "@/services/api/totp";
import {
  change_password,
  get_login_alerts_status,
  get_user_salt,
  set_login_alerts,
} from "@/services/api/auth";
import { api_client } from "@/services/api/client";
import {
  list_sessions,
  revoke_session,
  revoke_all_sessions,
  type Session,
} from "@/services/api/sessions";
import {
  hash_email,
  derive_password_hash,
  decrypt_vault,
  encrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { reprotect_pgp_key } from "@/services/crypto/key_manager_pgp";
import {
  derive_kek_from_password,
  serialize_kek_for_vault,
  prepend_kek_to_list,
} from "@/services/crypto/legacy_keks";
import {
  get_preferences,
  save_preferences,
  derive_preferences_key_raw,
  derive_dev_mode_key_raw,
  get_dev_mode,
  save_dev_mode,
} from "@/services/api/preferences";
import { reencrypt_all_aliases } from "@/services/api/aliases";
import { reencrypt_all_contacts } from "@/services/api/contacts";
import {
  get_vault_from_memory,
  store_vault_in_memory,
  get_passphrase_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  generate_ratchet_keys,
  upload_prekey_bundle,
} from "@/services/crypto/ratchet_manager";
import { use_key_rotation } from "@/hooks/use_key_rotation";
import { check_password_breach } from "@/services/breach_check";
import { use_i18n } from "@/lib/i18n/context";

export const SESSION_TIMEOUT_OPTIONS = [
  { value: 5, label_key: "settings.five_minutes" as const },
  { value: 15, label_key: "settings.fifteen_minutes" as const },
  { value: 30, label_key: "settings.thirty_minutes" as const },
  { value: 60, label_key: "settings.one_hour" as const },
  { value: 120, label_key: "settings.two_hours" as const },
  { value: 240, label_key: "settings.four_hours" as const },
  { value: 480, label_key: "settings.eight_hours" as const },
];

export const KEY_ROTATION_OPTIONS = [
  { value: 24, label_key: "settings.daily" as const },
  { value: 168, label_key: "settings.weekly" as const },
  { value: 336, label_key: "settings.biweekly" as const },
  { value: 720, label_key: "settings.monthly" as const },
];

export const KEY_HISTORY_OPTIONS = [
  { value: 5, label_key: "settings.five_keys" as const },
  { value: 10, label_key: "settings.ten_keys" as const },
  { value: 25, label_key: "settings.twenty_five_keys" as const },
  { value: 0, label_key: "settings.unlimited" as const },
];

interface LogoutOthersResponse {
  message: string;
  sessions_revoked: number;
}

export function use_security() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const { user } = use_auth();
  const {
    key_age_hours,
    key_fingerprint,
    perform_rotation,
    show_manual_rotation_modal,
    show_modal: show_rotation_modal,
    close_modal: close_rotation_modal,
  } = use_key_rotation();

  const [totp_status, set_totp_status] = useState<TotpStatusResponse | null>(
    null,
  );
  const [show_totp_setup_modal, set_show_totp_setup_modal] = useState(false);
  const [show_totp_disable_modal, set_show_totp_disable_modal] =
    useState(false);
  const [login_alerts_enabled, set_login_alerts_enabled] = useState(false);
  const [login_alerts_loading, set_login_alerts_loading] = useState(false);
  const [show_password_section, set_show_password_section] = useState(false);
  const [current_password, set_current_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [show_current_password, set_show_current_password] = useState(false);
  const [show_new_password, set_show_new_password] = useState(false);
  const [password_loading, set_password_loading] = useState(false);
  const [password_error, set_password_error] = useState("");
  const [password_success, set_password_success] = useState(false);
  const [password_breach_warning, set_password_breach_warning] =
    useState(false);
  const [logout_others_loading, set_logout_others_loading] = useState(false);
  const [logout_others_result, set_logout_others_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [ipfs_available, set_ipfs_available] = useState(false);
  const [ipfs_storage_enabled, set_ipfs_storage_enabled] = useState(false);
  const [ipfs_loading, set_ipfs_loading] = useState(false);
  const [sessions, set_sessions] = useState<Session[]>([]);
  const [sessions_loading, set_sessions_loading] = useState(true);
  const [sessions_error, set_sessions_error] = useState<string | null>(null);

  const fetch_totp_status = useCallback(async () => {
    try {
      const response = await get_totp_status();

      if (response.data) {
        set_totp_status(response.data);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
  }, []);

  const fetch_login_alerts_status = useCallback(async () => {
    try {
      const response = await get_login_alerts_status();

      if (response.data) {
        set_login_alerts_enabled(response.data.enabled);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
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

  useEffect(() => {
    fetch_totp_status();
    fetch_login_alerts_status();
    fetch_ipfs_status();
    fetch_sessions();
  }, [
    fetch_totp_status,
    fetch_login_alerts_status,
    fetch_ipfs_status,
    fetch_sessions,
  ]);

  const handle_login_alerts_toggle = async () => {
    if (login_alerts_loading) return;

    set_login_alerts_loading(true);
    const new_value = !login_alerts_enabled;

    set_login_alerts_enabled(new_value);

    try {
      const response = await set_login_alerts(new_value);

      if (response.error || !response.data?.success) {
        set_login_alerts_enabled(!new_value);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_login_alerts_enabled(!new_value);
    } finally {
      set_login_alerts_loading(false);
    }
  };

  const handle_ipfs_toggle = async () => {
    if (ipfs_loading) return;

    set_ipfs_loading(true);
    const new_value = !ipfs_storage_enabled;

    set_ipfs_storage_enabled(new_value);

    try {
      const response = await api_client.put<{
        success: boolean;
        settings: { ipfs_storage_enabled: boolean };
      }>("/settings/v1/encryption", {
        ipfs_storage_enabled: new_value,
      });

      if (response.error || !response.data?.success) {
        set_ipfs_storage_enabled(!new_value);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_ipfs_storage_enabled(!new_value);
    } finally {
      set_ipfs_loading(false);
    }
  };

  const handle_two_factor_toggle = () => {
    if (totp_status?.enabled) {
      set_show_totp_disable_modal(true);
    } else {
      set_show_totp_setup_modal(true);
    }
  };

  const handle_totp_disable_success = () => {
    set_totp_status((prev) => (prev ? { ...prev, enabled: false } : null));
    fetch_totp_status();
  };

  const handle_totp_setup_success = () => {
    set_totp_status((prev) => ({
      enabled: true,
      backup_codes_remaining: prev?.backup_codes_remaining ?? 8,
    }));
    fetch_totp_status();
  };

  const handle_change_password = async () => {
    set_password_error("");
    set_password_success(false);

    if (!user?.email) {
      set_password_error(t("settings.user_not_found"));

      return;
    }

    if (new_password !== confirm_password) {
      set_password_error(t("settings.passwords_do_not_match"));

      return;
    }

    if (new_password.length < 8) {
      set_password_error(t("settings.password_min_length"));

      return;
    }

    if (new_password.length > 128) {
      set_password_error(t("settings.password_max_length"));

      return;
    }

    set_password_loading(true);

    try {
      const user_hash = await hash_email(user.email);

      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_password_error(
          salt_response.error || t("settings.failed_get_auth_data"),
        );
        set_password_loading(false);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: current_password_hash } = await derive_password_hash(
        current_password,
        salt,
      );

      let vault;

      try {
        const stored_vault = localStorage.getItem(
          `astermail_encrypted_vault_${user.id}`,
        );
        const stored_nonce = localStorage.getItem(
          `astermail_vault_nonce_${user.id}`,
        );

        if (!stored_vault || !stored_nonce) {
          set_password_error(t("settings.session_expired_sign_in"));
          set_password_loading(false);

          return;
        }

        vault = await decrypt_vault(
          stored_vault,
          stored_nonce,
          current_password,
        );
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_password_error(t("settings.current_password_incorrect"));
        set_password_loading(false);

        return;
      }

      const old_identity_key = vault.identity_key;

      const old_prefs_key_raw =
        await derive_preferences_key_raw(old_identity_key);
      const old_dev_mode_key_raw =
        await derive_dev_mode_key_raw(old_identity_key);

      if (!vault.previous_keys) {
        vault.previous_keys = [];
      }
      vault.previous_keys.unshift(vault.identity_key);

      if (vault.previous_keys.length > 10) {
        vault.previous_keys = vault.previous_keys.slice(0, 10);
      }

      vault.identity_key = await reprotect_pgp_key(
        vault.identity_key,
        current_password,
        new_password,
      );

      if (vault.signed_prekey_private) {
        vault.signed_prekey_private = await reprotect_pgp_key(
          vault.signed_prekey_private,
          current_password,
          new_password,
        );
      }

      const new_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_password_hash, salt: new_password_salt } =
        await derive_password_hash(new_password, new_salt);

      const old_kek_raw = await derive_kek_from_password(current_password);

      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_kek_raw),
      );
      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_prefs_key_raw),
      );
      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_dev_mode_key_raw),
      );

      const {
        encrypted_vault: new_encrypted_vault,
        vault_nonce: new_vault_nonce,
      } = await encrypt_vault(vault, new_password);

      const response = await change_password({
        current_password_hash,
        new_password_hash,
        new_password_salt,
        new_encrypted_vault,
        new_vault_nonce,
      });

      if (response.error) {
        set_password_error(response.error);
        set_password_loading(false);

        return;
      }

      try {
        localStorage.setItem(
          `astermail_encrypted_vault_${user.id}`,
          new_encrypted_vault,
        );
        localStorage.setItem(
          `astermail_vault_nonce_${user.id}`,
          new_vault_nonce,
        );
      } catch {}

      await store_vault_in_memory(vault, new_password);

      if (response.data?.csrf_token) {
        api_client.set_csrf(response.data.csrf_token);
      }
      if (response.data?.access_token) {
        api_client.set_dev_token(response.data.access_token);
      }

      try {
        const prefs_result = await get_preferences(vault);

        if (prefs_result.loaded_from_server) {
          await save_preferences(prefs_result.data, vault);
        }
      } catch {}

      try {
        const dev_mode_result = await get_dev_mode(vault);

        if (dev_mode_result.data !== undefined) {
          await save_dev_mode(dev_mode_result.data, vault);
        }
      } catch {}

      reencrypt_all_aliases().catch(() => {});
      reencrypt_all_contacts().catch(() => {});

      set_password_success(true);
      set_show_password_section(false);
      set_current_password("");
      set_new_password("");
      set_confirm_password("");
    } catch (err) {
      set_password_error(
        err instanceof Error
          ? err.message
          : t("settings.failed_change_password"),
      );
    } finally {
      set_password_loading(false);
    }
  };

  const handle_timeout_toggle = () => {
    update_preference(
      "session_timeout_enabled",
      !preferences.session_timeout_enabled,
      true,
    );
  };

  const handle_timeout_change = (minutes: number) => {
    update_preference("session_timeout_minutes", minutes, true);
  };

  const handle_forward_secrecy_toggle = async () => {
    const enabling = !preferences.forward_secrecy_enabled;

    update_preference("forward_secrecy_enabled", enabling, true);

    if (enabling) {
      try {
        const vault = get_vault_from_memory();

        if (!vault || vault.ratchet_identity_key) return;

        const ratchet_keys = await generate_ratchet_keys();

        if (!ratchet_keys) return;

        vault.ratchet_identity_key = ratchet_keys.identity_jwk;
        vault.ratchet_identity_public = ratchet_keys.identity_public;
        vault.ratchet_signed_prekey = ratchet_keys.signed_prekey_jwk;
        vault.ratchet_signed_prekey_public = ratchet_keys.signed_prekey_public;

        const passphrase = get_passphrase_from_memory();

        if (passphrase) {
          await store_vault_in_memory(vault, passphrase);

          const { encrypted_vault, vault_nonce } = await encrypt_vault(
            vault,
            passphrase,
          );

          if (user?.id) {
            localStorage.setItem(
              `astermail_encrypted_vault_${user.id}`,
              encrypted_vault,
            );
            localStorage.setItem(
              `astermail_vault_nonce_${user.id}`,
              vault_nonce,
            );
          }
        }

        await upload_prekey_bundle(vault);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);

        return;
      }
    }
  };

  const get_timeout_description = () => {
    if (!preferences.session_timeout_enabled) {
      return t("settings.session_timeout_disabled");
    }
    const option = SESSION_TIMEOUT_OPTIONS.find(
      (opt) => opt.value === preferences.session_timeout_minutes,
    );

    return t("settings.auto_lock_after").replace(
      "{{duration}}",
      option
        ? t(option.label_key)
        : t("settings.n_minutes", { count: preferences.session_timeout_minutes }),
    );
  };

  const handle_logout_others = async () => {
    set_logout_others_loading(true);
    set_logout_others_result(null);

    try {
      const response = await api_client.post<LogoutOthersResponse>(
        "/core/v1/auth/logout-others",
        {},
      );

      if (response.error) {
        set_logout_others_result({
          success: false,
          message: response.error || t("settings.failed_sign_out"),
        });
      } else if (response.data) {
        set_logout_others_result({
          success: true,
          message: response.data.message,
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_logout_others_result({
        success: false,
        message: t("settings.failed_sign_out"),
      });
    } finally {
      set_logout_others_loading(false);

      setTimeout(() => {
        set_logout_others_result(null);
      }, 5000);
    }
  };

  const handle_revoke_session = async (session_id: string) => {
    set_sessions_error(null);

    try {
      const response = await revoke_session(session_id);

      if (response.data?.success) {
        set_sessions((prev) => prev.filter((s) => s.id !== session_id));
      } else {
        set_sessions_error(response.error || t("settings.failed_sign_out"));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_sessions_error(t("settings.failed_sign_out"));
    }
  };

  const handle_revoke_all_sessions = async () => {
    set_sessions_error(null);

    try {
      const response = await revoke_all_sessions();

      if (response.data?.success) {
        set_sessions((prev) => prev.filter((s) => s.is_current));
      } else {
        set_sessions_error(response.error || t("settings.failed_sign_out"));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_sessions_error(t("settings.failed_sign_out"));
    }
  };

  const handle_new_password_blur = async () => {
    if (new_password.length >= 8) {
      const result = await check_password_breach(new_password);

      set_password_breach_warning(result.is_breached);
    }
  };

  const handle_set_new_password = (val: string) => {
    set_new_password(val);
    set_password_breach_warning(false);
  };

  const handle_password_cancel = () => {
    set_show_password_section(false);
    set_current_password("");
    set_new_password("");
    set_confirm_password("");
    set_password_error("");
    set_password_breach_warning(false);
  };

  return {
    t,
    preferences,
    update_preference,

    totp_status,
    show_totp_setup_modal,
    set_show_totp_setup_modal,
    show_totp_disable_modal,
    set_show_totp_disable_modal,
    handle_two_factor_toggle,
    handle_totp_disable_success,
    handle_totp_setup_success,

    login_alerts_enabled,
    handle_login_alerts_toggle,

    ipfs_available,
    ipfs_storage_enabled,
    handle_ipfs_toggle,

    show_password_section,
    set_show_password_section,
    current_password,
    set_current_password,
    new_password,
    set_new_password: handle_set_new_password,
    password_breach_warning,
    handle_new_password_blur,
    confirm_password,
    set_confirm_password,
    show_current_password,
    set_show_current_password,
    show_new_password,
    set_show_new_password,
    password_loading,
    password_error,
    password_success,
    handle_change_password,
    handle_password_cancel,

    handle_timeout_toggle,
    handle_timeout_change,
    get_timeout_description,

    handle_forward_secrecy_toggle,

    key_age_hours,
    key_fingerprint,
    perform_rotation,
    show_manual_rotation_modal,
    show_rotation_modal,
    close_rotation_modal,

    logout_others_loading,
    logout_others_result,
    handle_logout_others,

    sessions,
    sessions_loading,
    sessions_error,
    fetch_sessions,
    handle_revoke_session,
    handle_revoke_all_sessions,
  };
}
