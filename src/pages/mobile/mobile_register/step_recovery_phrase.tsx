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
import type { NavigateFunction } from "react-router-dom";

import { motion, AnimatePresence } from "framer-motion";

import { use_registration } from "@/components/register/hooks/use_registration";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import { SparkleOverlay } from "@/components/ui/sparkle_overlay";
import { show_toast } from "@/components/toast/simple_toast";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
} from "@/components/auth/mobile_auth_motion";

export interface step_recovery_phrase_props {
  reg: ReturnType<typeof use_registration>;
  reduce_motion: boolean;
  navigate: NavigateFunction;
  show_leave_confirmation: boolean;
  set_show_leave_confirmation: (value: boolean) => void;
}

export function StepRecoveryPhrase({
  reg,
  reduce_motion,
  navigate,
  show_leave_confirmation,
  set_show_leave_confirmation,
}: step_recovery_phrase_props) {
  const words = reg.recovery_phrase.split(" ");

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
              {reg.t("auth.recovery_phrase_title")}
            </h1>
          </motion.div>

          <motion.div variants={reduce_motion ? undefined : fade_up_item}>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {reg.t("auth.recovery_phrase_desc")}
            </p>
          </motion.div>

          <motion.div
            className="mt-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <div className="mb-3 flex items-center justify-end">
              <div className="flex items-center gap-1">
                <button
                  className="p-1.5 rounded text-[var(--text-muted)]"
                  type="button"
                  onClick={() =>
                    reg.set_is_phrase_visible(!reg.is_phrase_visible)
                  }
                >
                  {reg.is_phrase_visible ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
                <button
                  className="p-1.5 rounded text-[var(--text-muted)]"
                  type="button"
                  onClick={() => {
                    if (reg.is_phrase_visible) {
                      reg.handle_copy_phrase();
                    } else {
                      show_toast(reg.t("auth.recovery_phrase_reveal"), "info");
                    }
                  }}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {words.map((word, index) => (
                <div
                  key={index}
                  className="relative overflow-hidden rounded-[16px] border px-4 py-3.5 flex items-center gap-2 bg-[var(--bg-tertiary)] border-[var(--border-secondary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]"
                >
                  <span className="text-xs text-[var(--text-muted)] w-5 text-right shrink-0">
                    {index + 1}.
                  </span>
                  <span
                    className="text-sm font-mono font-medium text-[var(--text-primary)]"
                    style={{
                      filter: reg.is_phrase_visible ? "none" : "blur(4px)",
                      userSelect: reg.is_phrase_visible ? "text" : "none",
                    }}
                  >
                    {word}
                  </span>
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                    <SparkleOverlay is_active={!reg.is_phrase_visible} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="mt-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <label className="flex items-start gap-2 text-[var(--text-tertiary)]">
              <input
                checked={reg.phrase_saved_checkbox}
                className="mt-0.5 accent-current"
                type="checkbox"
                onChange={(e) =>
                  reg.set_phrase_saved_checkbox(e.target.checked)
                }
              />
              <span className="text-sm leading-relaxed">
                {reg.t("auth.recovery_phrase_saved_checkbox")}
              </span>
            </label>
          </motion.div>
        </motion.div>
      </div>

      <div className="shrink-0 px-6 pb-4 pt-4 space-y-3">
        <motion.button
          className={DEPTH_SECONDARY_CLASS}
          whileTap={button_tap}
          onClick={reg.handle_download_phrase_pdf}
        >
          {reg.t("auth.download_key")}
        </motion.button>
        <motion.button
          className={DEPTH_SECONDARY_CLASS}
          whileTap={button_tap}
          onClick={reg.handle_download_phrase_text}
        >
          {reg.t("auth.download_as_text")}
        </motion.button>
        <motion.button
          className={DEPTH_CTA_CLASS}
          disabled={!reg.phrase_saved_checkbox}
          style={{
            ...DEPTH_CTA_STYLE,
            opacity: reg.phrase_saved_checkbox ? 1 : 0.5,
          }}
          whileTap={button_tap}
          onClick={reg.handle_phrase_continue}
        >
          {reg.t("common.continue")}
        </motion.button>
        <button
          className="w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
          type="button"
          onClick={reg.handle_skip_phrase}
        >
          {reg.t("auth.continue_without_download")}
        </button>
      </div>

      <AnimatePresence>
        {reg.show_skip_confirmation && (
          <motion.div
            key="skip-confirmation-overlay"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => reg.set_show_skip_confirmation(false)}
            />
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-primary)] p-6"
              exit={{ opacity: 0, scale: 0.95 }}
              initial={reduce_motion ? false : { opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {reg.t("common.are_you_sure")}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                {reg.t("auth.recovery_phrase_skip_warning")}
              </p>
              <div className="mt-6 space-y-2">
                <motion.button
                  className={DEPTH_CTA_CLASS}
                  style={DEPTH_CTA_STYLE}
                  whileTap={button_tap}
                  onClick={() => reg.set_show_skip_confirmation(false)}
                >
                  {reg.t("common.go_back")}
                </motion.button>
                <motion.button
                  className={DEPTH_SECONDARY_CLASS}
                  whileTap={button_tap}
                  onClick={reg.handle_skip_confirm_check}
                >
                  {reg.t("common.continue_anyway")}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {show_leave_confirmation && (
          <motion.div
            key="leave-confirmation-overlay"
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => set_show_leave_confirmation(false)}
            />
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-primary)] p-6"
              exit={{ opacity: 0, scale: 0.95 }}
              initial={reduce_motion ? false : { opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {reg.t("common.are_you_sure")}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                {reg.t("auth.recovery_phrase_skip_warning")}
              </p>
              <div className="mt-6 space-y-2">
                <motion.button
                  className={DEPTH_CTA_CLASS}
                  style={DEPTH_CTA_STYLE}
                  whileTap={button_tap}
                  onClick={() => set_show_leave_confirmation(false)}
                >
                  {reg.t("common.go_back")}
                </motion.button>
                <motion.button
                  className={DEPTH_SECONDARY_CLASS}
                  whileTap={button_tap}
                  onClick={() => {
                    set_show_leave_confirmation(false);
                    navigate("/welcome");
                  }}
                >
                  {reg.t("common.continue_anyway")}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
