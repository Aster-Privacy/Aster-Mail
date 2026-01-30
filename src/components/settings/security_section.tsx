import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheckIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
  EyeSlashIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  FingerPrintIcon,
} from "@heroicons/react/24/outline";

import { TotpSetupModal } from "./totp_setup_modal";
import { TotpDisableModal } from "./totp_disable_modal";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KeyRotationModal } from "@/components/modals/key_rotation_modal";
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
  hash_email,
  derive_password_hash,
  decrypt_vault,
  encrypt_vault,
  base64_to_array,
} from "@/services/crypto/key_manager";
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

interface SecuritySettingProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}

function SecuritySetting({
  icon,
  title,
  description,
  action,
}: SecuritySettingProps) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border transition-colors"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          {icon}
        </div>
        <div>
          <h4
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h4>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        </div>
      </div>
      {action}
    </div>
  );
}

const SESSION_TIMEOUT_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
];

const KEY_ROTATION_OPTIONS = [
  { value: 24, label: "Daily" },
  { value: 168, label: "Weekly" },
  { value: 336, label: "Biweekly" },
  { value: 720, label: "Monthly" },
];

const KEY_HISTORY_OPTIONS = [
  { value: 5, label: "5 keys" },
  { value: 10, label: "10 keys" },
  { value: 25, label: "25 keys" },
  { value: 0, label: "Unlimited" },
];

interface LogoutOthersResponse {
  message: string;
  sessions_revoked: number;
}

