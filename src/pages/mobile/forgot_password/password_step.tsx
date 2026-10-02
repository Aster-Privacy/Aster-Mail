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

import { motion } from "framer-motion";

import {
  MobileActionRow,
  MobileStepHeader,
  StepBackBar,
  StepError,
} from "./step_frame";

import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { PasswordStrengthIndicator } from "@/components/register/password_strength";
import {
  stagger_container,
  fade_up_item,
  DEPTH_INPUT_WRAPPER_CLASS,
  INNER_INPUT_CLASS,
  LABEL_CLASS,
} from "@/components/auth/mobile_auth_motion";

export function PasswordStep({
  email,
  password,
  set_password,
  confirm_password,
  set_confirm_password,
  is_password_visible,
  set_is_password_visible,
  is_confirm_visible,
  set_is_confirm_visible,
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_submit,
}: PasswordStepProps) {
  const { t } = use_i18n();
  const go_back = () => {
    set_error("");
    set_step("code");
  };

  return (
    <div className="flex flex-1 flex-col">
      <StepBackBar on_back={go_back} />

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-start overflow-y-auto px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.choose_strong_password")}
          email={email}
          reduce_motion={reduce_motion}
          show_logo={false}
          title={t("auth.create_new_password")}
        />

        <StepError
          error={error}
          is_dark={is_dark}
          reduce_motion={reduce_motion}
        />

        <motion.div
          className="mt-6 w-full space-y-4"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <div>
            <label className={LABEL_CLASS}>{t("settings.new_password")}</label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <Input
                autoComplete="new-password"
                className={INNER_INPUT_CLASS}
                maxLength={128}
                name="new_password"
                placeholder={t("auth.new_password_placeholder")}
                status={error ? "error" : "default"}
                type={is_password_visible ? "text" : "password"}
                value={password}
                onChange={(e) => set_password(clamp_password(e.target.value))}
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
                name="confirm_password"
                placeholder={t("auth.confirm_password_placeholder")}
                status={error ? "error" : "default"}
                type={is_confirm_visible ? "text" : "password"}
                value={confirm_password}
                onChange={(e) =>
                  set_confirm_password(clamp_password(e.target.value))
                }
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

      <MobileActionRow
        on_primary={on_submit}
        on_secondary={go_back}
        primary_label={t("auth.reset_password")}
        reduce_motion={reduce_motion}
        secondary_label={t("common.back")}
      />
    </div>
  );
}
