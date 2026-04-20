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
import type { RegistrationStep } from "@/components/register/register_types";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { use_registration } from "@/components/register/hooks/use_registration";
import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";
import {
  page_slide_transition,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
} from "@/components/auth/mobile_auth_motion";
import { StepEmail } from "@/pages/mobile/mobile_register/step_email";
import { StepPassword } from "@/pages/mobile/mobile_register/step_password";
import { StepGenerating } from "@/pages/mobile/mobile_register/step_generating";
import { StepRecoveryKey } from "@/pages/mobile/mobile_register/step_recovery_key";
import { StepRecoveryEmail } from "@/pages/mobile/mobile_register/step_recovery_email";
import { StepRecoveryEmailVerification } from "@/pages/mobile/mobile_register/step_recovery_email_verification";
import { RegisterStepPlanSelection } from "@/components/register/register_step_plan_selection";

const MOBILE_STEP_ORDER = [
  "email",
  "password",
  "generating",
  "recovery_key",
  "recovery_email",
  "recovery_email_verification",
  "plan_selection",
] as const;

function get_step_progress(step: string): number {
  const index = MOBILE_STEP_ORDER.indexOf(
    step as (typeof MOBILE_STEP_ORDER)[number],
  );

  if (index === -1) return 0;

  return ((index + 1) / MOBILE_STEP_ORDER.length) * 100;
}

const BACK_MAP: Record<string, RegistrationStep> = {
  password: "email",
  recovery_email: "recovery_key",
  recovery_email_verification: "recovery_email",
};

export default function MobileRegisterPage() {
  const reg = use_registration();
  const navigate = useNavigate();
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();
  const direction = useRef(1);
  const [show_leave_confirmation, set_show_leave_confirmation] =
    useState(false);

  useEffect(() => {
    if (reg.step === "welcome") {
      reg.set_step("email");
    }
  }, []);

  const effective_step = reg.step === "welcome" ? "email" : reg.step;

  if (reg.auth_loading || reg.has_existing_session) {
    return null;
  }

  const handle_back = () => {
    if (reg.step === "recovery_key") {
      set_show_leave_confirmation(true);

      return;
    }
    const prev = BACK_MAP[reg.step];

    if (prev) {
      direction.current = -1;
      reg.set_step(prev);
    }
  };

  const go_forward = (step: RegistrationStep) => {
    direction.current = 1;
    reg.set_step(step);
  };

  const get_slide_variants = () => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  });

  const show_back =
    effective_step !== "email" &&
    effective_step !== "generating" &&
    effective_step !== "plan_selection";
  const show_progress =
    effective_step !== "generating" && effective_step !== "plan_selection";

  const render_step = () => {
    switch (effective_step) {
      case "email":
        return (
          <StepEmail
            navigate={navigate}
            reduce_motion={reduce_motion}
            reg={reg}
          />
        );

      case "password":
        return (
          <StepPassword
            navigate={navigate}
            reduce_motion={reduce_motion}
            reg={reg}
          />
        );

      case "generating":
        return <StepGenerating reg={reg} />;

      case "recovery_key":
        return (
          <StepRecoveryKey
            go_forward={go_forward}
            navigate={navigate}
            reduce_motion={reduce_motion}
            reg={reg}
            set_show_leave_confirmation={set_show_leave_confirmation}
            show_leave_confirmation={show_leave_confirmation}
          />
        );

      case "recovery_email":
        return <StepRecoveryEmail reduce_motion={reduce_motion} reg={reg} />;

      case "recovery_email_verification":
        return (
          <StepRecoveryEmailVerification
            reduce_motion={reduce_motion}
            reg={reg}
          />
        );

      case "plan_selection":
        return <RegisterStepPlanSelection reg={reg} />;

      default:
        return null;
    }
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-[100dvh] flex-col bg-[var(--bg-primary)]"
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        paddingTop: safe_area_insets.top,
        paddingBottom: safe_area_insets.bottom,
      }}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
    >
      {show_progress && (
        <div className="shrink-0 px-6 pt-4 pb-2">
          <div className="flex items-center gap-3">
            {show_back ? (
              <motion.button
                className={BACK_BUTTON_CLASS}
                style={BACK_BUTTON_STYLE}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={handle_back}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M15 19l-7-7 7-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
            ) : reg.step === "email" && !reg.is_adding_account ? (
              <motion.button
                className={BACK_BUTTON_CLASS}
                style={BACK_BUTTON_STYLE}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate("/welcome")}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M15 19l-7-7 7-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.button>
            ) : (
              <div className="h-10 w-10 shrink-0" />
            )}
            <img
              alt="Aster"
              className="h-6 shrink-0"
              decoding="async"
              src="/text_logo.png"
            />
            <div className="h-1 flex-1 rounded-full bg-[var(--border-secondary)] overflow-hidden">
              <motion.div
                animate={{ width: `${get_step_progress(effective_step)}%` }}
                className="h-full rounded-full bg-gradient-to-r from-[#4a7aff] to-[#6b8aff]"
                initial={false}
                transition={
                  reduce_motion
                    ? { duration: 0 }
                    : { duration: 0.4, ease: "easeOut" }
                }
              />
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={effective_step}
          animate="animate"
          className={`flex flex-1 min-h-0 flex-col ${effective_step === "plan_selection" ? "overflow-y-auto" : "overflow-hidden"}`}
          exit="exit"
          initial={
            effective_step === "generating" || reduce_motion
              ? false
              : "initial"
          }
          transition={reduce_motion ? { duration: 0 } : page_slide_transition}
          variants={reduce_motion ? undefined : get_slide_variants()}
        >
          {render_step()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
