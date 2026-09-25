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
import type { OtherWaysStepProps } from "./types";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import {
  AddressIcon,
  HelpIcon,
  KeyIcon,
  MailIcon,
  OptionRow,
} from "@/pages/forgot_password/shared";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
} from "@/components/auth/mobile_auth_motion";

export function OtherWaysStep({
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_change_account,
  on_select_code,
  on_select_email,
  on_no_options,
}: OtherWaysStepProps) {
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
            set_step("code");
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
          {t("auth.other_ways_title")}
        </motion.h1>

        <motion.p
          className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.other_ways_desc")}
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

        <div className={`w-full space-y-3 ${error ? "mt-4" : "mt-6"}`}>
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <OptionRow
              description={t("auth.other_way_code_desc")}
              icon={<KeyIcon />}
              on_click={on_select_code}
              title={t("auth.other_way_code_title")}
            />
          </motion.div>
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <OptionRow
              description={t("auth.other_way_email_desc")}
              icon={<MailIcon />}
              on_click={on_select_email}
              title={t("auth.other_way_email_title")}
            />
          </motion.div>
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <OptionRow
              description={t("auth.change_account_desc")}
              icon={<AddressIcon />}
              on_click={on_change_account}
              title={t("auth.change_account")}
            />
          </motion.div>
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <OptionRow
              description={t("auth.other_way_none_desc")}
              icon={<HelpIcon />}
              on_click={on_no_options}
              title={t("auth.other_way_none_title")}
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
