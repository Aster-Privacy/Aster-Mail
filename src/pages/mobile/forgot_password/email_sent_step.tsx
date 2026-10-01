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

import { use_i18n } from "@/lib/i18n/context";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
} from "@/components/auth/mobile_auth_motion";

export function EmailSentStep({
  email,
  reduce_motion,
  on_navigate_sign_in,
}: EmailSentStepProps) {
  const { t } = use_i18n();

  return (
    <motion.div
      animate="animate"
      className="flex flex-1 flex-col items-center justify-center px-6"
      initial={reduce_motion ? false : "initial"}
      variants={reduce_motion ? undefined : stagger_container}
    >
      <motion.h1
        className="text-center text-xl font-semibold text-[var(--text-primary)]"
        variants={reduce_motion ? undefined : fade_up_item}
      >
        {t("auth.reset_link_sent_title")}
      </motion.h1>

      <motion.p
        className="notranslate mt-1 max-w-full truncate text-center text-sm font-medium text-[var(--text-primary)]"
        variants={reduce_motion ? undefined : fade_up_item}
      >
        {email}
      </motion.p>

      <motion.p
        className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
        variants={reduce_motion ? undefined : fade_up_item}
      >
        {t("auth.reset_link_sent_desc")}
      </motion.p>

      <motion.button
        className={`mt-8 ${DEPTH_CTA_CLASS}`}
        style={DEPTH_CTA_STYLE}
        variants={reduce_motion ? undefined : fade_up_item}
        whileTap={button_tap}
        onClick={on_navigate_sign_in}
      >
        {t("auth.back_to_sign_in")}
      </motion.button>
    </motion.div>
  );
}
