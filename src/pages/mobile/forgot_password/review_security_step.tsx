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
import type { ReviewSecurityStepProps } from "./types";

import { motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { ReviewRow } from "@/pages/forgot_password/shared";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
} from "@/components/auth/mobile_auth_motion";

export function ReviewSecurityStep({
  reduce_motion,
  review,
  on_navigate_sign_in,
}: ReviewSecurityStepProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-center overflow-y-auto px-6 pt-10"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <motion.div variants={reduce_motion ? undefined : fade_up_item}>
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>

        <motion.h1
          className="mt-6 text-center text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.review_security_title")}
        </motion.h1>

        <motion.p
          className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.review_security_desc")}
        </motion.p>

        <motion.div
          className="mt-6 w-full space-y-2"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <ReviewRow label={t("auth.review_devices_signed_out")} />
          {review.second_factors_removed && (
            <ReviewRow label={t("auth.review_two_step_off")} />
          )}
          <ReviewRow
            label={
              review.recovery_email_kept
                ? t("auth.review_recovery_email_kept")
                : t("auth.review_no_recovery_email")
            }
          />
          <ReviewRow
            label={t("auth.review_codes_left", {
              count: review.codes_remaining.toString(),
            })}
          />
        </motion.div>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className="shrink-0 px-6 pb-4 pt-4"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={
          reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }
        }
      >
        <motion.button
          className={DEPTH_CTA_CLASS}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={on_navigate_sign_in}
        >
          {t("auth.sign_in")}
        </motion.button>
      </motion.div>
    </div>
  );
}
