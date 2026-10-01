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
import type { CodeStepProps } from "./types";

import { motion } from "framer-motion";

import {
  MobileActionRow,
  MobileStepHeader,
  StepBackBar,
  StepError,
} from "./step_frame";

import { apply_input_transform } from "@/utils/input_transform";
import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import {
  stagger_container,
  fade_up_item,
  DEPTH_INPUT_WRAPPER_CLASS,
  INNER_INPUT_CLASS,
} from "@/components/auth/mobile_auth_motion";

export function CodeStep({
  email,
  recovery_code,
  set_recovery_code,
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_change_account,
  on_submit,
}: CodeStepProps) {
  const { t } = use_i18n();
  const try_another_way = () => {
    set_error("");
    set_step("other_ways");
  };

  return (
    <div className="flex flex-1 flex-col">
      <StepBackBar on_back={try_another_way} />

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-start px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <MobileStepHeader
          description={t("auth.enter_recovery_code_desc")}
          email={email}
          on_change_account={on_change_account}
          reduce_motion={reduce_motion}
          title={t("auth.enter_recovery_code")}
        />

        <motion.div
          className="mt-7 w-full"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <label
            className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
            htmlFor="mobile_recovery_code"
          >
            {t("auth.recovery_code_label")}
          </label>
          <div className={DEPTH_INPUT_WRAPPER_CLASS}>
            <Input
              autoComplete="off"
              id="mobile_recovery_code"
              className={INNER_INPUT_CLASS}
              placeholder="ASTER-XXXX-XXXX-XXXX-XXXX"
              status={error ? "error" : "default"}
              style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}
              type="text"
              value={recovery_code}
              onChange={(e) =>
                set_recovery_code(
                  apply_input_transform(e.target, (v) => v.toUpperCase()),
                )
              }
              onKeyDown={(e) => e["key"] === "Enter" && on_submit()}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            {t("auth.recovery_code_hint")}
          </p>
        </motion.div>

        <StepError error={error} is_dark={is_dark} />
      </motion.div>

      <MobileActionRow
        on_primary={on_submit}
        on_secondary={try_another_way}
        primary_label={t("common.continue")}
        reduce_motion={reduce_motion}
        secondary_label={t("auth.try_another_way")}
      />
    </div>
  );
}
