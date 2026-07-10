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

import { useState } from "react";
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
  page_variants,
  page_transition,
} from "@/components/register/register_types";

interface RegisterStepAcademicOfferProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepAcademicOffer = ({
  reg,
}: RegisterStepAcademicOfferProps) => {
  const { t } = reg;
  const [academic_email, set_academic_email] = useState("");
  const [submitting, set_submitting] = useState(false);
  const [sent_to, set_sent_to] = useState("");
  const [show_journalist, set_show_journalist] = useState(false);

  const continue_to_plans = () => reg.set_step("plan_selection");

  const handle_submit = async () => {
    const email = academic_email.trim();

    if (!email || submitting) return;
    set_submitting(true);
    try {
      const res = await request_academic_verification(email);

      if (res.error) {
        if (res.error.includes("NOT_ACADEMIC_DOMAIN")) {
          show_toast(t("settings.academic_invalid_email"), "error");
        } else if (
          res.error.includes("EMAIL_ALREADY_USED") ||
          res.error.includes("ALREADY_VERIFIED")
        ) {
          show_toast(t("settings.academic_email_in_use"), "error");
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
        <div
          className="mt-8 flex items-center justify-center w-14 h-14 rounded-full"
          style={{ backgroundColor: "rgba(34, 197, 94, 0.12)" }}
        >
          <CheckCircleIcon className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold mt-6 text-txt-primary">
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
      <div
        className="mt-8 flex items-center justify-center w-14 h-14 rounded-full"
        style={{ backgroundColor: "rgba(37, 99, 235, 0.12)" }}
      >
        <AcademicCapIcon
          className="w-8 h-8"
          style={{ color: "var(--accent-blue)" }}
        />
      </div>

      <h1 className="text-2xl font-bold mt-6 text-txt-primary">
        {t("auth.academic_offer_headline")}
      </h1>
      <p className="text-sm mt-3 leading-relaxed text-txt-tertiary">
        {t("auth.academic_offer_subline")}
      </p>

      {!show_journalist ? (
        <div className="w-full mt-8 space-y-3 text-left">
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
          <Button
            className="w-full"
            disabled={!academic_email.trim() || submitting}
            size="xl"
            variant="depth"
            onClick={handle_submit}
          >
            {submitting
              ? t("settings.academic_sending")
              : t("auth.academic_offer_cta")}
          </Button>
          <button
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium py-2 hover:underline"
            style={{ color: "var(--accent-blue)" }}
            type="button"
            onClick={() => set_show_journalist(true)}
          >
            <NewspaperIcon className="w-4 h-4" />
            {t("auth.academic_offer_journalist_link")}
          </button>
        </div>
      ) : (
        <div className="w-full mt-8 space-y-3">
          <div className="w-full rounded-xl border border-edge-secondary px-4 py-4 text-left">
            <p className="text-sm leading-relaxed text-txt-secondary">
              {t("auth.academic_offer_journalist")}
            </p>
          </div>
          <Button
            className="w-full"
            size="xl"
            variant="depth"
            onClick={continue_to_plans}
          >
            {t("auth.academic_offer_continue")}
          </Button>
          <button
            className="w-full text-sm font-medium py-2 hover:underline"
            style={{ color: "var(--accent-blue)" }}
            type="button"
            onClick={() => set_show_journalist(false)}
          >
            {t("auth.academic_offer_student_link")}
          </button>
        </div>
      )}

      {!show_journalist && (
        <button
          className="mt-6 text-sm font-medium text-txt-tertiary hover:underline"
          type="button"
          onClick={continue_to_plans}
        >
          {t("auth.academic_offer_not_now")}
        </button>
      )}
    </motion.div>
  );
};
