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
import { motion, AnimatePresence } from "framer-motion";

import { use_registration } from "@/components/register/hooks/use_registration";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
} from "@/components/auth/mobile_auth_motion";

export interface step_phrase_confirm_props {
  reg: ReturnType<typeof use_registration>;
  reduce_motion: boolean;
}

export function StepPhraseConfirm({
  reg,
  reduce_motion,
}: step_phrase_confirm_props) {
  const all_answered = reg.phrase_confirm_answers.every(
    (answer) => answer !== null,
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4">
        <motion.div
          animate="animate"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {reg.t("auth.recovery_phrase_confirm_title")}
            </h1>
          </motion.div>

          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {reg.t("auth.recovery_phrase_confirm_desc")}
            </p>
          </motion.div>

          <AnimatePresence>
            {reg.phrase_confirm_error && (
              <motion.div
                animate={{ opacity: 1 }}
                className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
              >
                {reg.t("auth.recovery_phrase_confirm_error")}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="mt-6 space-y-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            {reg.phrase_confirm_challenges.map((challenge, challenge_index) => (
              <div key={challenge.word_index}>
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  {reg
                    .t("auth.recovery_phrase_confirm_word_prompt")
                    .replace("{n}", (challenge.word_index + 1).toString())}
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {challenge.options.map((word) => {
                    const is_selected =
                      reg.phrase_confirm_answers[challenge_index] === word;

                    return (
                      <button
                        key={word}
                        className={`rounded-[16px] border px-2 py-3 text-center text-xs font-mono ${
                          is_selected
                            ? "border-[var(--text-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            : "border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                        }`}
                        type="button"
                        onClick={() =>
                          reg.handle_phrase_confirm_select(
                            challenge_index,
                            word,
                          )
                        }
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="shrink-0 px-6 pb-4 pt-4 space-y-3">
        <motion.button
          className={DEPTH_CTA_CLASS}
          disabled={!all_answered}
          style={{ ...DEPTH_CTA_STYLE, opacity: all_answered ? 1 : 0.5 }}
          whileTap={button_tap}
          onClick={reg.handle_phrase_confirm_continue}
        >
          {reg.t("common.continue")}
        </motion.button>
        <button
          className="w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
          type="button"
          onClick={reg.handle_skip_confirm_check}
        >
          {reg.t("auth.recovery_phrase_skip_check")}
        </button>
      </div>
    </div>
  );
}
