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
import { useState, useEffect, useRef } from "react";
import {
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { ButtonSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { user_facing_error } from "@/utils/user_facing_error";

interface KeyRotationModalProps {
  is_open: boolean;
  on_close: () => void;
  on_rotate: (password: string) => Promise<string | null>;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  removed_key_count?: number;
  is_manual?: boolean;
}

type RotationState = "idle" | "rotating" | "success" | "error";

export function KeyRotationModal({
  is_open,
  on_close,
  on_rotate,
  key_age_hours,
  key_fingerprint,
  removed_key_count = 0,
  is_manual = false,
}: KeyRotationModalProps) {
  const { t } = use_i18n();
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [state, set_state] = useState<RotationState>("idle");
  const [error, set_error] = useState("");
  const close_timeout_ref = useRef<number | null>(null);

  useEffect(() => {
    if (close_timeout_ref.current !== null) {
      window.clearTimeout(close_timeout_ref.current);
      close_timeout_ref.current = null;
    }
    if (is_open) {
      set_password("");
      set_error("");
      set_state("idle");
      set_show_password(false);
    }
  }, [is_open]);

  useEffect(() => {
    return () => {
      if (close_timeout_ref.current !== null) {
        window.clearTimeout(close_timeout_ref.current);
        close_timeout_ref.current = null;
      }
    };
  }, []);

  const format_key_age = (hours: number | null): string => {
    if (hours === null) return t("common.unknown_label");
    if (hours === 1) return t("settings.one_hour");
    if (hours < 24) return t("common.n_hours", { count: hours });
    const days = Math.floor(hours / 24);

    if (days === 1) return t("common.one_day");

    return t("common.n_days", { count: days });
  };

  const handle_submit = async () => {
    if (!password) {
      set_error(t("common.please_enter_password"));

      return;
    }

    const password_copy = password;

    set_error("");
    set_state("rotating");

    try {
      const rotation_error = await on_rotate(password_copy);

      if (rotation_error === null) {
        set_password("");
        set_state("success");
        close_timeout_ref.current = window.setTimeout(() => {
          close_timeout_ref.current = null;
          on_close();
        }, 1500);
      } else {
        set_state("error");
        set_error(rotation_error);
      }
    } catch (err) {
      set_state("error");
      set_error(user_facing_error(err, t("errors.an_error_occurred")));
    }
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e["key"] === "Enter" && password && state !== "rotating") {
      handle_submit();
    }
  };

  const handle_close = () => {
    if (state === "rotating") return;
    on_close();
  };

  const is_rotating = state === "rotating";

  return (
    <Modal
      close_on_escape={!is_rotating}
      close_on_overlay={!is_rotating}
      is_open={is_open}
      on_close={handle_close}
      show_close_button={!is_rotating}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>
          {is_manual
            ? t("settings.rotate_encryption_keys")
            : t("settings.key_rotation_required")}
        </ModalTitle>
        <ModalDescription>
          {t("settings.forward_secrecy_protection")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        {state === "success" ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircleIcon
              className="w-10 h-10 mb-3"
              style={{ color: "var(--color-success)" }}
            />
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.keys_rotated_successfully")}
            </p>
            <p className="text-sm mt-1 text-txt-muted">
              {t("settings.encryption_keys_updated")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="px-3 py-2.5 space-y-2 rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-txt-muted">
                  {t("settings.current_key_age")}
                </span>
                <span className="text-sm font-medium text-txt-primary">
                  {format_key_age(key_age_hours)}
                </span>
              </div>
              {key_fingerprint && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-txt-muted">
                    {t("settings.key_fingerprint")}
                  </span>
                  <span className="text-xs font-mono text-txt-secondary break-all text-end">
                    {key_fingerprint}
                  </span>
                </div>
              )}
            </div>

            <p className="text-sm text-txt-secondary">
              {is_manual
                ? t("settings.rotate_keys_description_manual")
                : t("settings.rotate_keys_description_required")}
            </p>

            <div className="flex items-start gap-2 px-3 py-2 rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)]">
              {removed_key_count > 0 ? (
                <ExclamationTriangleIcon
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--color-warning)" }}
                />
              ) : (
                <CheckCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-txt-muted" />
              )}
              <p className="text-xs leading-relaxed text-txt-secondary">
                {removed_key_count > 0
                  ? t("settings.key_rotation_prune_warning", {
                      count: removed_key_count,
                    })
                  : t("settings.key_rotation_history_kept")}
              </p>
            </div>

            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="rotation-password"
              >
                {t("auth.password")}
              </label>
              <div className="relative">
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  autoComplete="current-password"
                  className="w-full pe-10"
                  disabled={is_rotating}
                  id="rotation-password"
                  maxLength={128}
                  placeholder={t("settings.enter_your_password_placeholder")}
                  status={error ? "error" : "default"}
                  type={show_password ? "text" : "password"}
                  value={password}
                  onChange={(e) => set_password(clamp_password(e.target.value))}
                  onKeyDown={handle_key_down}
                />
                <button
                  aria-label={
                    show_password
                      ? t("settings.hide_password_toggle")
                      : t("settings.show_password_toggle")
                  }
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted"
                  type="button"
                  onClick={() => set_show_password(!show_password)}
                >
                  {show_password ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-center text-red-500" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </ModalBody>
      {state !== "success" && (
        <ModalFooter>
          <Button
            disabled={is_rotating}
            variant="outline"
            onClick={handle_close}
          >
            {is_manual ? t("common.cancel") : t("common.later")}
          </Button>
          <Button
            disabled={is_rotating || !password}
            variant="depth"
            onClick={handle_submit}
          >
            {is_rotating ? t("settings.rotating") : t("settings.rotate_keys")}
            {is_rotating && <ButtonSpinner />}
          </Button>
        </ModalFooter>
      )}
    </Modal>
  );
}
