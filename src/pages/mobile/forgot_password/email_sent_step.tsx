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
import type { EmailSentStepProps } from "./types";

import { motion } from "framer-motion";

import {
  MobileActionRow,
  MobileStepHeader,
  StepError,
  TEXT_ACTION_CLASS,
} from "./step_frame";

import { use_i18n } from "@/lib/i18n/context";
import {
  stagger_container,
  fade_up_item,
} from "@/components/auth/mobile_auth_motion";

export function EmailSentStep({
  email,
  error,
  is_dark,
  reduce_motion,
  resend_cooldown,
  is_resending,
  on_change_account,
  on_resend,
  on_use_code,
  on_navigate_sign_in,
}: EmailSentStepProps) {
  const { t } = use_i18n();
  const resend_label =
    resend_cooldown > 0
      ? t("auth.resend_in_seconds", { seconds: resend_cooldown.toString() })
      : is_resending
        ? t("common.sending")
        : t("auth.resend_reset_link");

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-start px-6 pt-14"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.reset_link_sent_desc")}
          email={email}
          on_change_account={on_change_account}
          reduce_motion={reduce_motion}
          title={t("auth.reset_link_sent_title")}
        />

        <StepError
          error={error}
          is_dark={is_dark}
          reduce_motion={reduce_motion}
        />

        <motion.div
          className="mt-6 w-full"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <button
            className={TEXT_ACTION_CLASS}
            style={{ color: "var(--accent-color)" }}
            type="button"
            onClick={on_use_code}
          >
            {t("auth.reset_use_recovery_code")}
          </button>
        </motion.div>
      </motion.div>

      <MobileActionRow
        on_primary={on_navigate_sign_in}
        on_secondary={on_resend}
        primary_label={t("auth.back_to_sign_in")}
        reduce_motion={reduce_motion}
        secondary_disabled={resend_cooldown > 0 || is_resending}
        secondary_label={resend_label}
      />
    </div>
  );
}
