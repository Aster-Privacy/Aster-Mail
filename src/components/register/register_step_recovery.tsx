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
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { Input } from "@/components/ui/input";
import { Logo, EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { SparkleOverlay } from "@/components/ui/sparkle_overlay";
import { show_toast } from "@/components/toast/simple_toast";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import { Alert, CopyIcon } from "@/components/register/register_shared";

interface RegisterStepRecoveryCodesProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepRecoveryCodes = ({
  reg,
}: RegisterStepRecoveryCodesProps) => {
  return (
    <motion.div
      key="recovery_key"
      animate="animate"
      className="flex flex-col items-center w-full max-w-md px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {reg.t("auth.save_recovery_codes")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.t("auth.store_codes_safely")}
      </p>

      <div className="w-full mt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-txt-muted">
            {reg.t("auth.n_recovery_codes", {
              count: reg.recovery_codes.length.toString(),
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
              onClick={() => reg.set_is_key_visible(!reg.is_key_visible)}
            >
              {reg.is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
            <button
              className="p-1.5 rounded transition-colors hover:opacity-80 text-txt-muted"
              onClick={reg.handle_copy_codes}
            >
              <CopyIcon />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {reg.recovery_codes.map((code, index) => (
            <div
              key={index}
              className="relative overflow-hidden rounded-lg px-3 py-2.5 border text-center transition-colors hover:opacity-80 bg-surf-tertiary border-edge-secondary"
              style={{
                cursor: reg.is_key_visible ? "pointer" : "default",
              }}
              onClick={() => {
                if (reg.is_key_visible) {
                  reg.handle_copy_single_code(code);
                } else {
                  show_toast(reg.t("auth.click_eye_reveal"), "info");
                }
              }}
            >
              <span
                className="text-xs font-mono text-txt-primary"
                style={{
                  filter: reg.is_key_visible ? "none" : "blur(4px)",
                  transition: "filter 0.2s ease",
                  userSelect: reg.is_key_visible ? "text" : "none",
                }}
              >
                {code}
              </span>
              <SparkleOverlay is_active={!reg.is_key_visible} />
            </div>
          ))}
        </div>
      </div>

      <Button
        className="w-full mt-6"
        size="xl"
        variant="depth"
        onClick={reg.handle_download_key}
      >
        {reg.t("auth.download_key")}
      </Button>

      <Button
        className="w-full mt-3"
        size="xl"
        variant="secondary"
        onClick={reg.handle_download_txt}
      >
        {reg.t("auth.download_as_text")}
      </Button>

      <button
        className="w-full mt-6 text-sm transition-colors hover:opacity-80 text-txt-tertiary text-center"
        onClick={() => {
          if (reg.is_pdf_downloaded || reg.is_text_downloaded) {
            reg.set_step("recovery_email");
          } else {
            reg.set_show_skip_confirmation(true);
          }
        }}
      >
        {reg.is_pdf_downloaded || reg.is_text_downloaded
          ? reg.t("common.continue")
          : reg.t("auth.continue_without_download")}
      </button>

      <ConfirmationModal
        cancel_text={reg.t("common.go_back")}
        confirm_text={reg.t("common.continue_anyway")}
        is_open={reg.show_skip_confirmation}
        message={reg.t("auth.recovery_codes_warning")}
        on_cancel={() => reg.set_show_skip_confirmation(false)}
        on_confirm={() => {
          reg.set_show_skip_confirmation(false);
          reg.set_step("recovery_email");
        }}
        title={reg.t("common.are_you_sure")}
        variant="warning"
      />
    </motion.div>
  );
};

interface RegisterStepRecoveryEmailProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepRecoveryEmailVerification = ({
  reg,
}: RegisterStepRecoveryEmailProps) => {
  return (
    <motion.div
      key="recovery_email_verification"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      {!reg.is_email_verified && (
        <svg
          className="mt-6 h-10 w-10 text-txt-secondary"
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

      <h1
        className={`text-xl font-semibold text-txt-primary ${reg.is_email_verified ? "mt-8" : "mt-5"}`}
      >
        {reg.is_email_verified
          ? reg.t("auth.recovery_email_verified")
          : reg.t("auth.check_your_inbox")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.is_email_verified
          ? reg.t("auth.recovery_email_verified_desc")
          : reg.t("auth.verification_email_sent_to_desc", {
              email: reg.recovery_email.trim(),
            })}
      </p>

      {!reg.is_email_verified && (
        <>
          <p className="text-xs mt-3 text-txt-muted text-center leading-relaxed">
            {reg.t("common.check_spam_folder_note")}
          </p>

          <div className="mt-6 flex items-center gap-2">
            <Spinner size="md" />
            <span className="text-sm text-txt-muted">
              {reg.t("auth.waiting_for_verification")}
            </span>
          </div>

          <Button
            className="w-full mt-6"
            disabled={reg.resend_cooldown > 0 || reg.is_resending_verification}
            size="xl"
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
          </Button>

          {!reg.recovery_email_required && (
            <button
              className="w-full mt-4 text-sm transition-colors hover:opacity-80 text-txt-tertiary text-center"
              onClick={reg.handle_skip_verification}
            >
              {reg.t("auth.skip_verification")}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
};

export const RegisterStepRecoveryEmail = ({
  reg,
}: RegisterStepRecoveryEmailProps) => {
  return (
    <motion.div
      key="recovery_email"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {reg.t("auth.add_backup_email")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.t("auth.optional_backup_email_desc")}
      </p>

      <AnimatePresence>
        {reg.recovery_email_error && (
          <Alert is_dark={reg.is_dark} message={reg.recovery_email_error} />
        )}
      </AnimatePresence>

      <div className={`w-full ${reg.recovery_email_error ? "mt-4" : "mt-6"}`}>
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          autoComplete="email"
          disabled={reg.is_saving_recovery_email}
          placeholder="backup@email.com"
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
      </div>

      <Button
        className="w-full mt-6"
        disabled={reg.is_saving_recovery_email}
        size="xl"
        variant="depth"
        onClick={reg.handle_recovery_email_continue}
      >
        {reg.is_saving_recovery_email ? (
          <>
            <Spinner className="mr-2" size="md" />
            {reg.t("common.saving")}
          </>
        ) : (
          reg.t("common.continue")
        )}
      </Button>

      {!reg.recovery_email_required && (
        <button
          className="w-full mt-4 text-sm transition-colors hover:opacity-80 text-txt-tertiary text-center"
          disabled={reg.is_saving_recovery_email}
          style={{
            opacity: reg.is_saving_recovery_email ? 0.5 : 1,
            cursor: reg.is_saving_recovery_email ? "not-allowed" : "pointer",
          }}
          onClick={reg.handle_recovery_email_skip}
        >
          {reg.t("auth.skip_for_now")}
        </button>
      )}
    </motion.div>
  );
};
