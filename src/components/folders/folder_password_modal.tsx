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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_protected_folder } from "@/hooks/use_protected_folder";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";

interface FolderPasswordModalProps {
  is_open: boolean;
  on_close: () => void;
  folder_id: string;
  folder_name: string;
  mode: "setup" | "unlock" | "settings";
  on_success?: () => void;
}

function get_password_strength(
  password: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): {
  level: number;
  label: string;
  color: string;
} {
  if (!password) return { level: 0, label: "", color: "" };

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1)
    return {
      level: 1,
      label: t("common.password_strength_weak"),
      color: "var(--color-danger)",
    };
  if (score === 2)
    return {
      level: 2,
      label: t("common.password_strength_fair"),
      color: "var(--color-warning)",
    };
  if (score === 3)
    return {
      level: 3,
      label: t("common.password_strength_strong"),
      color: "var(--color-success)",
    };

  return {
    level: 4,
    label: t("common.password_strength_strong"),
    color: "var(--color-success)",
  };
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { t } = use_i18n();
  const strength = get_password_strength(password, t);

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-txt-muted">
          {t("settings.password_strength_label")}
        </span>
        <span
          className="text-[11px] font-medium"
          style={{ color: strength.color }}
        >
          {strength.label}
        </span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              backgroundColor:
                i <= strength.level
                  ? strength.color
                  : "var(--border-secondary)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  on_change,
  placeholder,
  show_password,
  on_toggle_visibility,
  on_key_down,
  auto_focus = false,
  id,
  status = "default",
}: {
  value: string;
  on_change: (value: string) => void;
  placeholder: string;
  show_password: boolean;
  on_toggle_visibility: () => void;
  on_key_down?: (e: React.KeyboardEvent) => void;
  auto_focus?: boolean;
  id?: string;
  status?: "default" | "success" | "error";
}) {
  return (
    <div className="relative">
      <Input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={auto_focus}
        className="pr-11"
        id={id}
        placeholder={placeholder}
        status={status}
        type={show_password ? "text" : "password"}
        value={value}
        onChange={(e) => on_change(e.target.value)}
        onKeyDown={on_key_down}
      />
      <button
        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center focus:outline-none text-txt-muted"
        type="button"
        onClick={on_toggle_visibility}
      >
        {show_password ? (
          <EyeSlashIcon className="w-5 h-5" />
        ) : (
          <EyeIcon className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}

export function FolderPasswordModal({
  is_open,
  on_close,
  folder_id,
  folder_name,
  mode,
  on_success,
}: FolderPasswordModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { is_feature_locked } = use_plan_limits();
  const {
    is_loading,
    error: hook_error,
    unlock_folder,
    set_password,
    change_password,
    remove_password,
  } = use_protected_folder(folder_id);

  const [password, set_password_state] = useState("");
  const [confirm_password, set_confirm_password] = useState("");
  const [current_password, set_current_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [show_confirm, set_show_confirm] = useState(false);
  const [show_current, set_show_current] = useState(false);
  const [error, set_error] = useState("");
  const [internal_mode, set_internal_mode] = useState<
    "setup" | "unlock" | "change" | "remove"
  >(mode === "settings" ? "change" : mode);

  useEffect(() => {
    if (is_open) {
      set_internal_mode(mode === "settings" ? "change" : mode);
      set_password_state("");
      set_confirm_password("");
      set_current_password("");
      set_error("");
    }
  }, [is_open, mode]);

  useEffect(() => {
    if (hook_error) {
      set_error(hook_error);
    }
  }, [hook_error]);

  const strength = get_password_strength(password, t);

  const handle_submit = async () => {
    set_error("");

    if (internal_mode === "setup") {
      if (password.length < 8) {
        set_error(t("settings.password_min_8"));

        return;
      }
      if (password !== confirm_password) {
        set_error(t("settings.passwords_do_not_match_folder"));

        return;
      }
      if (strength.level < 2) {
        set_error(t("settings.choose_stronger_password"));

        return;
      }

      const success = await set_password(password);

      if (success) {
        on_success?.();
        on_close();
      }
    } else if (internal_mode === "unlock") {
      if (!password) {
        set_error(t("settings.enter_password_required"));

        return;
      }

      const success = await unlock_folder(password);

      if (success) {
        on_success?.();
        on_close();
      }
    } else if (internal_mode === "change") {
      if (!current_password) {
        set_error(t("settings.enter_current_password_required"));

        return;
      }
      if (password.length < 8) {
        set_error(t("settings.new_password_min_8"));

        return;
      }
      if (password !== confirm_password) {
        set_error(t("settings.new_passwords_do_not_match"));

        return;
      }
      if (strength.level < 2) {
        set_error(t("settings.choose_stronger_new_password"));

        return;
      }

      const success = await change_password(current_password, password);

      if (success) {
        on_success?.();
        on_close();
      }
    } else if (internal_mode === "remove") {
      if (!password) {
        set_error(t("settings.enter_password_confirm_required"));

        return;
      }

      const success = await remove_password(password);

      if (success) {
        on_success?.();
        on_close();
      }
    }
  };

  const handle_close = () => {
    if (is_loading) return;
    on_close();
  };

  const render_setup_content = () => (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: "rgba(251, 191, 36, 0.1)",
          border: "1px solid rgba(251, 191, 36, 0.2)",
        }}
      >
        <ExclamationTriangleIcon
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          style={{ color: "var(--color-warning)" }}
        />
        <div>
          <p className="text-[13px] font-medium mb-0.5 text-txt-primary">
            {t("settings.no_password_recovery_title")}
          </p>
          <p className="text-[12px] text-txt-secondary">
            {t("settings.no_password_recovery_desc")}
          </p>
        </div>
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="setup-password"
        >
          {t("settings.password")}
        </label>
        <PasswordInput
          auto_focus
          id="setup-password"
          on_change={set_password_state}
          on_key_down={(e) =>
            e["key"] === "Enter" && confirm_password && handle_submit()
          }
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder={t("settings.enter_strong_password")}
          show_password={show_password}
          status={error ? "error" : "default"}
          value={password}
        />
        <PasswordStrengthBar password={password} />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="setup-confirm-password"
        >
          {t("auth.confirm_password")}
        </label>
        <PasswordInput
          id="setup-confirm-password"
          on_change={set_confirm_password}
          on_key_down={(e) => e["key"] === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_confirm(!show_confirm)}
          placeholder={t("settings.re_enter_password")}
          show_password={show_confirm}
          status={error ? "error" : "default"}
          value={confirm_password}
        />
      </div>
    </div>
  );

  const render_unlock_content = () => (
    <div className="space-y-4">
      <p className="text-[13px] text-txt-secondary">
        {t("settings.folder_protected_desc")}
      </p>

      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="unlock-password"
        >
          {t("settings.password")}
        </label>
        <PasswordInput
          auto_focus
          id="unlock-password"
          on_change={set_password_state}
          on_key_down={(e) => e["key"] === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder={t("settings.enter_your_password")}
          show_password={show_password}
          status={error ? "error" : "default"}
          value={password}
        />
      </div>
    </div>
  );

  const render_change_content = () => (
    <div className="space-y-4">
      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="change-current-password"
        >
          {t("settings.current_password")}
        </label>
        <PasswordInput
          auto_focus
          id="change-current-password"
          on_change={set_current_password}
          on_toggle_visibility={() => set_show_current(!show_current)}
          placeholder={t("settings.enter_current_password_folder")}
          show_password={show_current}
          status={error ? "error" : "default"}
          value={current_password}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="change-new-password"
        >
          {t("settings.new_password")}
        </label>
        <PasswordInput
          id="change-new-password"
          on_change={set_password_state}
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder={t("settings.enter_new_password_folder")}
          show_password={show_password}
          status={error ? "error" : "default"}
          value={password}
        />
        <PasswordStrengthBar password={password} />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="change-confirm-password"
        >
          {t("settings.confirm_new_password")}
        </label>
        <PasswordInput
          id="change-confirm-password"
          on_change={set_confirm_password}
          on_key_down={(e) => e["key"] === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_confirm(!show_confirm)}
          placeholder={t("settings.re_enter_new_password")}
          show_password={show_confirm}
          status={error ? "error" : "default"}
          value={confirm_password}
        />
      </div>
    </div>
  );

  const render_remove_content = () => (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
        }}
      >
        <ExclamationTriangleIcon
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          style={{ color: "var(--color-danger)" }}
        />
        <div>
          <p className="text-[13px] font-medium mb-0.5 text-txt-primary">
            {t("settings.remove_protection_warning_title")}
          </p>
          <p className="text-[12px] text-txt-secondary">
            {t("settings.remove_protection_warning_desc")}
          </p>
        </div>
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-2 text-txt-primary"
          htmlFor="remove-password"
        >
          {t("settings.enter_password_to_confirm")}
        </label>
        <PasswordInput
          auto_focus
          id="remove-password"
          on_change={set_password_state}
          on_key_down={(e) => e["key"] === "Enter" && handle_submit()}
          on_toggle_visibility={() => set_show_password(!show_password)}
          placeholder={t("settings.enter_your_password")}
          show_password={show_password}
          status={error ? "error" : "default"}
          value={password}
        />
      </div>
    </div>
  );

  const get_title = () => {
    switch (internal_mode) {
      case "setup":
        return t("settings.protect_folder");
      case "unlock":
        return t("settings.unlock_folder");
      case "change":
        return t("settings.change_folder_password");
      case "remove":
        return t("settings.remove_folder_password");
      default:
        return t("settings.folder_password");
    }
  };

  const get_submit_label = () => {
    switch (internal_mode) {
      case "setup":
        return t("settings.set_password");
      case "unlock":
        return t("settings.unlock_button");
      case "change":
        return t("settings.update_password_button");
      case "remove":
        return t("settings.remove_protection");
      default:
        return t("settings.submit");
    }
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={handle_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1 }}
            className="relative w-full max-w-[400px] rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-txt-primary">
                    {get_title()}
                  </h2>
                  <p className="text-[13px] text-txt-muted">{folder_name}</p>
                </div>
                <button
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-txt-muted"
                  onClick={handle_close}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {mode === "settings" && (
                <div className="relative flex p-1 rounded-lg mb-4 bg-surf-tertiary">
                  <motion.div
                    className="absolute top-1 bottom-1 rounded-md bg-surf-card"
                    layoutId="tab-indicator"
                    style={{
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                      width: "calc(50% - 4px)",
                      left: internal_mode === "change" ? 4 : "calc(50% + 0px)",
                    }}
                    transition={{
                      type: "tween",
                      ease: "easeOut",
                      duration: reduce_motion ? 0 : 0.3,
                    }}
                  />
                  <button
                    className="relative flex-1 py-2 px-3 text-[13px] font-medium transition-colors z-10"
                    style={{
                      color:
                        internal_mode === "change"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    onClick={() => set_internal_mode("change")}
                  >
                    {t("settings.change_folder_password")}
                  </button>
                  <button
                    className="relative flex-1 py-2 px-3 text-[13px] font-medium transition-colors z-10"
                    style={{
                      color:
                        internal_mode === "remove"
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    onClick={() => set_internal_mode("remove")}
                  >
                    {t("settings.remove_protection")}
                  </button>
                </div>
              )}

              {internal_mode === "setup" &&
              is_feature_locked("has_password_protected_folders") ? (
                <UpgradeGate
                  description={t("settings.folder_lock_locked")}
                  feature_name={t("settings.protect_folder")}
                  is_locked={true}
                  min_plan="Nova"
                >
                  <div />
                </UpgradeGate>
              ) : (
                <>
                  {internal_mode === "setup" && render_setup_content()}
                  {internal_mode === "unlock" && render_unlock_content()}
                  {internal_mode === "change" && render_change_content()}
                  {internal_mode === "remove" && render_remove_content()}
                </>
              )}

              {error && (
                <p className="text-[13px] text-red-500 mt-4">{error}</p>
              )}
            </div>

            {!(
              internal_mode === "setup" &&
              is_feature_locked("has_password_protected_folders")
            ) && (
              <div className="flex justify-end gap-3 px-6 pb-6">
                <Button
                  disabled={is_loading}
                  size="xl"
                  variant="outline"
                  onClick={handle_close}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={is_loading}
                  size="xl"
                  variant={
                    internal_mode === "remove" ? "destructive" : "primary"
                  }
                  onClick={handle_submit}
                >
                  {is_loading && <Spinner size="md" />}
                  {is_loading ? t("common.processing") : get_submit_label()}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
