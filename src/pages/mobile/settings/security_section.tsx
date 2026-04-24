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
import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Switch } from "@aster/ui";
import {
  DevicePhoneMobileIcon,
  BellIcon,
  LinkIcon,
  KeyIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  chip_selected_style,
  type SettingsSection,
} from "./shared";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { api_client } from "@/services/api/client";
import {
  derive_password_hash,
  hash_email,
  encrypt_vault,
  decrypt_vault,
} from "@/services/crypto/key_manager";
import { store_vault_in_memory } from "@/services/crypto/memory_key_store";
import { get_totp_status, type TotpStatusResponse } from "@/services/api/totp";
import {
  get_login_alerts_status,
  set_login_alerts,
  change_password,
  get_user_salt,
} from "@/services/api/auth";
import { TotpSetupModal } from "@/components/settings/totp_setup_modal";
import { TotpDisableModal } from "@/components/settings/totp_disable_modal";
import { check_password_breach } from "@/services/breach_check";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

export function SecuritySection({
  on_back,
  on_close,
  on_navigate_section,
}: {
  on_back: () => void;
  on_close: () => void;
  on_navigate_section?: (s: SettingsSection) => void;
}) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences, update_preference } = use_preferences();
  const { is_feature_locked } = use_plan_limits();

  const [totp_status, set_totp_status] = useState<TotpStatusResponse | null>(
    null,
  );
  const [show_totp_setup, set_show_totp_setup] = useState(false);
  const [show_totp_disable, set_show_totp_disable] = useState(false);
  const [login_alerts_enabled, set_login_alerts_enabled] = useState(false);
  const [login_alerts_loading, set_login_alerts_loading] = useState(false);
  const [show_password_change, set_show_password_change] = useState(false);
  const [current_password, set_current_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [show_current_pw, set_show_current_pw] = useState(false);
  const [show_new_pw, set_show_new_pw] = useState(false);
  const [pw_loading, set_pw_loading] = useState(false);
  const [pw_error, set_pw_error] = useState("");
  const [pw_success, set_pw_success] = useState(false);
  const [pw_breach_warning, set_pw_breach_warning] = useState(false);
  const [logout_others_loading, set_logout_others_loading] = useState(false);
  const [logout_others_result, set_logout_others_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const fetch_status = async () => {
      try {
        const res = await get_totp_status();

        if (res.data) set_totp_status(res.data);
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("failed to fetch TOTP status", err);
      }
    };
    const fetch_alerts = async () => {
      try {
        const res = await get_login_alerts_status();

        if (res.data) set_login_alerts_enabled(res.data.enabled);
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("failed to fetch login alerts status", err);
      }
    };

    fetch_status();
    fetch_alerts();
  }, []);

  const handle_two_factor_toggle = useCallback(() => {
    if (totp_status?.enabled) {
      set_show_totp_disable(true);
    } else {
      set_show_totp_setup(true);
    }
  }, [totp_status]);

  const handle_totp_setup_success = useCallback(() => {
    set_totp_status((prev) => ({
      enabled: true,
      backup_codes_remaining: prev?.backup_codes_remaining ?? 8,
    }));
  }, []);

  const handle_totp_disable_success = useCallback(() => {
    set_totp_status((prev) => (prev ? { ...prev, enabled: false } : null));
  }, []);

  const handle_login_alerts_toggle = useCallback(async () => {
    if (login_alerts_loading) return;
    set_login_alerts_loading(true);
    const new_value = !login_alerts_enabled;

    set_login_alerts_enabled(new_value);
    try {
      const res = await set_login_alerts(new_value);

      if (res.error || !res.data?.success) set_login_alerts_enabled(!new_value);
    } catch {
      set_login_alerts_enabled(!new_value);
    } finally {
      set_login_alerts_loading(false);
    }
  }, [login_alerts_enabled, login_alerts_loading]);

  const handle_change_password = useCallback(async () => {
    set_pw_error("");
    set_pw_success(false);
    if (!user?.email) {
      set_pw_error(t("settings.user_not_found"));

      return;
    }
    if (new_password !== confirm_password) {
      set_pw_error(t("settings.passwords_do_not_match"));

      return;
    }
    if (new_password.length < 8) {
      set_pw_error(t("settings.password_min_length"));

      return;
    }
    if (new_password.length > 128) {
      set_pw_error(t("settings.password_max_length"));

      return;
    }
    set_pw_loading(true);
    try {
      const user_hash = await hash_email(user.email);
      const salt_res = await get_user_salt({ user_hash });

      if (salt_res.error || !salt_res.data) {
        set_pw_error(salt_res.error || t("settings.failed_get_auth_data"));
        set_pw_loading(false);

        return;
      }
      const salt = base64_to_array(salt_res.data.salt);
      const { hash: current_pw_hash } = await derive_password_hash(
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
          set_pw_error(t("settings.session_expired_sign_in"));
          set_pw_loading(false);

          return;
        }
        vault = await decrypt_vault(
          stored_vault,
          stored_nonce,
          current_password,
        );
      } catch {
        set_pw_error(t("settings.current_password_incorrect"));
        set_pw_loading(false);

        return;
      }
      const new_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_pw_hash, salt: new_pw_salt } =
        await derive_password_hash(new_password, new_salt);
      const { encrypted_vault: new_enc_vault, vault_nonce: new_v_nonce } =
        await encrypt_vault(vault, new_password);
      const res = await change_password({
        current_password_hash: current_pw_hash,
        new_password_hash: new_pw_hash,
        new_password_salt: new_pw_salt,
        new_encrypted_vault: new_enc_vault,
        new_vault_nonce: new_v_nonce,
      });

      if (res.error) {
        set_pw_error(res.error);
        set_pw_loading(false);

        return;
      }

      try {
        localStorage.setItem(
          `astermail_encrypted_vault_${user.id}`,
          new_enc_vault,
        );
        localStorage.setItem(
          `astermail_vault_nonce_${user.id}`,
          new_v_nonce,
        );
      } catch {}

      await store_vault_in_memory(vault, new_password);

      if (res.data?.csrf_token) {
        api_client.set_csrf(res.data.csrf_token);
      }
      if (res.data?.access_token) {
        api_client.set_dev_token(res.data.access_token);
      }

      set_pw_success(true);
      set_show_password_change(false);
      set_current_password("");
      set_new_password("");
      set_confirm_password("");
    } catch (err) {
      set_pw_error(
        err instanceof Error
          ? err.message
          : t("settings.failed_change_password"),
      );
    } finally {
      set_pw_loading(false);
    }
  }, [user, current_password, new_password, confirm_password, t]);

  const handle_logout_others = useCallback(async () => {
    set_logout_others_loading(true);
    set_logout_others_result(null);
    try {
      const res = await api_client.post<{
        message: string;
        sessions_revoked: number;
      }>("/core/v1/auth/logout-others", {});

      if (res.error) {
        set_logout_others_result({
          success: false,
          message: res.error || t("settings.failed_sign_out"),
        });
      } else if (res.data) {
        set_logout_others_result({ success: true, message: res.data.message });
      }
    } catch {
      set_logout_others_result({
        success: false,
        message: t("settings.failed_sign_out"),
      });
    } finally {
      set_logout_others_loading(false);
      setTimeout(() => set_logout_others_result(null), 5000);
    }
  }, [t]);

  const timeout_options: { value: number; label: string }[] = [
    { value: 5, label: t("settings.five_minutes") },
    { value: 15, label: t("settings.fifteen_minutes") },
    { value: 30, label: t("settings.thirty_minutes") },
    { value: 60, label: t("settings.one_hour") },
    { value: 120, label: t("settings.two_hours") },
    { value: 240, label: t("settings.four_hours") },
    { value: 480, label: t("settings.eight_hours") },
  ];

  const rotation_options: { value: number; label: string }[] = [
    { value: 24, label: t("settings.daily") },
    { value: 168, label: t("settings.weekly") },
    { value: 336, label: t("settings.biweekly") },
    { value: 720, label: t("settings.monthly") },
  ];

  const key_history_options: { value: number; label: string }[] = [
    { value: 5, label: t("settings.five_keys") },
    { value: 10, label: t("settings.ten_keys") },
    { value: 25, label: t("settings.twenty_five_keys") },
    { value: 0, label: t("settings.unlimited") },
  ];

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.security")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <SettingsGroup title={t("settings.two_factor_auth")}>
          <SettingsRow
            icon={<DevicePhoneMobileIcon className="h-4 w-4" />}
            label={t("settings.two_factor_auth")}
            trailing={
              <Switch
                checked={totp_status?.enabled ?? false}
                onCheckedChange={handle_two_factor_toggle}
              />
            }
          />
          {totp_status?.enabled &&
            totp_status.backup_codes_remaining !== undefined && (
              <div className="px-4 pb-3">
                <p className="text-[12px] text-[var(--text-muted)]">
                  {t("settings.two_fa_enabled").replace(
                    "{{count}}",
                    String(totp_status.backup_codes_remaining),
                  )}
                </p>
              </div>
            )}
        </SettingsGroup>

        <SettingsGroup title={t("settings.login_alerts")}>
          <SettingsRow
            icon={<BellIcon className="h-4 w-4" />}
            label={t("settings.login_alerts")}
            trailing={
              <Switch
                checked={login_alerts_enabled}
                onCheckedChange={handle_login_alerts_toggle}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.external_link_warnings")}>
          <SettingsRow
            icon={<LinkIcon className="h-4 w-4" />}
            label={t("settings.external_link_warnings")}
            trailing={
              <Switch
                checked={!preferences.external_link_warning_dismissed}
                onCheckedChange={() =>
                  update_preference(
                    "external_link_warning_dismissed",
                    !preferences.external_link_warning_dismissed,
                    true,
                  )
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("common.app_lock")}>
          <SettingsRow
            label={t("common.app_lock")}
            trailing={
              <Switch
                checked={preferences.biometric_app_lock_enabled}
                onCheckedChange={(v) =>
                  update_preference("biometric_app_lock_enabled", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("common.secure_send")}
            trailing={
              <Switch
                checked={preferences.biometric_send_enabled}
                onCheckedChange={(v) =>
                  update_preference("biometric_send_enabled", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.forward_secrecy")}>
          <SettingsRow
            label={t("settings.forward_secrecy")}
            trailing={
              <Switch
                checked={preferences.forward_secrecy_enabled}
                onCheckedChange={(v) =>
                  update_preference("forward_secrecy_enabled", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.session_timeout")}>
          <SettingsRow
            label={t("settings.session_timeout")}
            trailing={
              <Switch
                checked={preferences.session_timeout_enabled}
                onCheckedChange={(v) =>
                  update_preference("session_timeout_enabled", v, true)
                }
              />
            }
          />
          {preferences.session_timeout_enabled && (
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-2">
                {timeout_options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                      preferences.session_timeout_minutes === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={
                      preferences.session_timeout_minutes === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      update_preference("session_timeout_minutes", opt.value, true)
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </SettingsGroup>

        <UpgradeGate
          description={t("settings.key_rotation_locked")}
          feature_name={t("settings.key_rotation_interval")}
          is_locked={is_feature_locked("has_custom_key_rotation")}
          min_plan="Nova"
        >
          <SettingsGroup title={t("settings.current_key_status")}>
            <div className="px-4 py-3">
              <p className="mb-2 text-[13px] text-[var(--text-muted)]">
                {t("settings.key_rotation_interval")}
              </p>
              <div className="flex flex-wrap gap-2">
                {rotation_options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                      preferences.key_rotation_hours === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={
                      preferences.key_rotation_hours === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      update_preference("key_rotation_hours", opt.value, true)
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="mb-2 text-[13px] text-[var(--text-muted)]">
                {t("settings.key_history_limit")}
              </p>
              <div className="flex flex-wrap gap-2">
                {key_history_options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                      preferences.key_history_limit === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={
                      preferences.key_history_limit === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      update_preference("key_history_limit", opt.value, true)
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </SettingsGroup>
        </UpgradeGate>

        <SettingsGroup title={t("settings.encryption")}>
          <SettingsRow
            icon={<KeyIcon className="h-4 w-4" />}
            label={t("settings.encryption_keys")}
            on_press={() => on_navigate_section?.("encryption")}
          />
          <SettingsRow
            label={t("settings.publish_keys_wkd_title")}
            trailing={
              <Switch
                checked={preferences.publish_to_wkd}
                onCheckedChange={(v) => update_preference("publish_to_wkd", v, true)}
              />
            }
          />
          <SettingsRow
            label={t("settings.publish_to_keyservers_title")}
            trailing={
              <Switch
                checked={preferences.publish_to_keyservers}
                onCheckedChange={(v) =>
                  update_preference("publish_to_keyservers", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.change_password")}>
          {!show_password_change ? (
            <SettingsRow
              icon={<LockClosedIcon className="h-4 w-4" />}
              label={t("settings.change_password")}
              on_press={() => set_show_password_change(true)}
            />
          ) : (
            <div className="space-y-3 px-4 py-3">
              <div className="relative">
                <Input
                  className="w-full"
                  placeholder={t("settings.current_password")}
                  status={pw_error ? "error" : "default"}
                  type={show_current_pw ? "text" : "password"}
                  value={current_password}
                  onChange={(e) => set_current_password(e.target.value)}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  type="button"
                  onClick={() => set_show_current_pw(!show_current_pw)}
                >
                  {show_current_pw ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="relative">
                <Input
                  className="w-full"
                  placeholder={t("settings.new_password")}
                  status={pw_error ? "error" : "default"}
                  type={show_new_pw ? "text" : "password"}
                  value={new_password}
                  onBlur={async () => {
                    if (new_password.length >= 8) {
                      const result = await check_password_breach(new_password);

                      set_pw_breach_warning(result.is_breached);
                    }
                  }}
                  onChange={(e) => {
                    set_new_password(e.target.value);
                    set_pw_breach_warning(false);
                  }}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  type="button"
                  onClick={() => set_show_new_pw(!show_new_pw)}
                >
                  {show_new_pw ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              {pw_breach_warning && (
                <p
                  className="text-sm"
                  style={{ color: "var(--color-warning, #f59e0b)" }}
                >
                  This password has appeared in a data breach. Consider using a
                  different one.
                </p>
              )}
              <Input
                className="w-full"
                placeholder={t("settings.confirm_new_password")}
                status={pw_error ? "error" : "default"}
                type="password"
                value={confirm_password}
                onChange={(e) => set_confirm_password(e.target.value)}
              />
              {pw_error && (
                <p className="text-[13px] text-[var(--color-danger,#ef4444)]">
                  {pw_error}
                </p>
              )}
              {pw_success && (
                <p className="text-[13px] text-green-500">
                  {t("settings.password_changed_signing_out")}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-xl bg-[var(--bg-tertiary)] py-3 text-[15px] font-medium text-[var(--text-primary)]"
                  type="button"
                  onClick={() => {
                    set_show_password_change(false);
                    set_current_password("");
                    set_new_password("");
                    set_confirm_password("");
                    set_pw_error("");
                    set_pw_breach_warning(false);
                  }}
                >
                  {t("common.cancel")}
                </button>
                <motion.button
                  className="flex flex-1 items-center justify-center rounded-xl py-3 text-[15px] font-semibold text-white disabled:opacity-50"
                  disabled={
                    !current_password ||
                    !new_password ||
                    !confirm_password ||
                    pw_loading
                  }
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  }}
                  type="button"
                  onClick={handle_change_password}
                >
                  {pw_loading ? (
                    <Spinner size="md" />
                  ) : (
                    t("settings.change_password")
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("settings.session_security")}>
          <div className="px-4 py-3">
            <motion.button
              className="flex w-full items-center justify-center rounded-xl py-3 text-[15px] font-medium text-[var(--color-danger,#ef4444)] disabled:opacity-50"
              disabled={logout_others_loading}
              style={{ border: "1px solid var(--border-primary)" }}
              type="button"
              onClick={handle_logout_others}
            >
              {logout_others_loading ? (
                <Spinner size="md" />
              ) : (
                t("settings.sign_out_everywhere")
              )}
            </motion.button>
            {logout_others_result && (
              <p
                className={`mt-2 text-center text-[13px] ${logout_others_result.success ? "text-green-500" : "text-[var(--color-danger,#ef4444)]"}`}
              >
                {logout_others_result.message}
              </p>
            )}
          </div>
        </SettingsGroup>
      </div>

      <TotpSetupModal
        is_open={show_totp_setup}
        on_close={() => set_show_totp_setup(false)}
        on_success={handle_totp_setup_success}
      />
      <TotpDisableModal
        is_open={show_totp_disable}
        on_close={() => set_show_totp_disable(false)}
        on_success={handle_totp_disable_success}
      />
    </div>
  );
}
