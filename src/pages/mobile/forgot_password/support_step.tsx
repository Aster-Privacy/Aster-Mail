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
import type { SupportStepProps } from "./types";

import { motion } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
} from "@/components/auth/mobile_auth_motion";

export function SupportStep({
  reduce_motion,
  set_error,
  set_step,
  on_email_support,
  on_help_center,
}: SupportStepProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center px-6 pt-4">
        <motion.button
          className={BACK_BUTTON_CLASS}
          style={BACK_BUTTON_STYLE}
          whileTap={button_tap}
          onClick={() => {
            set_error("");
            set_step("other_ways");
          }}
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
        <motion.img
          alt="Aster"
          className="h-8"
          decoding="async"
          draggable={false}
          src="/text_logo.png"
          variants={reduce_motion ? undefined : fade_up_item}
        />

        <motion.h1
          className="mt-6 text-center text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.support_step_title")}
        </motion.h1>

        <motion.p
          className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.support_step_desc")}
        </motion.p>
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
          onClick={on_email_support}
        >
          {t("auth.support_email_action")}
        </motion.button>
        <button
          className="w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
          type="button"
          onClick={on_help_center}
        >
          {t("auth.support_help_center")}
        </button>
      </motion.div>
    </div>
  );
}
