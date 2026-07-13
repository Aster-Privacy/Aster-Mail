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
import { useEffect, useRef, useState } from "react";
import { AcademicCapIcon, CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";

import {
  request_academic_verification,
  resend_academic_verification,
  type AcademicDiscountStatusResponse,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
  type TurnstileWidgetRef,
} from "@/components/auth/turnstile_widget";

const RESEND_COOLDOWN_SECONDS = 60;

interface AcademicDiscountSectionProps {
  academic_status: AcademicDiscountStatusResponse | null;
  refresh_academic_status: () => Promise<void>;
}

export function AcademicDiscountSection({
  academic_status,
  refresh_academic_status,
}: AcademicDiscountSectionProps) {
  const { t } = use_i18n();
  const [academic_email, set_academic_email] = useState("");
  const [submitting, set_submitting] = useState(false);
  const [resend_cooldown, set_resend_cooldown] = useState(0);
  const [copied, set_copied] = useState(false);
  const [turnstile_token, set_turnstile_token] = useState("");
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const captcha_required = !!TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (resend_cooldown <= 0) return;
    const timer = setInterval(
      () => set_resend_cooldown((v) => Math.max(0, v - 1)),
      1000,
    );

    return () => clearInterval(timer);
  }, [resend_cooldown]);

  useEffect(() => {
    const from_url = new URLSearchParams(window.location.search).get(
      "academic",
    );
    const result =
      from_url ?? sessionStorage.getItem("academic_discount_result");

    if (!result) return;

    sessionStorage.removeItem("academic_discount_result");

    if (result === "verified") {
      show_toast(t("settings.academic_verified_toast"), "success");
      refresh_academic_status();
    } else if (result === "failed") {
      show_toast(t("settings.academic_failed_toast"), "error");
    }
  }, [t, refresh_academic_status]);

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
      show_toast(t("settings.academic_verification_sent"), "success");
      set_resend_cooldown(RESEND_COOLDOWN_SECONDS);
      await refresh_academic_status();
    } finally {
      set_submitting(false);
    }
  };

  const handle_resend = async () => {
    if (resend_cooldown > 0 || submitting) return;
    set_submitting(true);
    try {
      const res = await resend_academic_verification();

      if (res.error) {
        show_toast(t("settings.academic_request_failed"), "error");

        return;
      }
      show_toast(t("settings.academic_verification_sent"), "success");
      set_resend_cooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      set_submitting(false);
    }
  };

  const handle_copy = async () => {
    if (!academic_status?.promo_code) return;
    try {
      await navigator.clipboard.writeText(academic_status.promo_code);
      set_copied(true);
      setTimeout(() => set_copied(false), 2000);
    } catch {
      show_toast(t("settings.academic_copy_failed"), "error");
    }
  };

  const status = academic_status?.status ?? "none";

  return (
    <div className="border-t border-edge-secondary pt-8">
      <div className="mb-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <AcademicCapIcon className="w-4 h-4 text-txt-primary flex-shrink-0" />
          {t("settings.academic_discount_title")}
        </h3>
        <p className="text-xs text-txt-muted mt-1">
          {t("settings.academic_discount_description")}
        </p>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      {status === "verified" && academic_status?.promo_code && (
        <div className="rounded-lg border border-edge-secondary px-4 py-4">
          <p className="text-xs text-txt-muted">
            {t("settings.academic_code_ready_title")}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="text-lg font-bold tracking-wide text-txt-primary">
              {academic_status.promo_code}
            </code>
            <button
              className="p-1.5 rounded-md hover:bg-surf-hover transition-colors"
              type="button"
              onClick={handle_copy}
            >
              {copied ? (
                <CheckIcon className="w-4 h-4 text-green-500" />
              ) : (
                <ClipboardIcon className="w-4 h-4 text-txt-muted" />
              )}
            </button>
          </div>
          <p className="text-xs text-txt-muted mt-2">
            {t("settings.academic_use_at_checkout")}
          </p>
          <p className="text-xs text-txt-muted mt-1">
            {t("settings.academic_terms")}
          </p>
        </div>
      )}

      {status === "pending" && (
        <div className="rounded-lg border border-edge-secondary px-4 py-4">
          <p className="text-sm text-txt-primary">
            {t("settings.academic_pending_title")}
          </p>
          <p className="text-xs text-txt-muted mt-1">
            {t("settings.academic_pending_description")}
          </p>
          <button
            className="aster_btn aster_btn_outline aster_btn_sm mt-3 disabled:opacity-50"
            disabled={resend_cooldown > 0 || submitting}
            type="button"
            onClick={handle_resend}
          >
            {resend_cooldown > 0
              ? t("settings.academic_resend_cooldown", {
                  seconds: String(resend_cooldown),
                })
              : t("settings.academic_resend")}
          </button>
        </div>
      )}

      {status === "none" && (
        <div className="rounded-lg border border-edge-secondary px-4 py-4">
          <p className="text-xs text-txt-muted mb-3">
            {t("settings.academic_intro")}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 h-10 px-3 rounded-lg border border-edge-secondary bg-transparent text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-blue-500"
              placeholder={t("settings.academic_email_placeholder")}
              type="email"
              value={academic_email}
              onChange={(e) => set_academic_email(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handle_submit();
              }}
            />
            <button
              className="aster_btn aster_btn_primary h-10 disabled:opacity-50"
              disabled={
                !academic_email.trim() ||
                submitting ||
                (captcha_required && !turnstile_token)
              }
              type="button"
              onClick={handle_submit}
            >
              {submitting
                ? t("settings.academic_sending")
                : t("settings.academic_send_verification")}
            </button>
          </div>
          {captcha_required && (
            <TurnstileWidget
              ref={turnstile_ref}
              class_name="flex justify-start mt-3"
              on_expire={() => set_turnstile_token("")}
              on_verify={(token) => set_turnstile_token(token)}
            />
          )}
          <p className="text-xs text-txt-muted mt-3">
            {t("settings.academic_journalist_hint")}
          </p>
        </div>
      )}
    </div>
  );
}
