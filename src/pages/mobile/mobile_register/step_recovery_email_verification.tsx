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
import { motion } from "framer-motion";

import { use_registration } from "@/components/register/hooks/use_registration";
import { Spinner } from "@/components/ui/spinner";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_SECONDARY_CLASS,
} from "@/components/auth/mobile_auth_motion";

export interface step_recovery_email_verification_props {
  reg: ReturnType<typeof use_registration>;
  reduce_motion: boolean;
}

export function StepRecoveryEmailVerification({
  reg,
  reduce_motion,
}: step_recovery_email_verification_props) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6">
        <motion.div
          animate="animate"
          className="flex flex-col items-center"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          <motion.div
            className="flex items-center justify-center"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: reg.is_email_verified
                  ? "linear-gradient(180deg, #34d399 0%, #10b981 100%)"
                  : "linear-gradient(180deg, #6b8aff 0%, #4a7aff 100%)",
                boxShadow: reg.is_email_verified
                  ? "0 4px 12px rgba(16, 185, 129, 0.3)"
                  : "0 4px 12px rgba(74, 122, 255, 0.3)",
                transition: "background 0.3s ease, box-shadow 0.3s ease",
              }}
            >
              {reg.is_email_verified ? (
                <svg
                  className="h-8 w-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  className="h-8 w-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </motion.div>

          <motion.div
            className="mt-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center">
              {reg.is_email_verified
                ? reg.t("auth.recovery_email_verified")
                : reg.t("auth.check_your_inbox")}
            </h1>
          </motion.div>

          <motion.div
            className="mt-2"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <p className="text-sm text-[var(--text-tertiary)] text-center">
              {reg.is_email_verified
                ? reg.t("auth.recovery_email_verified_desc")
                : reg.t("auth.verification_email_sent_to_desc", {
                    email: reg.recovery_email.trim(),
                  })}
            </p>
          </motion.div>

          {reg.is_email_verified && reg.recovery_email_required && (
            <motion.div
              className="mt-4"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-400 text-center">
                {reg.t("auth.account_flagged_notice")}
              </div>
            </motion.div>
          )}

          {!reg.is_email_verified && (
            <motion.div
              className="mt-3"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <p className="text-xs text-[var(--text-muted)] text-center leading-relaxed">
                {reg.t("common.check_spam_folder_note")}
              </p>
            </motion.div>
          )}

          {!reg.is_email_verified && (
            <motion.div
              className="mt-6 flex items-center gap-2"
              variants={reduce_motion ? undefined : fade_up_item}
            >
              <Spinner className="text-[#4a7aff]" size="sm" />
              <span className="text-sm text-[var(--text-muted)]">
                {reg.t("auth.waiting_for_verification")}
              </span>
            </motion.div>
          )}
        </motion.div>
      </div>

      {!reg.is_email_verified && (
        <div className="shrink-0 px-6 pb-4 pt-4 space-y-3">
          <motion.button
            className={DEPTH_SECONDARY_CLASS}
            disabled={reg.resend_cooldown > 0 || reg.is_resending_verification}
            style={{
              opacity: reg.resend_cooldown > 0 ? 0.5 : 1,
            }}
            whileTap={reg.resend_cooldown > 0 ? undefined : button_tap}
            onClick={reg.handle_resend_verification}
          >
            {reg.resend_cooldown > 0
              ? reg.t("auth.resend_in_seconds", {
                  seconds: reg.resend_cooldown.toString(),
                })
              : reg.is_resending_verification
                ? reg.t("common.sending")
                : reg.t("auth.resend_verification_email")}
          </motion.button>
          {!reg.recovery_email_required && (
            <button
              className="w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
              type="button"
              onClick={reg.handle_skip_verification}
            >
              {reg.t("auth.skip_verification")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
