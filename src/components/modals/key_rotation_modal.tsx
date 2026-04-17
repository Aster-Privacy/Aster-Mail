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
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface KeyRotationModalProps {
  is_open: boolean;
  on_close: () => void;
  on_rotate: (password: string) => Promise<boolean>;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  is_manual?: boolean;
}

type RotationState = "idle" | "rotating" | "success" | "error";

export function KeyRotationModal({
  is_open,
  on_close,
  on_rotate,
  key_age_hours,
  key_fingerprint,
  is_manual = false,
}: KeyRotationModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [state, set_state] = useState<RotationState>("idle");
  const [error, set_error] = useState("");

  useEffect(() => {
    if (is_open) {
      set_password("");
      set_error("");
      set_state("idle");
      set_show_password(false);
    }
  }, [is_open]);

  const format_key_age = (hours: number | null): string => {
    if (hours === null) return t("common.unknown_label");
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
    set_password("");

    try {
      const success = await on_rotate(password_copy);

      if (success) {
        set_state("success");
        setTimeout(() => {
          on_close();
        }, 1500);
      } else {
        set_state("error");
        set_error(t("common.rotation_failed"));
      }
    } catch (err) {
      set_state("error");
      set_error(
        err instanceof Error ? err.message : t("errors.an_error_occurred"),
      );
    }
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e["key"] === "Enter" && password && state === "idle") {
      handle_submit();
    }
  };

  const handle_close = () => {
    if (state === "rotating") return;
    on_close();
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
            className="relative w-full max-w-[420px] rounded-xl border overflow-hidden"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <ShieldCheckIcon
                      className="w-5 h-5"
                      style={{ color: "var(--color-info)" }}
                    />
                  </div>
                  <div>
                    <h2
                      className="text-base font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {is_manual
                        ? t("settings.rotate_encryption_keys")
                        : t("settings.key_rotation_required")}
                    </h2>
                    <p
                      className="text-[13px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("settings.forward_secrecy_protection")}
                    </p>
                  </div>
                </div>
                {state !== "rotating" && (
                  <button
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    type="button"
                    onClick={handle_close}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {state === "success" ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="py-8 flex flex-col items-center"
                  initial={reduce_motion ? false : { opacity: 0 }}
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
                  >
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {t("settings.keys_rotated_successfully")}
                  </p>
                  <p
                    className="text-[13px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("settings.encryption_keys_updated")}
                  </p>
                </motion.div>
              ) : (
                <>
                  <div
                    className="p-3 rounded-lg mb-4"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {t("settings.current_key_age")}
                      </span>
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {format_key_age(key_age_hours)}
                      </span>
                    </div>
                    {key_fingerprint && (
                      <div className="flex justify-between items-center">
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {t("settings.key_fingerprint")}
                        </span>
                        <span
                          className="text-[11px] font-mono"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {key_fingerprint}
                        </span>
                      </div>
                    )}
                  </div>

                  <p
                    className="text-[13px] mb-4"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {is_manual
                      ? t("settings.rotate_keys_description_manual")
                      : t("settings.rotate_keys_description_required")}
                  </p>

                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      htmlFor="rotation-password"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t("auth.password")}
                    </label>
                    <div className="relative">
                      <Input
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="pr-11"
                        disabled={state === "rotating"}
                        id="rotation-password"
                        placeholder={t(
                          "settings.enter_your_password_placeholder",
                        )}
                        status={error ? "error" : "default"}
                        type={show_password ? "text" : "password"}
                        value={password}
                        onChange={(e) => set_password(e.target.value)}
                        onKeyDown={handle_key_down}
                      />
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center focus:outline-none text-txt-muted"
                        type="button"
                        onClick={() => set_show_password(!show_password)}
                      >
                        {show_password ? (
                          <EyeSlashIcon className="w-5 h-5" />
                        ) : (
                          <EyeIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div
                      className="flex items-center gap-2 mt-4 p-3 rounded-lg"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                      }}
                    >
                      <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-[13px] text-red-500">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {state !== "success" && (
              <div className="flex justify-end gap-3 px-6 pb-6">
                <Button
                  disabled={state === "rotating"}
                  size="xl"
                  variant="outline"
                  onClick={handle_close}
                >
                  {is_manual ? t("common.cancel") : t("common.later")}
                </Button>
                <Button
                  disabled={state === "rotating" || !password}
                  size="xl"
                  variant="depth"
                  onClick={handle_submit}
                >
                  {state === "rotating" && <Spinner size="md" />}
                  {state === "rotating"
                    ? t("settings.rotating")
                    : t("settings.rotate_keys")}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
