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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AcademicCapIcon,
  CheckCircleIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Logo } from "@/components/auth/auth_styles";
import { request_academic_verification } from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
  type TurnstileWidgetRef,
} from "@/components/auth/turnstile_widget";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import {
  read_offer_prefill,
  type OfferRole,
} from "@/components/register/academic_offer_prefill";

interface RegisterStepAcademicOfferProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepAcademicOffer = ({
  reg,
}: RegisterStepAcademicOfferProps) => {
  const { t } = reg;
  const prefill = read_offer_prefill();
  const [role, set_role] = useState<OfferRole>(prefill.role);
  const [academic_email, set_academic_email] = useState(prefill.email);
  const [submitting, set_submitting] = useState(false);
  const [sent_to, set_sent_to] = useState("");
  const [turnstile_token, set_turnstile_token] = useState("");
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const captcha_required = !!TURNSTILE_SITE_KEY;

  const continue_to_plans = () => reg.set_step("plan_selection");

  const handle_submit = async () => {
    const email = academic_email.trim();

    if (!email || submitting) return;
    if (captcha_required && !turnstile_token) {
      show_toast(t("settings.academic_captcha_required"), "error");

      return;
    }
    set_submitting(true);
    try {
      const res = await request_academic_verification(email, turnstile_token);

      if (res.error) {
        turnstile_ref.current?.reset();
        set_turnstile_token("");
        if (res.error.includes("NOT_ACADEMIC_DOMAIN")) {
          show_toast(t("settings.academic_invalid_email"), "error");
        } else if (
          res.error.includes("EMAIL_ALREADY_USED") ||
          res.error.includes("ALREADY_VERIFIED")
        ) {
          show_toast(t("settings.academic_email_in_use"), "error");
        } else if (res.error.includes("CAPTCHA")) {
          show_toast(t("settings.academic_captcha_required"), "error");
        } else {
          show_toast(t("settings.academic_request_failed"), "error");
        }

        return;
      }
      set_sent_to(email);
    } finally {
      set_submitting(false);
    }
  };

  if (sent_to) {
    return (
      <motion.div
        key="academic_offer_sent"
        animate="animate"
        className="flex flex-col items-center w-full max-w-sm px-4 text-center"
        exit="exit"
        initial="initial"
        transition={page_transition}
        variants={page_variants}
      >
        <Logo />
        <CheckCircleIcon className="w-12 h-12 mt-8 text-green-500" />
        <h1 className="text-2xl font-bold mt-5 text-txt-primary">
          {t("auth.academic_offer_sent_title")}
        </h1>
        <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
          {t("auth.academic_offer_sent", { email: sent_to })}
        </p>
        <div className="w-full mt-8">
          <Button
            className="w-full"
            size="xl"
            variant="depth"
            onClick={continue_to_plans}
          >
            {t("auth.academic_offer_continue")}
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="academic_offer"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4 text-center"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />
      <AcademicCapIcon
        className="w-12 h-12 mt-8"
        style={{ color: "var(--accent-blue)" }}
      />

      <h1 className="text-2xl font-bold mt-5 text-txt-primary">
        {t("auth.academic_offer_headline")}
      </h1>
      <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
        {t("auth.academic_offer_subline")}
      </p>

      <div
        className="w-full mt-7 grid grid-cols-2 gap-1 p-1 rounded-full border border-edge-secondary"
        role="tablist"
      >
        <button
          aria-selected={role === "student"}
          className="h-10 rounded-full text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5"
          role="tab"
          style={
            role === "student"
              ? { backgroundColor: "var(--accent-blue)", color: "#ffffff" }
              : { color: "var(--text-tertiary)" }
          }
          type="button"
          onClick={() => set_role("student")}
        >
          <AcademicCapIcon className="w-4 h-4" />
          {t("auth.academic_offer_student_link")}
        </button>
        <button
          aria-selected={role === "journalist"}
          className="h-10 rounded-full text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5"
          role="tab"
          style={
            role === "journalist"
              ? { backgroundColor: "var(--accent-blue)", color: "#ffffff" }
              : { color: "var(--text-tertiary)" }
          }
          type="button"
          onClick={() => set_role("journalist")}
        >
          <NewspaperIcon className="w-4 h-4" />
          {t("auth.academic_offer_journalist_link")}
        </button>
      </div>

      {role === "student" ? (
        <div className="w-full mt-5 space-y-3 text-left">
          <input
            autoFocus
            className="w-full h-12 px-4 rounded-xl border border-edge-secondary bg-transparent text-[15px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-blue-500"
            inputMode="email"
            placeholder={t("settings.academic_email_placeholder")}
            type="email"
            value={academic_email}
            onChange={(e) => set_academic_email(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_submit();
            }}
          />
          {captcha_required && (
            <TurnstileWidget
              ref={turnstile_ref}
              class_name="flex justify-center"
              on_expire={() => set_turnstile_token("")}
              on_verify={(token) => set_turnstile_token(token)}
            />
          )}
          <Button
            className="w-full"
            disabled={
              !academic_email.trim() ||
              submitting ||
              (captcha_required && !turnstile_token)
            }
            size="xl"
            variant="depth"
            onClick={handle_submit}
          >
            {submitting
              ? t("settings.academic_sending")
              : t("auth.academic_offer_cta")}
          </Button>
        </div>
      ) : (
        <div className="w-full mt-5 space-y-3">
          <ol className="w-full rounded-xl border border-edge-secondary px-4 py-4 text-left space-y-3">
            {[
              t("auth.academic_offer_j_step1"),
              t("auth.academic_offer_j_step2"),
              t("auth.academic_offer_j_step3"),
            ].map((text, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span
                  className="text-sm font-bold shrink-0"
                  style={{ color: "var(--accent-blue)" }}
                >
                  {idx + 1}.
                </span>
                <span className="text-sm leading-relaxed text-txt-secondary">
                  {text}
                </span>
              </li>
            ))}
          </ol>
          <Button
            className="w-full"
            size="xl"
            variant="depth"
            onClick={continue_to_plans}
          >
            {t("auth.academic_offer_continue")}
          </Button>
        </div>
      )}

      <button
        className="mt-5 text-sm font-medium text-txt-tertiary hover:underline"
        type="button"
        onClick={continue_to_plans}
      >
        {t("auth.academic_offer_not_now")}
      </button>
    </motion.div>
  );
};
