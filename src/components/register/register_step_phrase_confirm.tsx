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

import { AnimatePresence } from "framer-motion";

import {
  Alert,
  OnboardingButton,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepPhraseConfirmProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepPhraseConfirm = ({
  reg,
}: RegisterStepPhraseConfirmProps) => {
  const all_answered = reg.phrase_confirm_answers.every(
    (answer) => answer !== null,
  );

  return (
    <StepShell
      step_key="phrase_confirm"
      subtitle={reg.t("auth.recovery_phrase_confirm_desc")}
      title={reg.t("auth.recovery_phrase_confirm_title")}
    >
      <AnimatePresence>
        {reg.phrase_confirm_error && (
          <Alert
            is_dark={reg.is_dark}
            message={reg.t("auth.recovery_phrase_confirm_error")}
          />
        )}
        {reg.phrase_wrap_error && (
          <Alert
            is_dark={reg.is_dark}
            message={reg.t("settings.phrase_wrap_save_failed")}
          />
        )}
      </AnimatePresence>

      <div className="w-full space-y-5">
        {reg.phrase_confirm_challenges.map((challenge, challenge_index) => (
          <div key={challenge.word_index}>
            <span className="text-xs font-medium text-txt-muted">
              {reg
                .t("auth.recovery_phrase_confirm_word_prompt")
                .replace("{n}", (challenge.word_index + 1).toString())}
            </span>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {challenge.options.map((word) => {
                const is_selected =
                  reg.phrase_confirm_answers[challenge_index] === word;

                return (
                  <button
                    key={word}
                    className={`h-9 rounded-lg border px-2 text-center font-mono text-xs transition-colors ${
                      is_selected
                        ? "border-[var(--accent-color)] bg-black/[0.05] text-txt-primary dark:bg-white/[0.08]"
                        : "border-transparent bg-black/[0.05] text-txt-secondary hover:bg-black/[0.07] dark:bg-white/[0.08] dark:hover:bg-white/[0.1]"
                    }`}
                    type="button"
                    onClick={() =>
                      reg.handle_phrase_confirm_select(challenge_index, word)
                    }
                  >
                    {word}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <OnboardingButton
        className="mt-5 w-full"
        disabled={!all_answered}
        variant="primary"
        onClick={reg.handle_phrase_confirm_continue}
      >
        {reg.t("common.continue")}
      </OnboardingButton>

      <OnboardingButton
        className="mt-2 w-full"
        variant="secondary"
        onClick={() => reg.set_step("recovery_phrase")}
      >
        {reg.t("common.go_back")}
      </OnboardingButton>

      <SkipLink
        label={reg.t("auth.recovery_phrase_skip_check")}
        on_click={reg.handle_skip_confirm_check}
      />
    </StepShell>
  );
};
