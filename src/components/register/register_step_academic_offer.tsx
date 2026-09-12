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

import { useEffect, useRef, useState } from "react";
import { AcademicCapIcon, NewspaperIcon } from "@heroicons/react/24/outline";

import {
  request_academic_verification,
  get_academic_discount_status,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
  type TurnstileWidgetRef,
} from "@/components/auth/turnstile_widget";
import {
  OnboardingButton,
  OnboardingInput,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";
import {
  read_offer_prefill,
  type OfferRole,
} from "@/components/register/academic_offer_prefill";
import { is_composing } from "@/utils/ime";

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

  const looks_like_email = (value: string) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
  const can_auto_send =
    prefill.has_offer &&
    prefill.role === "student" &&
    looks_like_email(prefill.email);
  const [auto_sending, set_auto_sending] = useState(
    can_auto_send && !captcha_required,
  );
  const [verified, set_verified] = useState(false);
  const auto_send_done = useRef(false);

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

  useEffect(() => {
    if (auto_send_done.current) return;
    if (can_auto_send && !captcha_required) {
      auto_send_done.current = true;
      void (async () => {
        await handle_submit();
        set_auto_sending(false);
      })();
    }
  }, []);

  useEffect(() => {
    if (auto_send_done.current) return;
    if (can_auto_send && captcha_required && turnstile_token) {
      auto_send_done.current = true;
      void handle_submit();
    }
  }, [turnstile_token]);

  useEffect(() => {
    if (!sent_to || verified) return;
    let cancelled = false;
    const check = async () => {
      const res = await get_academic_discount_status();

      if (!cancelled && res.data?.status === "verified") set_verified(true);
    };
    const id = setInterval(check, 4000);

    void check();

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sent_to, verified]);

  useEffect(() => {
    if (!verified) return;
    const id = setTimeout(() => continue_to_plans(), 2000);

    return () => clearTimeout(id);
  }, [verified]);

  if (auto_sending && !sent_to) {
    return (
      <StepShell
        step_key="academic_offer_sending"
        subtitle={t("auth.academic_offer_sending_body", {
          email: academic_email,
        })}
        title={t("auth.academic_offer_sending_title")}
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent-color)]" />
        </div>
      </StepShell>
    );
  }

  if (sent_to) {
    return (
      <StepShell
        step_key="academic_offer_sent"
        subtitle={
          verified
            ? t("auth.academic_verified_body")
            : t("auth.academic_offer_sent", { email: sent_to })
        }
        title={
          verified
            ? t("auth.academic_verified_title")
            : t("auth.academic_offer_sent_title")
        }
      >
        <OnboardingButton
          className="w-full"
          variant="primary"
          onClick={continue_to_plans}
        >
          {verified
            ? t("auth.academic_verified_continue")
            : t("auth.academic_offer_continue")}
        </OnboardingButton>
      </StepShell>
    );
  }

  return (
    <StepShell
      step_key="academic_offer"
      subtitle={t("auth.academic_offer_subline")}
      title={t("auth.academic_offer_headline")}
    >
      <div
        className="grid w-full grid-cols-2 gap-1 rounded-lg bg-black/[0.05] p-1 dark:bg-white/[0.08]"
        role="tablist"
      >
        <button
          aria-selected={role === "student"}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
            role === "student"
              ? "bg-[var(--accent-color)] text-[var(--accent-color-foreground,#fff)]"
              : "text-txt-tertiary hover:text-txt-primary"
          }`}
          role="tab"
          type="button"
          onClick={() => set_role("student")}
        >
          <AcademicCapIcon className="h-4 w-4" />
          {t("auth.academic_offer_student_link")}
        </button>
        <button
          aria-selected={role === "journalist"}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
            role === "journalist"
              ? "bg-[var(--accent-color)] text-[var(--accent-color-foreground,#fff)]"
              : "text-txt-tertiary hover:text-txt-primary"
          }`}
          role="tab"
          type="button"
          onClick={() => set_role("journalist")}
        >
          <NewspaperIcon className="h-4 w-4" />
          {t("auth.academic_offer_journalist_link")}
        </button>
      </div>

      {role === "student" ? (
        <div className="mt-4 w-full space-y-3 text-start">
          <OnboardingInput
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            inputMode="email"
            placeholder={t("settings.academic_email_placeholder")}
            type="email"
            value={academic_email}
            onChange={(e) => set_academic_email(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !is_composing(e)) handle_submit();
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
          <OnboardingButton
            className="w-full"
            disabled={
              !academic_email.trim() ||
              submitting ||
              (captcha_required && !turnstile_token)
            }
            is_loading={submitting}
            variant="primary"
            onClick={handle_submit}
          >
            {t("auth.academic_offer_cta")}
          </OnboardingButton>
        </div>
      ) : (
        <div className="mt-4 w-full space-y-3">
          <ol className="w-full space-y-3 rounded-lg bg-black/[0.05] px-4 py-4 text-start dark:bg-white/[0.08]">
            {[
              t("auth.academic_offer_j_step1"),
              t("auth.academic_offer_j_step2"),
              t("auth.academic_offer_j_step3"),
            ].map((text, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="shrink-0 text-xs font-semibold text-[var(--accent-color)]">
                  {idx + 1}.
                </span>
                <span className="text-xs leading-relaxed text-txt-secondary">
                  {text}
                </span>
              </li>
            ))}
          </ol>
          <OnboardingButton
            className="w-full"
            variant="primary"
            onClick={continue_to_plans}
          >
            {t("auth.academic_offer_continue")}
          </OnboardingButton>
        </div>
      )}

      <SkipLink
        label={t("auth.academic_offer_not_now")}
        on_click={continue_to_plans}
      />
    </StepShell>
  );
};
