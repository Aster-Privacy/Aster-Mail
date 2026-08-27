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
import { useNavigate } from "react-router-dom";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  chip_selected_style,
  type SettingsSection,
} from "./shared";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { show_toast } from "@/components/toast/simple_toast";
import { RecoverOlderDataSection } from "@/components/settings/security/recover_older_data_section";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { api_client } from "@/services/api/client";
import {
  derive_password_hash,
  hash_email,
  encrypt_vault,
  decrypt_vault,
} from "@/services/crypto/key_manager";
import {
  store_vault_in_memory,
  get_vault_from_memory,
  is_master_key_vault,
  MASTER_KEY_VAULT_FORMAT,
  get_storage_kdf_version,
} from "@/services/crypto/memory_key_store";
import { upgrade_vault_to_master_key } from "@/services/crypto/vault_master_key_upgrade";
import { reprotect_pgp_key } from "@/services/crypto/key_manager_pgp";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import {
  derive_kek_from_password,
  serialize_kek_for_vault,
  prepend_kek_to_list,
} from "@/services/crypto/legacy_keks";
import {
  derive_preferences_key_raw,
  derive_dev_mode_key_raw,
} from "@/services/api/preferences";
import { re_encrypt_user_data } from "@/services/crypto/password_change_reencrypt";
import { reencrypt_identity_scoped_password_change } from "@/services/crypto/recovery_reencrypt";
import { reencrypt_all_sent_mail } from "@/services/send_queue_encryption";
import { get_totp_status, type TotpStatusResponse } from "@/services/api/totp";
import {
  get_login_alerts_status,
  set_login_alerts,
  change_password,
  get_user_salt,
} from "@/services/api/auth";
import { TotpSetupModal } from "@/components/settings/totp_setup_modal";
import { TotpDisableModal } from "@/components/settings/totp_disable_modal";
import { RegenerateBackupCodesModal } from "@/components/settings/regenerate_backup_codes_modal";
import { DeleteAccountModal } from "@/components/modals/delete_account_modal";
import { check_password_breach } from "@/services/breach_check";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { ignore_error } from "@/lib/ignore_error";

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
  const navigate = useNavigate();
  const [show_delete_modal, set_show_delete_modal] = useState(false);

  const [totp_status, set_totp_status] = useState<TotpStatusResponse | null>(
    null,
  );
  const [show_totp_setup, set_show_totp_setup] = useState(false);
  const [show_totp_disable, set_show_totp_disable] = useState(false);
  const [show_regenerate_codes, set_show_regenerate_codes] = useState(false);
  const [login_alerts_enabled, set_login_alerts_enabled] = useState(false);
  const [login_alerts_loading, set_login_alerts_loading] = useState(false);
  const [login_alerts_loaded, set_login_alerts_loaded] = useState(false);
  const [login_alerts_failed, set_login_alerts_failed] = useState(false);
  const [show_password_change, set_show_password_change] = useState(false);
  const [current_password, set_current_password] = useState("");
  const [new_password, set_new_password] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [show_current_pw, set_show_current_pw] = useState(false);
  const [show_new_pw, set_show_new_pw] = useState(false);
  const [pw_loading, set_pw_loading] = useState(false);
  const [pw_error, set_pw_error] = useState("");
  const [pw_success, set_pw_success] = useState(false);
  const [pw_unreadable_notice, set_pw_unreadable_notice] = useState("");
  const [pw_breach_warning, set_pw_breach_warning] = useState(false);
  const [logout_others_loading, set_logout_others_loading] = useState(false);
  const [logout_others_result, set_logout_others_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fetch_alerts = useCallback(async () => {
    try {
      const res = await get_login_alerts_status();

      if (res.data) {
        set_login_alerts_enabled(res.data.enabled);
        set_login_alerts_loaded(true);
        set_login_alerts_failed(false);
      } else {
        set_login_alerts_failed(true);
      }
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("failed to fetch login alerts status", err);
      set_login_alerts_failed(true);
    }
  }, []);

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

    fetch_status();
    fetch_alerts();
  }, [fetch_alerts]);

  const refetch_totp_status = useCallback(async () => {
    try {
      const res = await get_totp_status();

      if (res.data) set_totp_status(res.data);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("failed to fetch TOTP status", err);
    }
  }, []);

  const handle_two_factor_toggle = useCallback(() => {
    if (!totp_status) {
      show_toast(t("settings.failed_load_security_status"), "error");
      void refetch_totp_status();

      return;
    }
    if (totp_status.enabled) {
      set_show_totp_disable(true);
    } else {
      set_show_totp_setup(true);
    }
  }, [totp_status, refetch_totp_status, t]);

  const handle_totp_setup_success = useCallback(() => {
    set_totp_status((prev) => ({
      enabled: true,
      backup_codes_remaining: prev?.backup_codes_remaining ?? 10,
    }));
    refetch_totp_status();
  }, [refetch_totp_status]);

  const handle_totp_disable_success = useCallback(() => {
    set_totp_status((prev) => (prev ? { ...prev, enabled: false } : null));
    refetch_totp_status();
  }, [refetch_totp_status]);

  const handle_login_alerts_toggle = useCallback(async () => {
    if (login_alerts_loading) return;
    if (!login_alerts_loaded) return;
    set_login_alerts_loading(true);
    const new_value = !login_alerts_enabled;

    set_login_alerts_enabled(new_value);
    try {
      const res = await set_login_alerts(new_value);

      if (res.error || !res.data?.success) {
        set_login_alerts_enabled(!new_value);
        show_toast(res.error || t("common.something_went_wrong"), "error");
      }
    } catch {
      set_login_alerts_enabled(!new_value);
      show_toast(t("common.something_went_wrong"), "error");
    } finally {
      set_login_alerts_loading(false);
    }
  }, [login_alerts_enabled, login_alerts_loaded, login_alerts_loading, t]);

  const handle_change_password = useCallback(async () => {
    set_pw_error("");
    set_pw_success(false);
    set_pw_unreadable_notice("");

    let unreadable_item_count = 0;

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
      const memory_vault = get_vault_from_memory();

      if (!is_master_key_vault(vault)) {
        let healed_from_server = false;

        try {
          const server_vault_response = await api_client.get<{
            encrypted_vault: string;
            vault_nonce: string;
          }>("/core/v1/auth/vault");

          if (
            !server_vault_response.error &&
            server_vault_response.data?.encrypted_vault &&
            server_vault_response.data.vault_nonce
          ) {
            const server_vault = await decrypt_vault(
              server_vault_response.data.encrypted_vault,
              server_vault_response.data.vault_nonce,
              current_password,
            );

            if (is_master_key_vault(server_vault)) {
              vault = server_vault;
              healed_from_server = true;

              try {
                localStorage.setItem(
                  `astermail_encrypted_vault_${user.id}`,
                  server_vault_response.data.encrypted_vault,
                );
                localStorage.setItem(
                  `astermail_vault_nonce_${user.id}`,
                  server_vault_response.data.vault_nonce,
                );
              } catch (caught) {
                ignore_error(
                  "pages/mobile/settings/security_section:fetch_alerts",
                  caught,
                );
              }
            }
          }
        } catch (caught) {
          ignore_error(
            "pages/mobile/settings/security_section:fetch_alerts",
            caught,
          );
        }

        if (!healed_from_server && is_master_key_vault(memory_vault)) {
          vault.data_kek = memory_vault?.data_kek;
          vault.vault_format = memory_vault?.vault_format;
          vault.mk_created_at = memory_vault?.mk_created_at;
          vault.legacy_keks = memory_vault?.legacy_keks
            ? [...memory_vault.legacy_keks]
            : vault.legacy_keks;
        }
      }

      await upgrade_vault_to_master_key(vault, current_password);

      const master_key_mode = is_master_key_vault(vault);
      const old_identity_key = vault.identity_key;

      const old_prefs_key_raw =
        await derive_preferences_key_raw(old_identity_key);
      const old_dev_mode_key_raw =
        await derive_dev_mode_key_raw(old_identity_key);

      const reprotected_identity_key = await reprotect_pgp_key(
        vault.identity_key,
        current_password,
        new_password,
      );

      const reprotected_previous: string[] = [];

      for (const previous_key of vault.previous_keys ?? []) {
        try {
          reprotected_previous.push(
            await reprotect_pgp_key(
              previous_key,
              current_password,
              new_password,
            ),
          );
        } catch {
          reprotected_previous.push(previous_key);
        }
      }
      vault.previous_keys = reprotected_previous;
      vault.previous_keys.unshift(reprotected_identity_key);
      if (vault.previous_keys.length > 10) {
        vault.previous_keys = vault.previous_keys.slice(0, 10);
      }

      vault.identity_key = reprotected_identity_key;

      if (vault.signed_prekey_private) {
        vault.signed_prekey_private = await reprotect_pgp_key(
          vault.signed_prekey_private,
          current_password,
          new_password,
        );
      }

      if (!master_key_mode) {
        const old_kek_raw = await derive_kek_from_password(current_password);

        vault.legacy_keks = prepend_kek_to_list(
          vault.legacy_keks,
          serialize_kek_for_vault(old_kek_raw),
        );
      }

      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_prefs_key_raw),
      );
      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_dev_mode_key_raw),
      );

      const old_folder_material = new TextEncoder().encode(
        old_identity_key + "astermail-labels-v1",
      );
      const old_folder_hash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", old_folder_material),
      );

      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_folder_hash),
      );

      const old_tag_material = new TextEncoder().encode(
        old_identity_key + "astermail-tags-v1",
      );
      const old_tag_hash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", old_tag_material),
      );

      vault.legacy_keks = prepend_kek_to_list(
        vault.legacy_keks,
        serialize_kek_for_vault(old_tag_hash),
      );

      const new_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_pw_hash, salt: new_pw_salt } =
        await derive_password_hash(new_password, new_salt);
      const { encrypted_vault: new_enc_vault, vault_nonce: new_v_nonce } =
        await encrypt_vault(vault, new_password);

      let res;

      if (master_key_mode) {
        res = await change_password({
          current_password_hash: current_pw_hash,
          new_password_hash: new_pw_hash,
          new_password_salt: new_pw_salt,
          new_encrypted_vault: new_enc_vault,
          new_vault_nonce: new_v_nonce,
          vault_format: MASTER_KEY_VAULT_FORMAT,
        });
      } else {
        const {
          re_encrypted_aliases,
          re_encrypted_contacts,
          re_encrypted_pins,
          re_encrypted_alias_contacts,
          re_encrypted_destinations,
          re_encrypted_directories,
          re_encrypted_domain_addresses,
          skipped,
        } = await re_encrypt_user_data(current_password, new_password, {
          data_kek: vault.data_kek,
          legacy_keks: vault.legacy_keks,
          kdf_version: get_storage_kdf_version(vault),
        });

        unreadable_item_count =
          skipped.alias_ids.length +
          skipped.contact_ids.length +
          skipped.domain_address_ids.length +
          skipped.unreadable_field_count;

        res = await change_password({
          current_password_hash: current_pw_hash,
          new_password_hash: new_pw_hash,
          new_password_salt: new_pw_salt,
          new_encrypted_vault: new_enc_vault,
          new_vault_nonce: new_v_nonce,
          re_encrypted_aliases,
          re_encrypted_contacts,
          re_encrypted_pins,
          re_encrypted_alias_contacts,
          re_encrypted_destinations,
          re_encrypted_directories,
          re_encrypted_domain_addresses,
        });
      }

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
        localStorage.setItem(`astermail_vault_nonce_${user.id}`, new_v_nonce);
      } catch (caught) {
        ignore_error(
          "pages/mobile/settings/security_section:fetch_alerts",
          caught,
        );
      }

      reset_vault_refresh_state();
      await store_vault_in_memory(vault, new_password);

      if (res.data?.csrf_token) {
        api_client.set_csrf(res.data.csrf_token);
      }
      if (res.data?.access_token) {
        api_client.set_dev_token(
          res.data.access_token,
          res.data.refresh_token,
        );
      }

      if (master_key_mode) {
        reencrypt_all_sent_mail(current_password, new_password).catch(
          (caught) =>
            ignore_error(
              "pages/mobile/settings/security_section:fetch_alerts",
              caught,
            ),
        );
        reencrypt_identity_scoped_password_change(
          old_identity_key,
          vault.identity_key,
        ).catch((caught) =>
          ignore_error(
            "pages/mobile/settings/security_section:fetch_alerts",
            caught,
          ),
        );
      }

      if (unreadable_item_count > 0) {
        set_pw_unreadable_notice(
          t("settings.password_changed_items_unreadable").replace(
            "{{count}}",
            String(unreadable_item_count),
          ),
        );
      }

      set_pw_success(true);
      show_toast(t("settings.password_changed_success"), "success");
      set_show_password_change(false);
      set_current_password("");
      set_new_password("");
      set_confirm_password("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";

      if (msg.startsWith("alias_reencrypt_failed:")) {
        set_pw_error(t("settings.alias_reencrypt_failed"));
      } else if (msg.startsWith("contact_reencrypt_failed:")) {
        set_pw_error(t("settings.contact_reencrypt_failed"));
      } else {
        set_pw_error(msg || t("settings.failed_change_password"));
      }
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
        set_logout_others_result({
          success: true,
          message: t("settings.sign_out_everywhere_success", {
            count: res.data.sessions_revoked ?? 0,
          }),
        });
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
                  {t("settings.two_fa_enabled", {
                    count: totp_status.backup_codes_remaining,
                  })}
                </p>
              </div>
            )}
          {totp_status?.enabled && (
            <div className="px-4 pb-3">
              <button
                className="text-[13px] font-medium text-[var(--mobile-accent)]"
                type="button"
                onClick={() => set_show_regenerate_codes(true)}
              >
                {t("settings.regenerate_backup_codes")}
              </button>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("settings.login_alerts")}>
          <SettingsRow
            icon={<BellIcon className="h-4 w-4" />}
            label={t("settings.login_alerts")}
            trailing={
              login_alerts_failed && !login_alerts_loaded ? (
                <button
                  className="text-xs font-medium text-accent-primary hover:underline"
                  type="button"
                  onClick={() => void fetch_alerts()}
                >
                  {t("common.retry")}
                </button>
              ) : (
                <Switch
                  checked={login_alerts_enabled}
                  disabled={!login_alerts_loaded}
                  onCheckedChange={handle_login_alerts_toggle}
                />
              )
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

        <SettingsGroup title={t("settings.strip_exif_on_compose_label")}>
          <SettingsRow
            label={t("settings.strip_exif_on_compose_label")}
            trailing={
              <Switch
                checked={preferences.strip_exif_on_compose}
                onCheckedChange={(v) =>
                  update_preference("strip_exif_on_compose", v, true)
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
                    className={`rounded-[12px] px-3 py-1.5 text-[13px] font-medium ${
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
                      update_preference(
                        "session_timeout_minutes",
                        opt.value,
                        true,
                      )
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
                    className={`rounded-[12px] px-3 py-1.5 text-[13px] font-medium ${
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
                    className={`rounded-[12px] px-3 py-1.5 text-[13px] font-medium ${
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
        </SettingsGroup>

        <SettingsGroup title={t("settings.change_password")}>
          {!show_password_change ? (
            <>
              <SettingsRow
                icon={<LockClosedIcon className="h-4 w-4" />}
                label={t("settings.change_password")}
                on_press={() => set_show_password_change(true)}
              />
              {pw_success && (
                <p className="px-4 pb-3 text-[13px] text-green-500">
                  {t("settings.password_changed_success")}
                </p>
              )}
              {pw_unreadable_notice && (
                <p className="px-4 pb-3 text-[13px] text-[var(--color-warning,#f59e0b)]">
                  {pw_unreadable_notice}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3 px-4 py-3">
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  className="w-full"
                  maxLength={128}
                  placeholder={t("settings.current_password")}
                  status={pw_error ? "error" : "default"}
                  type={show_current_pw ? "text" : "password"}
                  value={current_password}
                  onChange={(e) =>
                    set_current_password(clamp_password(e.target.value))
                  }
                />
                <button
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
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
                  autoComplete="new-password"
                  className="w-full"
                  maxLength={128}
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
                    set_new_password(clamp_password(e.target.value));
                    set_pw_breach_warning(false);
                  }}
                />
                <button
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
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
                  {t("settings.password_breach_warning")}
                </p>
              )}
              <Input
                autoComplete="new-password"
                className="w-full"
                maxLength={128}
                placeholder={t("settings.confirm_new_password")}
                status={pw_error ? "error" : "default"}
                type="password"
                value={confirm_password}
                onChange={(e) =>
                  set_confirm_password(clamp_password(e.target.value))
                }
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
                  className="flex-1 rounded-[16px] bg-[var(--bg-tertiary)] py-3 text-[15px] font-medium text-[var(--text-primary)] disabled:opacity-50"
                  disabled={pw_loading}
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
                      "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
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

        <div className="px-4">
          <RecoverOlderDataSection />
        </div>

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

        <SettingsGroup title={t("common.delete_account")}>
          <div className="px-4 py-3">
            <p className="mb-3 text-[13px] text-[var(--text-muted)]">
              {t("common.erase_all_data")}
            </p>
            <motion.button
              className="flex w-full items-center justify-center rounded-xl py-3 text-[15px] font-semibold text-white"
              style={{
                background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
                boxShadow:
                  "0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              type="button"
              onClick={() => set_show_delete_modal(true)}
            >
              {t("common.delete")}
            </motion.button>
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
      <RegenerateBackupCodesModal
        is_open={show_regenerate_codes}
        on_close={() => set_show_regenerate_codes(false)}
        on_success={refetch_totp_status}
      />
      <DeleteAccountModal
        is_open={show_delete_modal}
        on_close={() => set_show_delete_modal(false)}
        on_deleted={() => navigate("/sign-in")}
      />
    </div>
  );
}
