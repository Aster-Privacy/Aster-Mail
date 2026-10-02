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

import { motion } from "framer-motion";

import {
  MobileActionRow,
  MobileStepHeader,
  StepBackBar,
  StepError,
} from "./step_frame";

import { use_i18n } from "@/lib/i18n/context";
import { stagger_container } from "@/components/auth/mobile_auth_motion";

export function ResetEmailConfirmStep({
  email,
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_change_account,
  on_send_reset_link,
}: ResetEmailConfirmStepProps) {
  const { t } = use_i18n();

  const go_back = () => {
    set_error("");
    set_step("other_ways");
  };

  return (
    <div className="flex flex-1 flex-col">
      <StepBackBar on_back={go_back} />

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-start px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.reset_account_desc")}
          email={email}
          on_change_account={on_change_account}
          reduce_motion={reduce_motion}
          title={t("auth.reset_account_title")}
        />

        <StepError error={error} is_dark={is_dark} />
      </motion.div>

      <MobileActionRow
        on_primary={on_send_reset_link}
        on_secondary={go_back}
        primary_label={t("auth.send_reset_link")}
        reduce_motion={reduce_motion}
        secondary_label={t("common.back")}
      />
    </div>
  );
}
