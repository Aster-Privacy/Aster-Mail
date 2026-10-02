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

import { MobileActionRow, MobileStepHeader } from "./step_frame";

import { use_i18n } from "@/lib/i18n/context";
import { ReviewRow } from "@/pages/forgot_password/shared";
import {
  stagger_container,
  fade_up_item,
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
        className="flex flex-1 flex-col items-start overflow-y-auto px-6 pt-10"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.review_security_desc")}
          reduce_motion={reduce_motion}
          title={t("auth.review_security_title")}
        />

        <motion.div
          className="mt-6 w-full divide-y divide-[var(--border-secondary)] border-y border-[var(--border-secondary)]"
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
              count: review.codes_remaining,
            })}
          />
        </motion.div>
      </motion.div>

      <MobileActionRow
        on_primary={on_navigate_sign_in}
        primary_label={t("auth.sign_in")}
        reduce_motion={reduce_motion}
      />
    </div>
  );
}
