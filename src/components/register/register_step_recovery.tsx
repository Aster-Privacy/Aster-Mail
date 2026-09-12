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
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { SparkleOverlay } from "@/components/ui/sparkle_overlay";
import { show_toast } from "@/components/toast/simple_toast";
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

export const RegisterStepRecoveryCodes = ({
  reg,
}: RegisterStepRecoveryCodesProps) => {
  const has_saved = reg.is_pdf_downloaded || reg.is_text_downloaded;

  return (
    <StepShell
      step_key="recovery_key"
      subtitle={reg.t("auth.store_codes_safely")}
      title={reg.t("auth.save_recovery_codes")}
    >
      {reg.is_invited && reg.generated_email && (
        <div className="mb-4 flex flex-col gap-0.5">
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

      <div className="w-full">
        <div className="mb-2 flex h-8 items-center justify-between">
          <span className="text-sm font-medium text-txt-secondary">
            {reg.t("auth.n_recovery_codes", {
              count: reg.recovery_codes.length.toString(),
            })}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              aria-label={
                reg.is_key_visible
                  ? reg.t("common.hide")
                  : reg.t("settings.show_password_toggle")
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 hover:text-txt-primary dark:hover:bg-white/10"
              type="button"
              onClick={() => reg.set_is_key_visible(!reg.is_key_visible)}
            >
              {reg.is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
            <button
              aria-label={reg.t("auth.copy_key")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-black/5 hover:text-txt-primary dark:hover:bg-white/10"
              type="button"
              onClick={() => void reg.handle_copy_codes()}
            >
              <CopyIcon />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {reg.recovery_codes.map((code, index) => (
            <button
              key={index}
              className="relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-transparent bg-black/[0.05] px-4 py-2.5 text-start transition-colors hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
              type="button"
              onClick={() => {
                if (reg.is_key_visible) {
                  void reg.handle_copy_single_code(code);
                } else {
                  show_toast(reg.t("auth.click_eye_reveal"), "info");
                }
              }}
            >
              <span className="w-4 flex-shrink-0 text-xs tabular-nums text-txt-muted">
                {index + 1}
              </span>
              <span
                className="min-w-0 flex-1 overflow-hidden whitespace-nowrap font-mono text-sm tracking-wide text-txt-primary notranslate"
                style={{
                  filter: reg.is_key_visible ? "none" : "blur(4px)",
                  transition: "filter 0.2s ease",
                  userSelect: reg.is_key_visible ? "text" : "none",
                }}
                translate="no"
              >
                {code}
              </span>
              <SparkleOverlay is_active={!reg.is_key_visible} />
            </button>
          ))}
        </div>
      </div>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={reg.is_downloading_key}
        is_loading={reg.is_downloading_key}
        variant="primary"
        onClick={() => void reg.handle_download_key()}
      >
        {reg.t("auth.download_codes_pdf")}
      </OnboardingButton>

      <OnboardingButton
        className="mt-2 w-full"
        disabled={reg.is_downloading_key}
        variant="secondary"
        onClick={() => void reg.handle_download_txt()}
      >
        {reg.t("auth.download_as_text")}
      </OnboardingButton>

      <SkipLink
        disabled={reg.is_downloading_key}
        label={
          has_saved
            ? reg.t("common.continue")
            : reg.t("auth.continue_without_download")
        }
        on_click={() => {
          if (has_saved) {
            void reg.handle_advance_from_recovery_key();
          } else {
            reg.set_show_skip_confirmation(true);
          }
        }}
      />

      <ConfirmationModal
        cancel_text={reg.t("common.go_back")}
        confirm_text={reg.t("common.continue_anyway")}
        is_open={reg.show_skip_confirmation}
        message={reg.t("auth.recovery_codes_warning")}
        on_cancel={() => reg.set_show_skip_confirmation(false)}
        on_confirm={() => {
          reg.set_show_skip_confirmation(false);
          void reg.handle_advance_from_recovery_key();
        }}
        title={reg.t("common.are_you_sure")}
        variant="warning"
      />
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
