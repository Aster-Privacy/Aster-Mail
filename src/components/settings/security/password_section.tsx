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
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { ActionRecommendedBadge } from "@/components/settings/security/recommendation_box";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

interface PasswordSectionProps {
  show_header?: boolean;
  last_password_change?: string | null;
  password_strength_tier?: number | null;
  show_password_section: boolean;
  set_show_password_section: (show: boolean) => void;
  current_password: string;
  set_current_password: (value: string) => void;
  new_password: string;
  set_new_password: (value: string) => void;
  confirm_password: string;
  set_confirm_password: (value: string) => void;
  show_current_password: boolean;
  set_show_current_password: (show: boolean) => void;
  show_new_password: boolean;
  set_show_new_password: (show: boolean) => void;
  password_loading: boolean;
  password_error: string;
  password_success: boolean;
  password_unreadable_notice?: string;
  password_breach_warning?: boolean;
  on_new_password_blur?: () => void;
  on_change_password: () => void;
  on_cancel: () => void;
}

export function PasswordSection({
  show_header = true,
  last_password_change,
  password_strength_tier,
  show_password_section,
  set_show_password_section,
  current_password,
  set_current_password,
  new_password,
  set_new_password,
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
  password_breach_warning,
  on_new_password_blur,
  on_change_password,
  on_cancel,
}: PasswordSectionProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();

  const can_submit =
    !password_loading &&
    !!current_password &&
    !!new_password &&
    !!confirm_password;

  const handle_password_key_down = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== "Enter" || !can_submit) return;
    event.preventDefault();
    on_change_password();
  };

  const get_strength_badge = () => {
    if (password_strength_tier === null || password_strength_tier === undefined)
      return null;

    if (password_strength_tier <= 1)
      return {
        label: t("common.password_strength_weak"),
        color: "var(--color-danger)",
      };
    if (password_strength_tier === 2)
      return {
        label: t("common.password_strength_fair"),
        color: "var(--color-warning)",
      };
    if (password_strength_tier === 3)
      return {
        label: t("common.password_strength_strong"),
        color: "var(--color-success)",
      };

    return {
      label: t("common.password_strength_very_secure"),
      color: "var(--color-success)",
    };
  };

  const strength_badge = get_strength_badge();
  const is_weak_password =
    password_strength_tier !== null &&
    password_strength_tier !== undefined &&
    password_strength_tier <= 2;

  const last_updated_label = last_password_change
    ? t("settings.password_last_updated", {
        date: new Date(last_password_change).toLocaleDateString(app_locale(), {
          timeZone: get_display_time_zone(),
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      })
    : null;

  return (
    <div className={show_header ? "pt-3" : undefined}>
      {show_header && (
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <KeyIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.password")}
            {is_weak_password && (
              <ActionRecommendedBadge
                tip={t("settings.password_weak_recommendation")}
              />
            )}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
      )}
      {!show_header && (
        <p className="text-sm font-medium text-txt-primary mb-2">
          {t("settings.password")}
        </p>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm tracking-widest text-txt-primary">
              ••••••••••••
            </span>
            {strength_badge && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: strength_badge.color }}
              >
                {password_strength_tier != null &&
                  password_strength_tier >= 4 && (
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                  )}
                {strength_badge.label}
              </span>
            )}
          </div>
          {last_updated_label ? (
            <p className="text-xs text-txt-muted mt-1">{last_updated_label}</p>
          ) : (
            <p className="text-sm text-txt-muted mt-1">
              {t("settings.change_password_description")}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => set_show_password_section(true)}
        >
          {t("settings.change_password")}
        </Button>
      </div>

      {password_unreadable_notice && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-txt-primary">
          {password_unreadable_notice}
        </div>
      )}

      <Modal
        close_on_escape={!password_loading}
        close_on_overlay={!password_loading}
        is_open={show_password_section}
        on_close={on_cancel}
        show_close_button={!password_loading}
        size="md"
        z_index={70}
      >
        <ModalHeader>
          <ModalTitle>{t("settings.change_password")}</ModalTitle>
          <ModalDescription>
            {t("settings.change_password_description")}
          </ModalDescription>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4" onKeyDown={handle_password_key_down}>
            <div
              className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
              style={{
                backgroundColor: "#b45309",
                color: "#fff",
              }}
            >
              <ExclamationTriangleIcon
                className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                style={{ color: "#fff" }}
              />
              <span>
                {t("settings.password_change_encrypted_data_warning")}
              </span>
            </div>

            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="current-password"
              >
                {t("settings.current_password")}
              </label>
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  className="pe-10"
                  disabled={password_loading}
                  id="current-password"
                  maxLength={128}
                  placeholder={t("settings.enter_current_password")}
                  type={show_current_password ? "text" : "password"}
                  value={current_password}
                  onChange={(e) =>
                    set_current_password(clamp_password(e.target.value))
                  }
                />
                <button
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted"
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
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="new-password"
              >
                {t("settings.new_password")}
              </label>
              <div className="relative">
                <Input
                  autoComplete="new-password"
                  className="pe-10"
                  disabled={password_loading}
                  id="new-password"
                  maxLength={128}
                  placeholder={t("settings.enter_new_password")}
                  type={show_new_password ? "text" : "password"}
                  value={new_password}
                  onBlur={on_new_password_blur}
                  onChange={(e) =>
                    set_new_password(clamp_password(e.target.value))
                  }
                />
                <button
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted"
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
              {password_breach_warning && (
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--color-warning, #f59e0b)" }}
                >
                  {t("settings.password_breach_warning")}
                </p>
              )}
            </div>

            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="confirm-new-password"
              >
                {t("settings.confirm_new_password")}
              </label>
              <Input
                autoComplete="new-password"
                disabled={password_loading}
                id="confirm-new-password"
                maxLength={128}
                placeholder={t("settings.confirm_new_password_placeholder")}
                type="password"
                value={confirm_password}
                onChange={(e) =>
                  set_confirm_password(clamp_password(e.target.value))
                }
              />
            </div>

            {password_error && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "#dc2626",
                  color: "#fff",
                }}
              >
                <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
                <span>{password_error}</span>
              </div>
            )}

            <AnimatePresence>
              {password_success && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg text-sm"
                  exit={{ opacity: 0, y: -10 }}
                  initial={reduce_motion ? false : { opacity: 0, y: -10 }}
                  style={{
                    backgroundColor: "#16a34a",
                    color: "#fff",
                  }}
                  transition={{ duration: reduce_motion ? 0 : 0.2 }}
                >
                  <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{t("settings.password_changed_signing_out")}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            disabled={password_loading}
            variant="outline"
            onClick={on_cancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!can_submit}
            variant="depth"
            onClick={on_change_password}
          >
            {password_loading
              ? t("settings.updating")
              : t("settings.update_password")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
