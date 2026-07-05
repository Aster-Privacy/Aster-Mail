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

import { Logo } from "@/components/auth/auth_styles";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";
import { Alert } from "@/components/register/register_shared";

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
    <motion.div
      key="phrase_confirm"
      animate="animate"
      className="flex flex-col items-center w-full max-w-md px-4"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {reg.t("auth.recovery_phrase_confirm_title")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center">
        {reg.t("auth.recovery_phrase_confirm_desc")}
      </p>

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

      <div className="w-full mt-6 space-y-6">
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
                    className={`rounded-lg px-2 py-2 border text-xs font-mono text-center transition-colors ${
                      is_selected
                        ? "bg-surf-primary border-txt-primary text-txt-primary"
                        : "bg-surf-tertiary border-edge-secondary text-txt-secondary hover:opacity-80"
                    }`}
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

      <Button
        className="w-full mt-6"
        disabled={!all_answered}
        size="xl"
        variant="depth"
        onClick={reg.handle_phrase_confirm_continue}
      >
        {reg.t("common.continue")}
      </Button>

      <button
        className="w-full mt-4 text-sm transition-colors hover:opacity-80 text-txt-tertiary text-center"
        onClick={reg.handle_skip_confirm_check}
      >
        {reg.t("auth.recovery_phrase_skip_check")}
      </button>

      <button
        className="w-full mt-3 text-sm transition-colors hover:opacity-80 text-txt-tertiary text-center"
        onClick={() => reg.set_step("recovery_phrase")}
      >
        {reg.t("common.go_back")}
      </button>
    </motion.div>
  );
};
