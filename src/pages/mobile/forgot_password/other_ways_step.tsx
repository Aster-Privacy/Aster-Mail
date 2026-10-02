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

import { motion } from "framer-motion";

import {
  MobileStepHeader,
  StepBackBar,
  StepError,
  TEXT_ACTION_CLASS,
} from "./step_frame";

import { use_i18n } from "@/lib/i18n/context";
import {
  KeyIcon,
  MailIcon,
  OptionGroup,
  OptionRow,
} from "@/pages/forgot_password/shared";
import {
  stagger_container,
  fade_up_item,
} from "@/components/auth/mobile_auth_motion";

export function OtherWaysStep({
  email,
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
      <StepBackBar
        on_back={() => {
          set_error("");
          set_step("email");
        }}
      />

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-start px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.other_ways_desc")}
          email={email}
          on_change_account={on_change_account}
          reduce_motion={reduce_motion}
          title={t("auth.other_ways_title")}
        />

        <StepError error={error} is_dark={is_dark} />

        <motion.div
          className="mt-6 w-full"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <OptionGroup>
            <OptionRow
              description={t("auth.other_way_code_desc")}
              icon={<KeyIcon />}
              on_click={on_select_code}
              title={t("auth.other_way_code_title")}
            />
            <OptionRow
              description={t("auth.other_way_email_desc")}
              icon={<MailIcon />}
              on_click={on_select_email}
              title={t("auth.other_way_email_title")}
            />
          </OptionGroup>
        </motion.div>

        <motion.div
          className="mt-6 flex w-full justify-center"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <button
            className={TEXT_ACTION_CLASS}
            style={{ color: "var(--accent-color)" }}
            type="button"
            onClick={on_no_options}
          >
            {t("auth.other_way_none_title")}
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
