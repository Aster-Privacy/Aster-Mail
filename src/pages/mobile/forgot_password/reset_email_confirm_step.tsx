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
import type { ResetEmailConfirmStepProps } from "./types";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import { WarningIcon } from "@/pages/forgot_password/shared";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
} from "@/components/auth/mobile_auth_motion";

export function ResetEmailConfirmStep({
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_send_reset_link,
}: ResetEmailConfirmStepProps) {
  const { t } = use_i18n();

  const go_back = () => {
    set_error("");
    set_step("other_ways");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center px-6 pt-4">
        <motion.button
          className={BACK_BUTTON_CLASS}
          style={BACK_BUTTON_STYLE}
          whileTap={button_tap}
          onClick={go_back}
        >
          <ChevronLeftIcon className="h-5 w-5 rtl:-scale-x-100" />
        </motion.button>
      </div>

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-center px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full text-[#f59e0b]"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <WarningIcon />
        </motion.div>

        <motion.h1
          className="mt-6 text-center text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.reset_account_title")}
        </motion.h1>

        <motion.p
          className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.reset_account_desc")}
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
          onClick={on_send_reset_link}
        >
          {t("auth.send_reset_link")}
        </motion.button>
        <motion.button
          className={DEPTH_SECONDARY_CLASS}
          whileTap={button_tap}
          onClick={go_back}
        >
          {t("common.back")}
        </motion.button>
      </motion.div>
    </div>
  );
}