export function SecuritySection() {
  const { preferences, update_preference } = use_preferences();
  const { user, logout_all } = use_auth();
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
  const [logout_others_loading, set_logout_others_loading] = useState(false);
  const [logout_others_result, set_logout_others_result] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fetch_totp_status = useCallback(async () => {
    try {
      const response = await get_totp_status();

      if (response.data) {
        set_totp_status(response.data);
      }
    } catch {
      return;
    }
  }, []);

  const fetch_login_alerts_status = useCallback(async () => {
    try {
      const response = await get_login_alerts_status();

      if (response.data) {
        set_login_alerts_enabled(response.data.enabled);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    fetch_totp_status();
    fetch_login_alerts_status();
  }, [fetch_totp_status, fetch_login_alerts_status]);

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
    } catch {
      set_login_alerts_enabled(!new_value);
    } finally {
      set_login_alerts_loading(false);
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
      set_password_error("User not found");

      return;
    }

    if (new_password !== confirm_password) {
      set_password_error("Passwords do not match");

      return;
    }

    if (new_password.length < 8) {
      set_password_error("Password must be at least 8 characters");

      return;
    }

    if (new_password.length > 128) {
      set_password_error("Password must be less than 128 characters");

      return;
    }

    set_password_loading(true);

    try {
      const user_hash = await hash_email(user.email);

      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_password_error(
          salt_response.error || "Failed to get authentication data",
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
        const stored_vault = sessionStorage.getItem(
          `astermail_encrypted_vault_${user.id}`,
        );
        const stored_nonce = sessionStorage.getItem(
          `astermail_vault_nonce_${user.id}`,
        );

        if (!stored_vault || !stored_nonce) {
          set_password_error("Session expired. Please sign in again.");
          set_password_loading(false);

          return;
        }

        vault = await decrypt_vault(
          stored_vault,
          stored_nonce,
          current_password,
        );
      } catch {
        set_password_error("Current password is incorrect");
        set_password_loading(false);

        return;
      }

      const new_salt = crypto.getRandomValues(new Uint8Array(16));
      const { hash: new_password_hash, salt: new_password_salt } =
        await derive_password_hash(new_password, new_salt);

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

      set_password_success(true);
      set_show_password_section(false);
      set_current_password("");
      set_new_password("");
      set_confirm_password("");

      setTimeout(async () => {
        await logout_all();
      }, 2000);
    } catch (err) {
      set_password_error(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      set_password_loading(false);
    }
  };

  const handle_timeout_toggle = () => {
    update_preference(
      "session_timeout_enabled",
      !preferences.session_timeout_enabled,
    );
  };

  const handle_timeout_change = (minutes: number) => {
    update_preference("session_timeout_minutes", minutes);
  };

  const handle_forward_secrecy_toggle = async () => {
    const enabling = !preferences.forward_secrecy_enabled;

    update_preference("forward_secrecy_enabled", enabling);

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
            sessionStorage.setItem(
              `astermail_encrypted_vault_${user.id}`,
              encrypted_vault,
            );
            sessionStorage.setItem(
              `astermail_vault_nonce_${user.id}`,
              vault_nonce,
            );
          }
        }

        await upload_prekey_bundle(vault);
      } catch {
        return;
      }
    }
  };

  const get_timeout_description = () => {
    if (!preferences.session_timeout_enabled) {
      return "Session timeout is disabled";
    }
    const option = SESSION_TIMEOUT_OPTIONS.find(
      (opt) => opt.value === preferences.session_timeout_minutes,
    );

    return `Automatically lock after ${option?.label || preferences.session_timeout_minutes + " minutes"} of inactivity`;
  };

  const handle_logout_others = async () => {
    set_logout_others_loading(true);
    set_logout_others_result(null);

    try {
      const response = await api_client.post<LogoutOthersResponse>(
        "/auth/logout-others",
        {},
      );

      if (response.error) {
        set_logout_others_result({
          success: false,
          message: response.error || "Failed to sign out other sessions",
        });
      } else if (response.data) {
        set_logout_others_result({
          success: true,
          message: response.data.message,
        });
      }
    } catch {
      set_logout_others_result({
        success: false,
        message: "Failed to sign out other sessions",
      });
    } finally {
      set_logout_others_loading(false);

      setTimeout(() => {
        set_logout_others_result(null);
      }, 5000);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Security Settings
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Manage your account security and authentication preferences
        </p>

        <div className="space-y-3">
          <SecuritySetting
            action={
              <Switch
                checked={totp_status?.enabled ?? false}
                onCheckedChange={handle_two_factor_toggle}
              />
            }
            description={
              totp_status?.enabled
                ? `Enabled (${totp_status.backup_codes_remaining} backup codes remaining)`
                : "Add an extra layer of security with 2FA"
            }
            icon={
              <DevicePhoneMobileIcon
                className="w-5 h-5"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            title="Two-Factor Authentication"
          />
          <SecuritySetting
            action={
              <Switch
                checked={preferences.session_timeout_enabled}
                onCheckedChange={handle_timeout_toggle}
              />
            }
            description={get_timeout_description()}
            icon={
              <ShieldCheckIcon
                className="w-5 h-5"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            title="Session Timeout"
          />
          {preferences.session_timeout_enabled && (
            <div
              className="p-4 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-secondary)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <ClockIcon
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Timeout Duration
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SESSION_TIMEOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className="px-3 py-2 text-xs rounded-lg border transition-all"
                    style={{
                      backgroundColor:
                        preferences.session_timeout_minutes === option.value
                          ? "#3b82f6"
                          : "var(--bg-secondary)",
                      borderColor:
                        preferences.session_timeout_minutes === option.value
                          ? "#3b82f6"
                          : "var(--border-secondary)",
                      color:
                        preferences.session_timeout_minutes === option.value
                          ? "#ffffff"
                          : "var(--text-secondary)",
                    }}
                    type="button"
                    onClick={() => handle_timeout_change(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p
                className="text-xs mt-3"
                style={{ color: "var(--text-muted)" }}
              >
                You&apos;ll be logged out after this period of inactivity.
                You&apos;ll need to sign in again.
              </p>
            </div>
          )}
          <SecuritySetting
            action={
              <Switch
                checked={login_alerts_enabled}
                onCheckedChange={handle_login_alerts_toggle}
              />
            }
            description="Get notified of new sign-ins to your account"
            icon={
              <KeyIcon
                className="w-5 h-5"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            title="Login Alerts"
          />
          <SecuritySetting
            action={
              <Switch
                checked={preferences.forward_secrecy_enabled}
                onCheckedChange={handle_forward_secrecy_toggle}
              />
            }
            description={
              preferences.forward_secrecy_enabled
                ? `Keys rotate ${KEY_ROTATION_OPTIONS.find((o) => o.value === preferences.key_rotation_hours)?.label.toLowerCase() || "weekly"}`
                : "Automatically rotate encryption keys for enhanced security"
            }
            icon={
              <ArrowPathIcon
                className="w-5 h-5"
                style={{ color: "var(--text-secondary)" }}
              />
            }
            title="Forward Secrecy"
          />
          {preferences.forward_secrecy_enabled && (
            <div
              className="p-4 rounded-lg border space-y-4"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-secondary)",
              }}
            >
              <div
                className="p-3 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FingerPrintIcon
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Current Key Status
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>Age</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {key_age_hours !== null
                      ? key_age_hours < 24
                        ? `${key_age_hours} hours`
                        : `${Math.floor(key_age_hours / 24)} days`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs mt-1">
                  <span style={{ color: "var(--text-secondary)" }}>
                    Fingerprint
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {key_fingerprint || "—"}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <ArrowPathIcon
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Key Rotation Interval
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {KEY_ROTATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className="px-3 py-2 text-xs rounded-lg border transition-all"
                      style={{
                        backgroundColor:
                          preferences.key_rotation_hours === option.value
                            ? "#3b82f6"
                            : "var(--bg-secondary)",
                        borderColor:
                          preferences.key_rotation_hours === option.value
                            ? "#3b82f6"
                            : "var(--border-secondary)",
                        color:
                          preferences.key_rotation_hours === option.value
                            ? "#ffffff"
                            : "var(--text-secondary)",
                      }}
                      type="button"
                      onClick={() =>
                        update_preference("key_rotation_hours", option.value)
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <KeyIcon
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Key History Limit
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {KEY_HISTORY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className="px-3 py-2 text-xs rounded-lg border transition-all"
                      style={{
                        backgroundColor:
                          preferences.key_history_limit === option.value
                            ? "#3b82f6"
                            : "var(--bg-secondary)",
                        borderColor:
                          preferences.key_history_limit === option.value
                            ? "#3b82f6"
                            : "var(--border-secondary)",
                        color:
                          preferences.key_history_limit === option.value
                            ? "#ffffff"
                            : "var(--text-secondary)",
                      }}
                      type="button"
                      onClick={() =>
                        update_preference("key_history_limit", option.value)
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p
                  className="text-xs mt-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Old keys are kept to decrypt older emails. Set to unlimited
                  for full history.
                </p>
              </div>
              <div
                className="pt-2 border-t"
                style={{ borderColor: "var(--border-secondary)" }}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={show_manual_rotation_modal}
                >
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Rotate Keys Now
                </Button>
                <p
                  className="text-xs mt-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Manually rotate your encryption keys. Old emails will remain
                  readable.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-3">
        <h3
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Password
        </h3>
        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          Change your account password
        </p>

        <AnimatePresence mode="wait">
          {!show_password_section ? (
            <motion.div
              key="change-password-button"
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                variant="secondary"
                onClick={() => set_show_password_section(true)}
              >
                Change Password
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="password-form"
              animate={{ opacity: 1 }}
              className="p-4 rounded-lg border space-y-4"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border-secondary)",
              }}
              transition={{ duration: 0.15 }}
            >
              <div>
                <label
                  className="text-sm font-medium block mb-2"
                  htmlFor="current-password"
                  style={{ color: "var(--text-primary)" }}
                >
                  Current Password
                </label>
                <div className="relative">
                  <Input
                    className="pr-10"
                    disabled={password_loading}
                    id="current-password"
                    placeholder="Enter current password"
                    type={show_current_password ? "text" : "password"}
                    value={current_password}
                    onChange={(e) => set_current_password(e.target.value)}
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                    type="button"
                    onClick={() =>
                      set_show_current_password(!show_current_password)
                    }
                  >
                    {show_current_password ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="text-sm font-medium block mb-2"
                  htmlFor="new-password"
                  style={{ color: "var(--text-primary)" }}
                >
                  New Password
                </label>
                <div className="relative">
                  <Input
                    className="pr-10"
                    disabled={password_loading}
                    id="new-password"
                    placeholder="Enter new password"
                    type={show_new_password ? "text" : "password"}
                    value={new_password}
                    onChange={(e) => set_new_password(e.target.value)}
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                    type="button"
                    onClick={() => set_show_new_password(!show_new_password)}
                  >
                    {show_new_password ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="text-sm font-medium block mb-2"
                  htmlFor="confirm-new-password"
                  style={{ color: "var(--text-primary)" }}
                >
                  Confirm New Password
                </label>
                <Input
                  disabled={password_loading}
                  id="confirm-new-password"
                  placeholder="Confirm new password"
                  type="password"
                  value={confirm_password}
                  onChange={(e) => set_confirm_password(e.target.value)}
                />
              </div>

              {password_error && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    color: "var(--color-error, #ef4444)",
                  }}
                >
                  <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{password_error}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button
                  disabled={password_loading}
                  variant="outline"
                  onClick={() => {
                    set_show_password_section(false);
                    set_current_password("");
                    set_new_password("");
                    set_confirm_password("");
                    set_password_error("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    password_loading ||
                    !current_password ||
                    !new_password ||
                    !confirm_password
                  }
                  variant="primary"
                  onClick={handle_change_password}
                >
                  {password_loading ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {password_success && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 p-3 rounded-lg text-sm"
              exit={{ opacity: 0, y: -10 }}
              initial={{ opacity: 0, y: -10 }}
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                color: "var(--color-success, #22c55e)",
              }}
              transition={{ duration: 0.2 }}
            >
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              <span>Password changed successfully. Signing you out...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-3">
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Session Security
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          For your privacy, we don&apos;t track session details or device
          information
        </p>

        <div className="flex items-center gap-3">
          <Button
            disabled={logout_others_loading}
            variant="destructive"
            onClick={handle_logout_others}
          >
            {logout_others_loading
              ? "Signing out..."
              : "Sign out everywhere else"}
          </Button>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          This will sign you out of all other devices and browsers
        </p>

        <AnimatePresence>
          {logout_others_result && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 p-3 rounded-lg text-sm"
              exit={{ opacity: 0, y: -10 }}
              initial={{ opacity: 0, y: -10 }}
              style={{
                backgroundColor: logout_others_result.success
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
                color: logout_others_result.success
                  ? "var(--color-success, #22c55e)"
                  : "var(--color-error, #ef4444)",
              }}
              transition={{ duration: 0.2 }}
            >
              {logout_others_result.success ? (
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{logout_others_result.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TotpSetupModal
        is_open={show_totp_setup_modal}
        on_close={() => set_show_totp_setup_modal(false)}
        on_success={handle_totp_setup_success}
      />

      <TotpDisableModal
        is_open={show_totp_disable_modal}
        on_close={() => set_show_totp_disable_modal(false)}
        on_success={handle_totp_disable_success}
      />

      <KeyRotationModal
        is_manual
        is_open={show_rotation_modal}
        key_age_hours={key_age_hours}
        key_fingerprint={key_fingerprint}
        on_close={close_rotation_modal}
        on_rotate={perform_rotation}
      />
    </div>
  );
}
