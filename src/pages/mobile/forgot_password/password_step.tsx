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
import type { PasswordStepProps } from "./types";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { PasswordStrengthIndicator } from "@/components/register/password_strength";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_INPUT_WRAPPER_CLASS,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
  INNER_INPUT_CLASS,
  LABEL_CLASS,
} from "@/components/auth/mobile_auth_motion";

export function PasswordStep({
  password,
  set_password,
  confirm_password,
  set_confirm_password,
  is_password_visible,
  set_is_password_visible,
  is_confirm_visible,
  set_is_confirm_visible,
  is_email_recovery,
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_submit,
}: PasswordStepProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col">
      {!is_email_recovery && (
        <div className="flex items-center px-6 pt-4">
          <motion.button
            className={BACK_BUTTON_CLASS}
            style={BACK_BUTTON_STYLE}
            whileTap={button_tap}
            onClick={() => {
              set_error("");
              set_step("code");
            }}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </motion.button>
        </div>
      )}

      <motion.div
        animate="animate"
        className={`flex-1 overflow-y-auto px-6 ${is_email_recovery ? "pt-10" : "pt-4"}`}
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <motion.h1
          className="text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.create_new_password")}
        </motion.h1>

        <motion.p
          className="mt-2 text-sm text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.choose_strong_password")}
        </motion.p>

        <AnimatePresence>
          {error && (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center text-sm"
              exit={{ opacity: 0, y: -4 }}
              initial={{ opacity: 0, y: -4 }}
              style={{ color: is_dark ? "#f87171" : "#dc2626" }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.div
          className={`${error ? "mt-3" : "mt-6"} space-y-4`}
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <div>
            <label className={LABEL_CLASS}>{t("settings.new_password")}</label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <Input
                autoComplete="new-password"
                className={INNER_INPUT_CLASS}
                maxLength={128}
                placeholder={t("auth.new_password_placeholder")}
                status={error ? "error" : "default"}
                type={is_password_visible ? "text" : "password"}
                value={password}
                onChange={(e) => set_password(e.target.value)}
              />
              <button
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus:outline-none"
                type="button"
                onClick={() => set_is_password_visible(!is_password_visible)}
              >
                {is_password_visible ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
            <PasswordStrengthIndicator password={password} />
          </div>

          <div>
            <label className={LABEL_CLASS}>{t("auth.confirm_password")}</label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <Input
                autoComplete="new-password"
                className={INNER_INPUT_CLASS}
                maxLength={128}
                placeholder={t("auth.confirm_password_placeholder")}
                status={error ? "error" : "default"}
                type={is_confirm_visible ? "text" : "password"}
                value={confirm_password}
                onChange={(e) => set_confirm_password(e.target.value)}
                onKeyDown={(e) => e["key"] === "Enter" && on_submit()}
              />
              <button
                className="flex min-h-[44px] min-w-[44px] items-center justify-center focus:outline-none"
                type="button"
                onClick={() => set_is_confirm_visible(!is_confirm_visible)}
              >
                {is_confirm_visible ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className="shrink-0 space-y-3 px-6 pb-4 pt-4"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={
          reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }
        }
      >
        <motion.button
          className={DEPTH_CTA_CLASS}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={on_submit}
        >
          {t("auth.reset_password")}
        </motion.button>
        {!is_email_recovery && (
          <motion.button
            className={DEPTH_SECONDARY_CLASS}
            whileTap={button_tap}
            onClick={() => {
              set_error("");
              set_step("code");
            }}
          >
            {t("common.back")}
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}
