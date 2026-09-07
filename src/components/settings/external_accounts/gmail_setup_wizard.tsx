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
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Modal, ModalTitle } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TestResultBanner } from "@/components/settings/external_accounts/test_result_banner";

const TWO_STEP_URL =
  "https://myaccount.google.com/signinoptions/two-step-verification";
const APP_PASSWORD_URL = "https://myaccount.google.com/apppasswords";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL_STEPS = 4;

const STEP_ICONS = [
  LockClosedIcon,
  KeyIcon,
  EnvelopeIcon,
  CheckCircleIcon,
] as const;

interface GmailSetupWizardProps {
  form_email: string;
  form_password: string;
  handle_email_change: (email: string) => void;
  handle_password_change: (password: string) => void;
  handle_test_connection: () => void;
  handle_submit: () => void;
  close_form: () => void;
  is_testing: boolean;
  is_submitting: boolean;
  is_form_busy: boolean;
  test_result: { success: boolean; message: string } | null;
  t: TranslationFn;
}

export function GmailSetupWizard({
  form_email,
  form_password,
  handle_email_change,
  handle_password_change,
  handle_test_connection,
  handle_submit,
  close_form,
  is_testing,
  is_submitting,
  is_form_busy,
  test_result,
  t,
}: GmailSetupWizardProps) {
  const [step, set_step] = useState(1);
  const [show_password, set_show_password] = useState(false);

  const email_is_valid = EMAIL_PATTERN.test(form_email.trim());
  const password_is_filled = form_password.trim() !== "";
  const can_advance =
    (step !== 3 || email_is_valid) && (step !== 4 || password_is_filled);
  const StepIcon = STEP_ICONS[step - 1];

  const go_back = () => {
    if (step === 1) {
      close_form();

      return;
    }

    set_step(step - 1);
  };

  const go_forward = () => {
    if (step === TOTAL_STEPS) {
      handle_submit();

      return;
    }

    set_step(step + 1);
  };

  return (
    <Modal
      close_on_overlay={false}
      is_open={true}
      on_close={close_form}
      show_close_button={false}
      size="md"
    >
      <div className="px-6 pt-6 pb-4 border-b rounded-t-xl bg-modal-bg border-edge-primary">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-surf-secondary flex-shrink-0">
            <img
              alt=""
              aria-hidden="true"
              className="w-6 h-6 object-contain"
              src="/providers/gmail_logo.svg"
            />
          </div>
          <div className="min-w-0">
            <ModalTitle className="text-[15px]">
              {t("settings.gmail_wizard_title")}
            </ModalTitle>
            <p className="text-[12px] mt-0.5 text-txt-muted">
              {t("settings.gmail_wizard_progress", {
                current: step,
                total: TOTAL_STEPS,
              })}
            </p>
          </div>
        </div>
        <div aria-hidden="true" className="flex gap-1.5 mt-4">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <div
              key={index}
              className={
                index < step
                  ? "h-1 flex-1 rounded-full bg-accent-primary"
                  : "h-1 flex-1 rounded-full bg-surf-tertiary"
              }
            />
          ))}
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        <div className="flex items-start gap-3">
          <StepIcon className="w-5 h-5 mt-0.5 text-txt-muted flex-shrink-0" />
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold text-txt-primary">
              {step === 1 && t("settings.gmail_wizard_step_1_title")}
              {step === 2 && t("settings.gmail_wizard_step_2_title")}
              {step === 3 && t("settings.gmail_wizard_step_3_title")}
              {step === 4 && t("settings.gmail_wizard_step_4_title")}
            </h3>
            <p className="text-[13px] leading-relaxed text-txt-secondary">
              {step === 1 && t("settings.gmail_wizard_step_1_body")}
              {step === 2 && t("settings.gmail_wizard_step_2_body")}
              {step === 3 && t("settings.gmail_wizard_step_3_body")}
              {step === 4 && t("settings.gmail_wizard_step_4_body")}
            </p>
          </div>
        </div>

        {step === 1 && (
          <a
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-primary hover:underline"
            href={TWO_STEP_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("settings.gmail_wizard_step_1_action")}
            <ArrowTopRightOnSquareIcon className="w-4 h-4 rtl:-scale-x-100" />
          </a>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <a
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-primary hover:underline"
              href={APP_PASSWORD_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("settings.app_password_create_link")}
              <ArrowTopRightOnSquareIcon className="w-4 h-4 rtl:-scale-x-100" />
            </a>
            <p className="text-xs leading-relaxed text-txt-muted">
              {t("settings.gmail_sync_note_unavailable")}
            </p>
          </div>
        )}

        {step === 3 && (
          <div>
            <label
              className="text-xs font-medium mb-1 block text-txt-muted"
              htmlFor="gmail-wizard-email"
            >
              {t("settings.email_address")}
            </label>
            <Input
              autoComplete="email"
              className="w-full"
              id="gmail-wizard-email"
              maxLength={254}
              placeholder="you@gmail.com"
              type="email"
              value={form_email}
              onChange={(event) => handle_email_change(event.target.value)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div>
              <label
                className="text-xs font-medium mb-1 block text-txt-muted"
                htmlFor="gmail-wizard-password"
              >
                {t("settings.gmail_wizard_password_label")}
              </label>
              <div className="relative">
                <Input
                  autoComplete="off"
                  className="w-full pe-10"
                  id="gmail-wizard-password"
                  maxLength={256}
                  type={show_password ? "text" : "password"}
                  value={form_password}
                  onChange={(event) =>
                    handle_password_change(event.target.value)
                  }
                />
                <button
                  aria-label={t("settings.gmail_wizard_reveal_password")}
                  className="absolute inset-y-0 end-0 flex items-center px-3 text-txt-muted"
                  type="button"
                  onClick={() => set_show_password(!show_password)}
                >
                  {show_password ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {test_result && (
              <TestResultBanner label="IMAP" result={test_result} />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-edge-primary">
        <Button
          disabled={is_form_busy}
          size="sm"
          variant="ghost"
          onClick={go_back}
        >
          {step === 1 ? t("common.cancel") : t("common.back")}
        </Button>

        <div className="flex items-center gap-2">
          {step === TOTAL_STEPS && (
            <Button
              className="gap-1.5"
              disabled={!password_is_filled || is_form_busy}
              size="sm"
              variant="outline"
              onClick={handle_test_connection}
            >
              {is_testing && <Spinner size="md" />}
              {t("settings.test_connection")}
            </Button>
          )}
          <Button
            className="gap-1.5"
            disabled={!can_advance || is_form_busy}
            size="sm"
            onClick={go_forward}
          >
            {is_submitting && <Spinner size="md" />}
            {step === TOTAL_STEPS
              ? t("settings.gmail_wizard_connect")
              : t("common.next")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
