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

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { SparkleOverlay } from "@/components/ui/sparkle_overlay";
import { show_toast } from "@/components/toast/simple_toast";
import {
  CopyIcon,
  OnboardingButton,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepRecoveryPhraseProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepRecoveryPhrase = ({
  reg,
}: RegisterStepRecoveryPhraseProps) => {
  const words = reg.recovery_phrase.split(" ");

  return (
    <StepShell
      step_key="recovery_phrase"
      subtitle={reg.t("auth.recovery_phrase_desc")}
      title={reg.t("auth.recovery_phrase_title")}
    >
      <div className="w-full">
        <div className="mb-2 flex items-center justify-end">
          <div className="flex items-center gap-1">
            <button
              aria-label={
                reg.is_phrase_visible
                  ? reg.t("common.hide")
                  : reg.t("settings.show_password_toggle")
              }
              className="rounded-md p-1.5 text-txt-muted transition-colors hover:text-txt-primary"
              type="button"
              onClick={() => reg.set_is_phrase_visible(!reg.is_phrase_visible)}
            >
              {reg.is_phrase_visible ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
            <button
              aria-label={reg.t("auth.copy_key")}
              className="rounded-md p-1.5 text-txt-muted transition-colors hover:text-txt-primary"
              type="button"
              onClick={() => {
                if (reg.is_phrase_visible) {
                  reg.handle_copy_phrase();
                } else {
                  show_toast(reg.t("auth.recovery_phrase_reveal"), "info");
                }
              }}
            >
              <CopyIcon />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {words.map((word, index) => (
            <div
              key={index}
              className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-transparent bg-black/[0.05] px-3 py-2 dark:bg-white/[0.08]"
            >
              <span className="text-xs text-txt-muted w-5 text-end shrink-0">
                {index + 1}.
              </span>
              <span
                className="text-xs font-mono text-txt-primary break-all"
                style={{
                  filter: reg.is_phrase_visible ? "none" : "blur(4px)",
                  transition: "filter 0.2s ease",
                  userSelect: reg.is_phrase_visible ? "text" : "none",
                }}
              >
                {word}
              </span>
              <SparkleOverlay is_active={!reg.is_phrase_visible} />
            </div>
          ))}
        </div>
      </div>

      <OnboardingButton
        className="mt-4 w-full"
        variant="primary"
        onClick={reg.handle_download_phrase_pdf}
      >
        {reg.t("auth.download_key")}
      </OnboardingButton>

      <OnboardingButton
        className="mt-2 w-full"
        variant="secondary"
        onClick={reg.handle_download_phrase_text}
      >
        {reg.t("auth.download_as_text")}
      </OnboardingButton>

      <label className="mt-4 flex w-full cursor-pointer items-start gap-2 text-txt-tertiary">
        <input
          checked={reg.phrase_saved_checkbox}
          className="mt-0.5 accent-[var(--accent-color)]"
          type="checkbox"
          onChange={(e) => reg.set_phrase_saved_checkbox(e.target.checked)}
        />
        <span className="text-xs leading-relaxed">
          {reg.t("auth.recovery_phrase_saved_checkbox")}
        </span>
      </label>

      <OnboardingButton
        className="mt-4 w-full"
        disabled={!reg.phrase_saved_checkbox}
        variant="primary"
        onClick={reg.handle_phrase_continue}
      >
        {reg.t("common.continue")}
      </OnboardingButton>

      <SkipLink
        label={reg.t("auth.continue_without_download")}
        on_click={reg.handle_skip_phrase}
      />

      <ConfirmationModal
        cancel_text={reg.t("common.go_back")}
        confirm_text={reg.t("common.continue_anyway")}
        is_open={reg.show_skip_confirmation}
        message={reg.t("auth.recovery_phrase_skip_warning")}
        on_cancel={() => reg.set_show_skip_confirmation(false)}
        on_confirm={reg.handle_skip_confirm_check}
        title={reg.t("common.are_you_sure")}
        variant="warning"
      />
    </StepShell>
  );
};
