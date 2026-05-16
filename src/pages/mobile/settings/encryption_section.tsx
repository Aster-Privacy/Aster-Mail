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
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  KeyIcon,
  LockClosedIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ServerStackIcon,
  LinkIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Switch, Radio } from "@aster/ui";

import {
  SettingsGroup,
  SettingsRow,
  SettingsHeader,
  chip_selected_style,
} from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { api_client } from "@/services/api/client";
import { derive_password_hash } from "@/services/crypto/key_manager";
import { use_encryption } from "@/components/settings/hooks/use_encryption";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_toast } from "@/components/toast/simple_toast";

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

export function EncryptionSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const enc = use_encryption();
  const { is_feature_locked: is_feature_locked_enc } = use_plan_limits();
  const [is_authenticated, set_is_authenticated] = useState(false);
  const [password, set_password] = useState("");
  const [totp_code, set_totp_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [auth_error, set_auth_error] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [show_ipfs_confirm, set_show_ipfs_confirm] = useState(false);

  const handle_authenticate = useCallback(async () => {
    if (!password.trim()) return;
    if (totp_required && !totp_code.trim()) {
      set_auth_error(t("settings.please_enter_2fa_code"));

      return;
    }
    set_is_loading(true);
    set_auth_error("");
    try {
      const salt_res = await api_client.get<{
        salt: string;
        totp_required: boolean;
      }>("/crypto/v1/encryption/salt", { skip_cache: true });

      if (salt_res.error || !salt_res.data?.salt) {
        set_auth_error(
          salt_res.error || t("settings.failed_verify_credentials"),
        );

        return;
      }
      if (salt_res.data.totp_required && !totp_required) {
        set_totp_required(true);
        set_totp_code("");

        return;
      }
      const salt = base64_to_array(salt_res.data.salt);
      const { hash } = await derive_password_hash(password, salt);
      const body: { password_hash: string; totp_code?: string } = {
        password_hash: hash,
      };

      if (totp_required && totp_code.trim()) {
        body.totp_code = totp_code.trim();
      }
      const verify_res = await api_client.post<{
        verified: boolean;
        totp_required: boolean;
      }>("/crypto/v1/encryption/verify-password", body);

      if (verify_res.error) {
        set_auth_error(verify_res.error);
      } else if (verify_res.data?.verified) {
        set_is_authenticated(true);
      } else if (verify_res.data?.totp_required && !totp_required) {
        set_totp_required(true);
        set_totp_code("");
      } else if (verify_res.data?.totp_required) {
        set_auth_error(t("settings.please_enter_2fa_code"));
      } else {
        set_auth_error(t("settings.incorrect_password_error"));
      }
    } catch {
      set_auth_error(t("settings.failed_verify_credentials"));
    } finally {
      set_is_loading(false);
    }
  }, [password, totp_code, totp_required, t]);

  const handle_storage_select = useCallback(
    (format: "aster" | "ipfs") => {
      if (format === enc.preferences.storage_format) return;
      if (format === "ipfs") {
        set_show_ipfs_confirm(true);

        return;
      }
      enc.update_preference("storage_format", format, true);
    },
    [enc],
  );

  if (!is_authenticated) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={on_back}
          on_close={on_close}
          title={t("settings.encryption")}
        />
        <div className="flex-1 overflow-y-auto pb-8">
          <div className="flex flex-col items-center gap-4 px-6 pt-12">
            <KeyIcon className="h-16 w-16 text-[var(--mobile-text-muted)] opacity-40" />
            <p className="text-center text-[15px] text-[var(--mobile-text-muted)]">
              {t("settings.enter_password_confirm")}
            </p>
            <Input
              className="w-full"
              placeholder={t("auth.password")}
              status={auth_error ? "error" : "default"}
              type="password"
              value={password}
              onChange={(e) => set_password(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !totp_required && handle_authenticate()
              }
            />
            {totp_required && (
              <Input
                autoComplete="one-time-code"
                className="w-full text-center tracking-[0.3em]"
                inputMode="numeric"
                maxLength={6}
                placeholder={t("settings.two_factor_code_label")}
                status={auth_error ? "error" : "default"}
                type="text"
                value={totp_code}
                onChange={(e) =>
                  set_totp_code(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onKeyDown={(e) => e.key === "Enter" && handle_authenticate()}
              />
            )}
            {auth_error && (
              <p className="text-[13px] text-[var(--mobile-danger)]">
                {auth_error}
              </p>
            )}
            <motion.button
              className="flex w-full items-center justify-center rounded-xl py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
              disabled={
                !password.trim() ||
                (totp_required && !totp_code.trim()) ||
                is_loading
              }
              style={{
                background:
                  "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                boxShadow:
                  "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              type="button"
              onClick={handle_authenticate}
            >
              {is_loading ? (
                <Spinner size="md" />
              ) : (
                t("settings.verifying_credentials").replace("...", "")
              )}
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.encryption")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4 pb-2">
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background:
                "linear-gradient(135deg, #4c1d95 0%, #6d28d9 40%, #7c3aed 70%, #8b5cf6 100%)",
              boxShadow:
                "0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="relative z-10">
              <h3
                className="text-[17px] font-bold text-white mb-1 tracking-tight"
                style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
              >
                {t("settings.encryption_banner_title")}
              </h3>
              <p
                className="text-[13px] text-purple-100/70 mb-4"
                style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
              >
                {t("settings.encryption_banner_subtitle")}
              </p>
              <div
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{
                  background: "rgba(0, 0, 0, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <span className="text-[11px] font-medium text-purple-100/90">
                  {t("settings.encryption_banner_you")}
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-px bg-purple-300/30" />
                  <LockClosedIcon className="w-3 h-3 text-purple-300/70" />
                  <div className="w-3 h-px bg-purple-300/30" />
                </div>
                <span className="text-[10px] font-mono text-purple-200/40 tracking-wider">
                  a4f8 e91c
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-px bg-purple-300/30" />
                  <LockClosedIcon className="w-3 h-3 text-purple-300/70" />
                  <div className="w-3 h-px bg-purple-300/30" />
                </div>
                <span className="text-[11px] font-medium text-purple-100/90">
                  {t("settings.encryption_banner_recipient")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {enc.pgp_key && (
          <SettingsGroup title={t("settings.encryption_keys")}>
            <div className="px-4 py-3">
              <div className="rounded-2xl bg-[var(--mobile-bg-card)] overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-medium text-[var(--mobile-text-primary)]">
                      {enc.pgp_key.algorithm.toUpperCase()}-
                      {enc.pgp_key.key_size}
                    </p>
                    <p className="text-[12px] text-[var(--mobile-text-muted)] mt-0.5">
                      {t("settings.created_date", {
                        date: enc.format_date(enc.pgp_key.created_at),
                      })}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-500">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    {t("common.active")}
                  </span>
                </div>
                <div className="px-4 py-2.5 border-t border-[var(--mobile-border)]">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg text-[10px] font-mono tracking-wide bg-[var(--mobile-bg-page)] text-[var(--mobile-text-secondary)] truncate">
                      {enc.format_fingerprint(enc.pgp_key.fingerprint)}
                    </code>
                    <button
                      className="p-2 rounded-[14px] active:bg-[var(--mobile-bg-card-hover)]"
                      type="button"
                      onClick={enc.handle_copy_fingerprint}
                    >
                      <ClipboardDocumentIcon className="w-4 h-4 text-[var(--mobile-text-muted)]" />
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[var(--mobile-border)] flex flex-col gap-2">
                  <motion.button
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white"
                    style={{
                      background:
                        "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                      boxShadow:
                        "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    type="button"
                    onClick={enc.handle_export_public_key}
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    {t("settings.export_public_key_label")}
                  </motion.button>
                  <motion.button
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white"
                    style={{
                      background:
                        "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                      boxShadow:
                        "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    type="button"
                    onClick={enc.open_export_prompt}
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    {t("settings.export_private_key_label")}
                  </motion.button>
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-[16px] py-3 text-[14px] font-medium text-[var(--mobile-text-secondary)] bg-[var(--mobile-bg-card-hover)]"
                    type="button"
                    onClick={enc.handle_copy_public_key}
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                    {t("common.copy")}
                  </button>
                </div>
              </div>
            </div>
          </SettingsGroup>
        )}

        {!enc.pgp_key && (
          <SettingsGroup title={t("settings.encryption_keys")}>
            <div className="px-4 py-3">
              <div className="text-center py-8 rounded-2xl bg-[var(--mobile-bg-card)]">
                <KeyIcon className="w-6 h-6 mx-auto mb-2 text-[var(--mobile-text-muted)]" />
                <p className="text-[13px] text-[var(--mobile-text-muted)]">
                  {t("settings.no_encryption_key")}
                </p>
              </div>
            </div>
          </SettingsGroup>
        )}

        <SettingsGroup title={t("settings.recovery_codes")}>
          <div className="px-4 py-3">
            <div className="rounded-2xl bg-[var(--mobile-bg-card)] overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-medium text-[var(--mobile-text-primary)]">
                    {t("settings.recovery_codes")}
                  </span>
                  {enc.codes_used > 0 && (
                    <span
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor:
                          enc.codes_remaining <= 2
                            ? "rgba(239, 68, 68, 0.1)"
                            : "rgba(234, 179, 8, 0.1)",
                        color: enc.codes_remaining <= 2 ? "#ef4444" : "#eab308",
                      }}
                    >
                      {t("settings.codes_used_count", { used: enc.codes_used })}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--mobile-text-muted)] mb-3">
                  {t("settings.codes_remaining_count", {
                    remaining: enc.codes_remaining,
                    total: enc.codes_total,
                  })}
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: enc.codes_total }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          i < enc.codes_remaining
                            ? "var(--mobile-accent, #6b8aff)"
                            : "var(--mobile-border)",
                      }}
                    />
                  ))}
                </div>
              </div>

              {enc.codes_remaining <= 2 && enc.codes_remaining > 0 && (
                <div className="px-4 py-2.5 flex items-center gap-2 border-t border-[var(--mobile-border)] bg-red-500/5">
                  <XCircleIcon className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-500">
                    {t("settings.running_low_warning")}
                  </p>
                </div>
              )}

              {enc.show_recovery_codes && enc.recovery_codes && (
                <div className="px-4 py-3 border-t border-[var(--mobile-border)]">
                  <div className="flex flex-col gap-1.5 mb-3">
                    {enc.recovery_codes.map((code, index) => (
                      <button
                        key={`${enc.codes_key}-${index}`}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-[14px] bg-[var(--mobile-bg-page)] active:bg-[var(--mobile-bg-card-hover)]"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(code);
                            show_toast(
                              t("settings.copied_to_clipboard"),
                              "success",
                            );
                          } catch {
                            /* */
                          }
                        }}
                      >
                        <span className="text-[11px] font-medium w-5 text-[var(--mobile-text-muted)]">
                          {index + 1}
                        </span>
                        <code className="text-[13px] font-mono text-[var(--mobile-text-primary)]">
                          {code}
                        </code>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white"
                      style={{
                        background:
                          "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                        boxShadow:
                          "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                      }}
                      type="button"
                      onClick={enc.handle_download_codes}
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      {t("settings.download_pdf")}
                    </motion.button>
                    <button
                      className="p-3 rounded-[14px] bg-[var(--mobile-bg-card-hover)]"
                      type="button"
                      onClick={enc.handle_copy_all_codes}
                    >
                      <ClipboardDocumentIcon className="w-4 h-4 text-[var(--mobile-text-muted)]" />
                    </button>
                  </div>
                </div>
              )}

              <div className="px-4 py-3 border-t border-[var(--mobile-border)]">
                <motion.button
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={enc.open_regenerate_confirm}
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  {t("settings.regenerate_codes_label")}
                </motion.button>
              </div>
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.storage_format_title")}>
          <div className="px-4 py-3">
            <p className="text-[12px] text-[var(--mobile-text-muted)] mb-3">
              {t("settings.storage_format_description")}
            </p>
            <div className="flex flex-col gap-2">
              <button
                className="rounded-[14px] border-2 overflow-hidden text-left"
                style={{
                  borderColor:
                    enc.preferences.storage_format === "aster"
                      ? "var(--mobile-accent, #6b8aff)"
                      : "var(--mobile-border)",
                  backgroundColor: "var(--mobile-bg-card)",
                }}
                type="button"
                onClick={() => handle_storage_select("aster")}
              >
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ServerStackIcon className="w-5 h-5 text-[var(--mobile-text-secondary)]" />
                    <span className="text-[14px] font-medium text-[var(--mobile-text-primary)]">
                      {t("settings.storage_format_aster_server")}
                    </span>
                  </div>
                  <span className="pointer-events-none flex-shrink-0">
                    <Radio
                      readOnly
                      checked={enc.preferences.storage_format === "aster"}
                    />
                  </span>
                </div>
              </button>
              <button
                className="rounded-[14px] border-2 overflow-hidden text-left"
                style={{
                  borderColor:
                    enc.preferences.storage_format === "ipfs"
                      ? "var(--mobile-accent, #6b8aff)"
                      : "var(--mobile-border)",
                  backgroundColor: "var(--mobile-bg-card)",
                }}
                type="button"
                onClick={() => handle_storage_select("ipfs")}
              >
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LinkIcon className="w-5 h-5 text-[var(--mobile-text-secondary)]" />
                    <span className="text-[14px] font-medium text-[var(--mobile-text-primary)]">
                      {t("settings.storage_format_decentralized_ipfs")}
                    </span>
                  </div>
                  <span className="pointer-events-none flex-shrink-0">
                    <Radio
                      readOnly
                      checked={enc.preferences.storage_format === "ipfs"}
                    />
                  </span>
                </div>
              </button>
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.encryption_behavior")}>
          <SettingsRow
            label={t("settings.auto_discover_keys_title")}
            trailing={
              <Switch
                checked={enc.preferences.auto_discover_keys}
                onCheckedChange={(v) =>
                  enc.update_preference("auto_discover_keys", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.encrypt_by_default_title")}
            trailing={
              <Switch
                checked={enc.preferences.encrypt_emails}
                onCheckedChange={(v) =>
                  enc.update_preference("encrypt_emails", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.require_encryption_title")}
            trailing={
              <Switch
                checked={enc.preferences.require_encryption}
                onCheckedChange={(v) =>
                  enc.update_preference("require_encryption", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.show_encryption_indicators_title")}
            trailing={
              <Switch
                checked={enc.preferences.show_encryption_indicators}
                onCheckedChange={(v) =>
                  enc.update_preference("show_encryption_indicators", v, true)
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
                checked={enc.preferences.forward_secrecy_enabled}
                onCheckedChange={(v) =>
                  enc.update_preference("forward_secrecy_enabled", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.publish_keys_wkd_title")}>
          <SettingsRow
            label={t("settings.publish_keys_wkd_title")}
            trailing={
              <Switch
                checked={enc.preferences.publish_to_wkd}
                onCheckedChange={enc.handle_wkd_toggle}
              />
            }
          />
          <SettingsRow
            label={t("settings.publish_to_keyservers_title")}
            trailing={
              <Switch
                checked={enc.preferences.publish_to_keyservers}
                onCheckedChange={enc.handle_keyserver_toggle}
              />
            }
          />
        </SettingsGroup>

        <UpgradeGate
          description={t("settings.key_rotation_locked")}
          feature_name={t("settings.key_rotation_interval")}
          is_locked={is_feature_locked_enc("has_custom_key_rotation")}
          min_plan="Nova"
        >
          <SettingsGroup title={t("settings.current_key_status")}>
            <div className="px-4 py-3">
              <p className="mb-2 text-[13px] text-[var(--mobile-text-muted)]">
                {t("settings.key_rotation_interval")}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 24, label: t("settings.daily") },
                  { value: 168, label: t("settings.weekly") },
                  { value: 336, label: t("settings.biweekly") },
                  { value: 720, label: t("settings.monthly") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-[12px] px-3 py-1.5 text-[13px] font-medium ${
                      enc.preferences.key_rotation_hours === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--mobile-text-secondary)]"
                    }`}
                    style={
                      enc.preferences.key_rotation_hours === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      enc.update_preference("key_rotation_hours", opt.value, true)
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="mb-2 text-[13px] text-[var(--mobile-text-muted)]">
                {t("settings.key_history_limit")}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 5, label: t("settings.five_keys") },
                  { value: 10, label: t("settings.ten_keys") },
                  { value: 25, label: t("settings.twenty_five_keys") },
                  { value: 0, label: t("settings.unlimited") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-[12px] px-3 py-1.5 text-[13px] font-medium ${
                      enc.preferences.key_history_limit === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--mobile-text-secondary)]"
                    }`}
                    style={
                      enc.preferences.key_history_limit === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      enc.update_preference("key_history_limit", opt.value, true)
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </SettingsGroup>
        </UpgradeGate>
      </div>

      {enc.show_export_prompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={enc.close_export_prompt}
        >
          <motion.div
            animate={{ y: 0 }}
            className="w-full max-w-lg rounded-t-3xl bg-[var(--mobile-bg-card)] px-6 pt-6 pb-8"
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--mobile-text-muted)] opacity-30" />
            <h3 className="text-[17px] font-semibold text-[var(--mobile-text-primary)] mb-1">
              {t("common.export_private_key")}
            </h3>
            <p className="text-[13px] text-[var(--mobile-text-muted)] mb-4">
              {t("settings.verify_identity_export")}
            </p>
            <div className="flex flex-col gap-3">
              <Input
                autoFocus
                className="w-full"
                placeholder={t("common.enter_password_prompt")}
                status={enc.export_error ? "error" : "default"}
                type="password"
                value={enc.export_password}
                onChange={(e) => enc.set_export_password(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && enc.handle_export_secret_key()
                }
              />
              {enc.export_totp_required && (
                <Input
                  className="w-full"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("common.two_fa_code_placeholder")}
                  status={enc.export_error ? "error" : "default"}
                  type="text"
                  value={enc.export_totp_code}
                  onChange={(e) =>
                    enc.set_export_totp_code(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" && enc.handle_export_secret_key()
                  }
                />
              )}
              {enc.export_error && (
                <p className="text-[13px] text-[var(--mobile-danger)]">
                  {enc.export_error}
                </p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  className="flex-1 rounded-[16px] py-3.5 text-[15px] font-medium text-[var(--mobile-text-secondary)] bg-[var(--mobile-bg-card-hover)]"
                  type="button"
                  onClick={enc.close_export_prompt}
                >
                  {t("common.cancel")}
                </button>
                <motion.button
                  className="flex flex-1 items-center justify-center rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                  disabled={
                    enc.is_exporting_private_key ||
                    !enc.export_password.trim() ||
                    (enc.export_totp_required &&
                      enc.export_totp_code.length !== 6)
                  }
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={enc.handle_export_secret_key}
                >
                  {enc.is_exporting_private_key ? (
                    <Spinner size="md" />
                  ) : (
                    t("common.export")
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {enc.show_regenerate_confirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={enc.close_regenerate_confirm}
        >
          <motion.div
            animate={{ y: 0 }}
            className="w-full max-w-lg rounded-t-3xl bg-[var(--mobile-bg-card)] px-6 pt-6 pb-8"
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--mobile-text-muted)] opacity-30" />
            <h3 className="text-[17px] font-semibold text-[var(--mobile-text-primary)] mb-1">
              {t("common.regenerate_recovery_codes")}
            </h3>
            <p className="text-[13px] text-[var(--mobile-text-muted)] mb-4">
              {t("settings.regenerate_codes_warning")}{" "}
              <code className="px-1 py-0.5 rounded text-[11px] bg-[var(--mobile-bg-page)]">
                regenerate
              </code>{" "}
              {t("common.confirm").toLowerCase()}.
            </p>
            <div className="flex flex-col gap-3">
              <Input
                autoFocus
                className="w-full"
                placeholder={t("settings.type_regenerate")}
                status={enc.regenerate_error ? "error" : "default"}
                type="text"
                value={enc.regenerate_confirm_text}
                onChange={(e) =>
                  enc.set_regenerate_confirm_text(e.target.value)
                }
              />
              <Input
                className="w-full"
                placeholder={t("common.enter_password_prompt")}
                status={enc.regenerate_error ? "error" : "default"}
                type="password"
                value={enc.regenerate_password}
                onChange={(e) => enc.set_regenerate_password(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  enc.regenerate_confirm_text.toLowerCase() === "regenerate" &&
                  enc.regenerate_password.trim() &&
                  enc.handle_regenerate_codes()
                }
              />
              {enc.regenerate_totp_required && (
                <Input
                  className="w-full"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t("common.two_fa_code_placeholder")}
                  status={enc.regenerate_error ? "error" : "default"}
                  type="text"
                  value={enc.regenerate_totp_code}
                  onChange={(e) =>
                    enc.set_regenerate_totp_code(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    enc.regenerate_confirm_text.toLowerCase() ===
                      "regenerate" &&
                    enc.regenerate_password.trim() &&
                    enc.handle_regenerate_codes()
                  }
                />
              )}
              {enc.regenerate_error && (
                <p className="text-[13px] text-[var(--mobile-danger)]">
                  {enc.regenerate_error}
                </p>
              )}
              <div className="flex gap-3 mt-2">
                <button
                  className="flex-1 rounded-[16px] py-3.5 text-[15px] font-medium text-[var(--mobile-text-secondary)] bg-[var(--mobile-bg-card-hover)]"
                  type="button"
                  onClick={enc.close_regenerate_confirm}
                >
                  {t("common.cancel")}
                </button>
                <motion.button
                  className="flex flex-1 items-center justify-center rounded-xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
                  disabled={
                    enc.regenerate_confirm_text.toLowerCase() !==
                      "regenerate" ||
                    !enc.regenerate_password.trim() ||
                    (enc.regenerate_totp_required &&
                      enc.regenerate_totp_code.length !== 6) ||
                    enc.is_regenerating
                  }
                  style={{
                    background:
                      "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={enc.handle_regenerate_codes}
                >
                  {enc.is_regenerating ? (
                    <Spinner size="md" />
                  ) : (
                    t("common.regenerate")
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmationModal
        confirm_text={t("common.confirm")}
        is_open={show_ipfs_confirm}
        message={t("settings.storage_format_ipfs_confirm_description")}
        on_cancel={() => set_show_ipfs_confirm(false)}
        on_confirm={() => {
          enc.update_preference("storage_format", "ipfs", true);
          set_show_ipfs_confirm(false);
        }}
        title={t("settings.storage_format_ipfs_confirm_title")}
      />
    </div>
  );
}
