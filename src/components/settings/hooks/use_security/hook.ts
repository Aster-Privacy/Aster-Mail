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
import type { TotpStatusResponse } from "@/services/api/totp";

import { useState, useEffect, useRef } from "react";

import { LogoutOthersResponse, SESSION_TIMEOUT_OPTIONS } from "./options";
import { use_security_fetchers } from "./fetchers";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import { use_settings_cache } from "@/contexts/settings_cache_context";
import { set_login_alerts, type LoginEventEntry } from "@/services/api/auth";
import { api_client } from "@/services/api/client";
import {
  list_sessions,
  revoke_session,
  revoke_all_sessions,
  type Session,
} from "@/services/api/sessions";
import { type SecurityStatusResponse } from "@/services/api/account";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  ensure_ratchet_keys,
  publish_vaulted_prekey_bundle,
  sync_vault_with_server,
} from "@/services/crypto/ensure_ratchet_keys";
import { use_key_rotation } from "@/hooks/use_key_rotation";
import { check_password_breach } from "@/services/breach_check";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { held_of } from "@/services/guard/held_outcome";
import {
  append_password_notice,
  password_change_failure_message,
  run_password_change,
} from "./run_password_change";

export function use_security() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const { user } = use_auth();
  const cache = use_settings_cache();
  const {
    key_age_hours,
    key_fingerprint,
    removed_key_count: rotation_removed_key_count,
    perform_rotation,
    show_manual_rotation_modal,
    show_modal: show_rotation_modal,
    close_modal: close_rotation_modal,
  } = use_key_rotation({ auto_check: true });

  const [totp_status, set_totp_status] = useState<TotpStatusResponse | null>(
    null,
  );
  const [totp_status_failed, set_totp_status_failed] = useState(false);
  const [security_score_loaded, set_security_score_loaded] = useState(false);
  const [forward_secrecy_working, set_forward_secrecy_working] =
    useState(false);
  const forward_secrecy_working_ref = useRef(false);
  const [show_totp_setup_modal, set_show_totp_setup_modal] = useState(false);
  const [show_totp_disable_modal, set_show_totp_disable_modal] =
    useState(false);
  const [login_alerts_enabled, set_login_alerts_enabled] = useState(false);
  const [login_alerts_loaded, set_login_alerts_loaded] = useState(false);
  const [login_alerts_failed, set_login_alerts_failed] = useState(false);
  const [login_alerts_loading, set_login_alerts_loading] = useState(false);
  const [login_events, set_login_events] = useState<LoginEventEntry[]>([]);
  const [login_events_loading, set_login_events_loading] = useState(true);
  const [login_events_failed, set_login_events_failed] = useState(false);
  const [show_password_section, set_show_password_section] = useState(false);
  const [current_password, set_current_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [show_current_password, set_show_current_password] = useState(false);
  const [show_new_password, set_show_new_password] = useState(false);
  const [password_loading, set_password_loading] = useState(false);
  const [password_error, set_password_error] = useState("");
  const [password_success, set_password_success] = useState(false);
  const [password_unreadable_notice, set_password_unreadable_notice] =
    useState("");
  const [password_breach_warning, set_password_breach_warning] =
    useState(false);
  const [logout_others_loading, set_logout_others_loading] = useState(false);
  const [logout_others_result, set_logout_others_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [ipfs_available, set_ipfs_available] = useState(false);
  const [ipfs_storage_enabled, set_ipfs_storage_enabled] = useState(false);
  const [ipfs_status_loaded, set_ipfs_status_loaded] = useState(false);
  const [ipfs_loading, set_ipfs_loading] = useState(false);
  const [sessions, set_sessions] = useState<Session[]>([]);
  const [sessions_loading, set_sessions_loading] = useState(true);
  const [sessions_error, set_sessions_error] = useState<string | null>(null);
  const [recovery_email_verified, set_recovery_email_verified] =
    useState(false);
  const [security_status, set_security_status] =
    useState<SecurityStatusResponse | null>(null);

  const {
    fetch_totp_status,
    fetch_login_events,
    fetch_ipfs_status,
    fetch_security_status,
    hydrate_security_status,
    hydrate_totp_status,
    hydrate_login_alerts_status,
    fetch_login_alerts_status,
    hydrate_recovery_email_status,
    fetch_sessions,
  } = use_security_fetchers({
    t,
    cache,
    set_totp_status,
    set_totp_status_failed,
    set_login_alerts_enabled,
    set_login_alerts_loaded,
    set_login_alerts_failed,
    set_login_events,
    set_login_events_loading,
    set_login_events_failed,
    set_ipfs_available,
    set_ipfs_storage_enabled,
    set_ipfs_status_loaded,
    set_sessions,
    set_sessions_loading,
    set_sessions_error,
    set_recovery_email_verified,
    set_security_status,
  });

  useEffect(() => {
    Promise.all([
      hydrate_totp_status(),
      hydrate_login_alerts_status(),
      hydrate_recovery_email_status(),
      hydrate_security_status(),
    ]).then(() => set_security_score_loaded(true));
    fetch_ipfs_status();
    fetch_sessions();
    fetch_login_events();
  }, [
    hydrate_totp_status,
    hydrate_login_alerts_status,
    hydrate_recovery_email_status,
    hydrate_security_status,
    fetch_ipfs_status,
    fetch_sessions,
    fetch_login_events,
  ]);

  const handle_login_alerts_toggle = async () => {
    if (login_alerts_loading) return;
    if (!login_alerts_loaded) return;

    set_login_alerts_loading(true);
    const new_value = !login_alerts_enabled;

    set_login_alerts_enabled(new_value);

    try {
      const response = await set_login_alerts(new_value);

      if (response.error || !response.data?.success) {
        set_login_alerts_enabled(!new_value);
        show_toast(response.error || t("common.something_went_wrong"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_login_alerts_enabled(!new_value);
      show_toast(t("common.something_went_wrong"), "error");
    } finally {
      set_login_alerts_loading(false);
    }
  };

  const handle_ipfs_toggle = async () => {
    if (ipfs_loading) return;
    if (!ipfs_status_loaded) return;

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
        show_toast(response.error || t("common.something_went_wrong"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_ipfs_storage_enabled(!new_value);
      show_toast(t("common.something_went_wrong"), "error");
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
    set_password_unreadable_notice("");

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
      const result = await run_password_change({
        user_id: user.id,
        user_email: user.email,
        current_password,
        new_password,
        preferences,
        t,
        on_background_notice: (message) =>
          set_password_unreadable_notice((prev) =>
            append_password_notice(prev, message),
          ),
      });

      if (!result.ok) {
        if (result.held) {
          set_show_password_section(false);
          set_current_password("");
          set_new_password("");
          set_confirm_password("");

          return;
        }

        set_password_error(result.error);

        return;
      }

      set_security_status((prev) => ({
        two_factor_enabled: prev?.two_factor_enabled ?? false,
        recovery_email_set: prev?.recovery_email_set ?? false,
        last_password_change: new Date().toISOString(),
        password_strength_tier: result.password_strength_tier,
      }));
      fetch_security_status();

      set_password_success(true);
      show_toast(t("settings.password_changed_success"), "success");
      set_show_password_section(false);
      set_current_password("");
      set_new_password("");
      set_confirm_password("");
    } catch (err) {
      set_password_error(password_change_failure_message(err, t));
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

  const publish_ratchet_keys = async (): Promise<boolean> => {
    if (!get_vault_from_memory()) return false;

    const freshness = await sync_vault_with_server();

    if (freshness.status === "unverified") return false;

    const vault =
      freshness.status === "adopted"
        ? freshness.vault
        : get_vault_from_memory();

    if (!vault) return false;

    if (vault.ratchet_identity_key) {
      return publish_vaulted_prekey_bundle(vault);
    }

    if (!(await ensure_ratchet_keys())) return false;

    const ensured = get_vault_from_memory();

    if (!ensured?.ratchet_identity_key) return false;

    return publish_vaulted_prekey_bundle(ensured);
  };

  const handle_forward_secrecy_toggle = async () => {
    if (forward_secrecy_working_ref.current) return;

    const enabling = !preferences.forward_secrecy_enabled;

    if (!enabling) {
      update_preference("forward_secrecy_enabled", false, true);

      return;
    }

    forward_secrecy_working_ref.current = true;
    set_forward_secrecy_working(true);

    let published = false;

    try {
      published = await publish_ratchet_keys();
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      forward_secrecy_working_ref.current = false;
      set_forward_secrecy_working(false);
    }

    if (!published) {
      show_toast(t("settings.forward_secrecy_setup_failed"), "error");

      return;
    }

    update_preference("forward_secrecy_enabled", true, true);
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
        : t("settings.n_minutes", {
            count: preferences.session_timeout_minutes,
          }),
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
          message: t("settings.sign_out_everywhere_success", {
            count: response.data.sessions_revoked ?? 0,
          }),
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
      const timeout = new Promise<{ error: string }>((resolve) =>
        setTimeout(
          () => resolve({ error: t("settings.failed_sign_out") }),
          10000,
        ),
      );
      const response = await Promise.race([
        revoke_session(session_id),
        timeout,
      ]);

      if (held_of(response)) return;
      if ("data" in response && response.data?.success) {
        set_sessions((prev) => prev.filter((s) => s.id !== session_id));
      } else {
        const err = "error" in response ? response.error : undefined;
        const recheck = await list_sessions();

        if (recheck.data) {
          set_sessions(recheck.data.sessions);
          if (recheck.data.sessions.some((s) => s.id === session_id)) {
            set_sessions_error(err || t("settings.failed_sign_out"));
          }
        } else {
          set_sessions_error(err || t("settings.failed_sign_out"));
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_sessions_error(t("settings.failed_sign_out"));
    }
  };

  const handle_revoke_all_sessions = async () => {
    set_sessions_error(null);

    try {
      const timeout = new Promise<{ error: string }>((resolve) =>
        setTimeout(
          () => resolve({ error: t("settings.failed_sign_out") }),
          10000,
        ),
      );
      const response = await Promise.race([revoke_all_sessions(), timeout]);

      if (held_of(response)) return;
      if ("data" in response && response.data?.success) {
        const revoked_count = sessions.filter((s) => !s.is_current).length;

        set_sessions((prev) => prev.filter((s) => s.is_current));
        show_toast(
          t("settings.sign_out_everywhere_success", {
            count: response.data?.revoked_count ?? revoked_count,
          }),
          "success",
        );
      } else {
        const err = "error" in response ? response.error : undefined;

        set_sessions_error(err || t("settings.failed_sign_out"));
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

  const toggle_password_section = (show: boolean) => {
    if (show) {
      set_password_success(false);
      set_password_error("");
    }
    set_show_password_section(show);
  };

  const handle_password_cancel = () => {
    set_password_success(false);
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

    recovery_email_verified,
    security_score_loaded,
    last_password_change: security_status?.last_password_change ?? null,
    password_strength_tier: security_status?.password_strength_tier ?? null,

    totp_status,
    totp_status_failed,
    fetch_totp_status,
    show_totp_setup_modal,
    set_show_totp_setup_modal,
    show_totp_disable_modal,
    set_show_totp_disable_modal,
    handle_two_factor_toggle,
    handle_totp_disable_success,
    handle_totp_setup_success,

    login_alerts_enabled,
    login_alerts_loaded,
    login_alerts_failed,
    fetch_login_alerts_status,
    handle_login_alerts_toggle,
    login_events,
    login_events_loading,
    login_events_failed,
    fetch_login_events,

    ipfs_available,
    ipfs_storage_enabled,
    ipfs_status_loaded,
    handle_ipfs_toggle,

    show_password_section,
    set_show_password_section: toggle_password_section,
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
    password_unreadable_notice,
    handle_change_password,
    handle_password_cancel,

    handle_timeout_toggle,
    handle_timeout_change,
    get_timeout_description,

    handle_forward_secrecy_toggle,
    forward_secrecy_working,

    key_age_hours,
    key_fingerprint,
    rotation_removed_key_count,
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
