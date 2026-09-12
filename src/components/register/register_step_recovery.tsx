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

import { motion, AnimatePresence } from "framer-motion";

import { Spinner } from "@/components/ui/spinner";
import {
  CopyIcon,
  OnboardingButton,
  OnboardingInput,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepRecoveryCodesProps {
  reg: UseRegistrationReturn;
}

const DownloadIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    <path
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RegisterStepRecoveryCodes = ({
  reg,
}: RegisterStepRecoveryCodesProps) => {
  const can_continue =
    reg.is_pdf_downloaded || reg.is_text_downloaded || reg.has_copied_key;

  return (
    <StepShell
      step_key="recovery_key"
      subtitle={reg.t("auth.recovery_key_only_way")}
      title={reg.t("auth.password_recovery_key")}
    >
      {reg.is_invited && reg.generated_email && (
        <div className="mb-4 flex flex-col items-center gap-0.5">
          <span className="text-xs text-txt-muted">
            {reg.t("auth.your_new_aster_address")}
          </span>
          <span
            className="text-sm font-semibold text-txt-primary notranslate"
            translate="no"
          >
            {reg.generated_email}
          </span>
        </div>
      )}

      <div
        className="relative w-full rounded-lg border border-black/[0.06] bg-black/[0.05] px-4 pb-10 pt-4 text-start dark:border-white/[0.08] dark:bg-white/[0.08]"
        role="button"
        tabIndex={0}
        onClick={() => reg.set_is_key_visible(!reg.is_key_visible)}
        onKeyDown={(e) => {
          if (e["key"] === "Enter" || e["key"] === " ") {
            e.preventDefault();
            reg.set_is_key_visible(!reg.is_key_visible);
          }
        }}
      >
        <span
          className="block break-all font-mono text-xs leading-relaxed text-txt-primary notranslate"
          style={{
            filter: reg.is_key_visible ? "none" : "blur(5px)",
            transition: "filter 0.2s ease",
            userSelect: reg.is_key_visible ? "text" : "none",
          }}
          translate="no"
        >
          {reg.recovery_codes.join(" ")}
        </span>
        <div className="absolute bottom-2 end-2 flex items-center gap-1">
          <button
            aria-label={reg.t("auth.save_key")}
            className="rounded-md p-1.5 text-txt-muted transition-colors hover:text-txt-primary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void reg.handle_download_txt();
            }}
          >
            <DownloadIcon />
          </button>
          <button
            aria-label={reg.t("auth.copy_key")}
            className="rounded-md p-1.5 text-txt-muted transition-colors hover:text-txt-primary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void reg.handle_copy_codes();
            }}
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={reg.is_downloading_key}
        variant="primary"
        onClick={reg.handle_download_key}
      >
        {reg.is_downloading_key
          ? reg.t("auth.downloading")
          : reg.t("auth.download_key_lower")}
      </OnboardingButton>

      {can_continue && (
        <SkipLink
          disabled={reg.is_downloading_key}
          label={reg.t("common.continue")}
          on_click={() => void reg.handle_advance_from_recovery_key()}
        />
      )}
    </StepShell>
  );
};

interface RegisterStepRecoveryEmailProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepRecoveryEmailVerification = ({
  reg,
}: RegisterStepRecoveryEmailProps) => {
  return (
    <StepShell
      step_key="recovery_email_verification"
      subtitle={
        reg.is_email_verified
          ? reg.t("auth.recovery_email_verified_desc")
          : reg.t("auth.verification_email_sent_to_desc", {
              email: reg.recovery_email.trim(),
            })
      }
      title={
        reg.is_email_verified
          ? reg.t("auth.recovery_email_verified")
          : reg.t("auth.check_your_inbox")
      }
    >
      {reg.is_email_verified && reg.recovery_email_required && (
        <div className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-medium text-black">
          {reg.t("auth.account_flagged_notice")}
        </div>
      )}

      {!reg.is_email_verified && (
        <>
          <div className="flex w-full items-center gap-3 rounded-lg border border-transparent bg-black/[0.05] px-3 py-2.5 dark:bg-white/[0.08]">
            <Spinner size="sm" />
            <span className="text-sm text-txt-secondary">
              {reg.t("auth.waiting_for_verification")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-txt-muted">
            {reg.t("common.check_spam_folder_note")}
          </p>

          <OnboardingButton
            className="mt-4 w-full"
            disabled={reg.resend_cooldown > 0 || reg.is_resending_verification}
            variant="secondary"
            onClick={reg.handle_resend_verification}
          >
            {reg.resend_cooldown > 0
              ? reg.t("auth.resend_in_seconds", {
                  seconds: reg.resend_cooldown.toString(),
                })
              : reg.is_resending_verification
                ? reg.t("common.sending")
                : reg.t("auth.resend_verification_email")}
          </OnboardingButton>

          {!reg.recovery_email_required && (
            <SkipLink
              label={reg.t("auth.skip_verification")}
              on_click={reg.handle_skip_verification}
            />
          )}
        </>
      )}
    </StepShell>
  );
};

export const RegisterStepRecoveryEmail = ({
  reg,
}: RegisterStepRecoveryEmailProps) => {
  return (
    <StepShell
      step_key="recovery_email"
      subtitle={reg.t("auth.recovery_email_step_desc")}
      title={reg.t("auth.password_recovery_email")}
    >
      {reg.recovery_email_required && (
        <div className="mb-4 w-full rounded-lg bg-amber-500 px-4 py-3 text-center text-sm font-medium text-black">
          {reg.t("auth.recovery_email_required_notice")}
        </div>
      )}

      <OnboardingInput
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        autoComplete="email"
        disabled={reg.is_saving_recovery_email}
        placeholder={reg.t("auth.backup_email_placeholder")}
        status={reg.recovery_email_error ? "error" : "default"}
        type="email"
        value={reg.recovery_email}
        onChange={(e) => {
          reg.set_recovery_email(e.target.value);
          if (reg.recovery_email_error) reg.set_recovery_email_error("");
        }}
        onKeyDown={(e) =>
          e["key"] === "Enter" &&
          !reg.is_saving_recovery_email &&
          reg.handle_recovery_email_continue()
        }
      />

      <AnimatePresence>
        {reg.recovery_email_error && (
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-2 text-start text-xs"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
            transition={{ duration: 0.15 }}
          >
            {reg.recovery_email_error}
          </motion.p>
        )}
      </AnimatePresence>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={reg.is_saving_recovery_email}
        is_loading={reg.is_saving_recovery_email}
        variant="primary"
        onClick={reg.handle_recovery_email_continue}
      >
        {reg.t("common.continue")}
      </OnboardingButton>

      {!reg.recovery_email_required && (
        <SkipLink
          disabled={reg.is_saving_recovery_email}
          label={reg.t("auth.skip_for_now")}
          on_click={() => void reg.handle_recovery_email_skip()}
        />
      )}
    </StepShell>
  );
};

interface RegisterStepRecoveryEmailGateProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepRecoveryEmailGate = ({
  reg,
}: RegisterStepRecoveryEmailGateProps) => {
  return (
    <StepShell
      step_key="recovery_email_gate"
      subtitle={reg.t("auth.recovery_email_required_gate_desc")}
      title={reg.t("auth.recovery_email_required_gate_title")}
    >
      <OnboardingInput
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        autoComplete="email"
        disabled={reg.is_saving_recovery_email}
        placeholder={reg.t("auth.backup_email_placeholder")}
        status={reg.recovery_email_error ? "error" : "default"}
        type="email"
        value={reg.recovery_email}
        onChange={(e) => {
          reg.set_recovery_email(e.target.value);
          if (reg.recovery_email_error) reg.set_recovery_email_error("");
        }}
        onKeyDown={(e) =>
          e["key"] === "Enter" &&
          !reg.is_saving_recovery_email &&
          reg.handle_recovery_email_gate_submit()
        }
      />

      <AnimatePresence>
        {reg.recovery_email_error && (
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-2 text-start text-xs"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{ color: reg.is_dark ? "#f87171" : "#dc2626" }}
            transition={{ duration: 0.15 }}
          >
            {reg.recovery_email_error}
          </motion.p>
        )}
      </AnimatePresence>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={reg.is_saving_recovery_email}
        is_loading={reg.is_saving_recovery_email}
        variant="primary"
        onClick={reg.handle_recovery_email_gate_submit}
      >
        {reg.t("common.continue")}
      </OnboardingButton>
    </StepShell>
  );
};
