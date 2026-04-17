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
import { motion, AnimatePresence } from "framer-motion";

import { use_registration } from "@/components/register/hooks/use_registration";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { EnvelopeIcon } from "@/components/auth/auth_styles";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_INPUT_WRAPPER_CLASS,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  LABEL_CLASS,
  INNER_INPUT_WITH_ICON_CLASS,
  INPUT_ICON_CLASS,
} from "@/components/auth/mobile_auth_motion";

export interface step_recovery_email_props {
  reg: ReturnType<typeof use_registration>;
  reduce_motion: boolean;
}

export function StepRecoveryEmail({
  reg,
  reduce_motion,
}: step_recovery_email_props) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6">
        <motion.div
          animate="animate"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {reg.t("auth.add_backup_email")}
            </h1>
          </motion.div>

          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {reg.t("auth.optional_backup_email_desc")}
            </p>
          </motion.div>

          <AnimatePresence>
            {reg.recovery_email_error && (
              <motion.p
                animate={{ opacity: 1 }}
                className="mt-4 text-center text-sm"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
              >
                {reg.recovery_email_error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.div
            className="mt-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <label className={LABEL_CLASS}>
              {reg.t("common.recovery_email")}
            </label>
            <div className={DEPTH_INPUT_WRAPPER_CLASS}>
              <div className={INPUT_ICON_CLASS}>
                <EnvelopeIcon />
              </div>
              <Input
                autoComplete="email"
                className={INNER_INPUT_WITH_ICON_CLASS}
                disabled={reg.is_saving_recovery_email}
                placeholder="backup@email.com"
                status={reg.recovery_email_error ? "error" : "default"}
                type="email"
                value={reg.recovery_email}
                onChange={(e) => {
                  reg.set_recovery_email(e.target.value);
                  reg.set_recovery_email_error("");
                }}
                onKeyDown={(e) =>
                  e["key"] === "Enter" && reg.handle_recovery_email_continue()
                }
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="shrink-0 px-6 pb-4 pt-4 space-y-3">
        <motion.button
          className={DEPTH_CTA_CLASS}
          disabled={reg.is_saving_recovery_email}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={reg.handle_recovery_email_continue}
        >
          {reg.is_saving_recovery_email ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="sm" />
              {reg.t("common.saving")}
            </span>
          ) : (
            reg.t("common.continue")
          )}
        </motion.button>
        {!reg.recovery_email_required && (
          <button
            className="w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
            disabled={reg.is_saving_recovery_email}
            type="button"
            onClick={reg.handle_recovery_email_skip}
          >
            {reg.t("auth.skip_for_now")}
          </button>
        )}
      </div>
    </div>
  );
}
