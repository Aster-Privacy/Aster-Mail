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
import type { NewCodesStepProps } from "./types";

import { motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { EyeIcon, EyeSlashIcon } from "@/components/auth/auth_styles";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
} from "@/components/auth/mobile_auth_motion";

export function NewCodesStep({
  new_recovery_codes,
  is_key_visible,
  set_is_key_visible,
  copy_success,
  reduce_motion,
  set_step,
  on_copy_codes,
  on_download_pdf,
  on_download_txt,
}: NewCodesStepProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        animate="animate"
        className="flex-1 overflow-y-auto px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <motion.h1
          className="text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.save_new_recovery_codes")}
        </motion.h1>

        <motion.p
          className="mt-2 text-sm text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.old_codes_invalidated")}
        </motion.p>

        <motion.div
          className="mt-6"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">
              {t("auth.n_recovery_codes", {
                count: new_recovery_codes.length.toString(),
              })}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 rounded text-[var(--text-muted)]"
                type="button"
                onClick={() => set_is_key_visible(!is_key_visible)}
              >
                {is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
              <button
                className="p-1.5 rounded"
                style={{
                  color: copy_success
                    ? "var(--color-success)"
                    : "var(--text-muted)",
                }}
                type="button"
                onClick={on_copy_codes}
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
          <div className="grid grid-cols-2 gap-2">
            {new_recovery_codes.map((code, index) => (
              <div
                key={index}
                className="rounded-lg border px-3 py-2.5 text-center bg-[var(--bg-tertiary)] border-[var(--border-secondary)]"
              >
                <span
                  className="text-xs font-mono text-[var(--text-primary)]"
                  style={{
                    filter: is_key_visible ? "none" : "blur(4px)",
                    userSelect: is_key_visible ? "text" : "none",
                  }}
                >
                  {code}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className="shrink-0 space-y-3 px-6 pb-4 pt-4"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={
          reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }
        }
      >
        <motion.button
          className={DEPTH_CTA_CLASS}
          style={DEPTH_CTA_STYLE}
          whileTap={button_tap}
          onClick={on_download_pdf}
        >
          {t("auth.download_key")}
        </motion.button>
        <motion.button
          className={DEPTH_SECONDARY_CLASS}
          whileTap={button_tap}
          onClick={on_download_txt}
        >
          {t("auth.download_as_text")}
        </motion.button>
        <button
          className="w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
          type="button"
          onClick={() => set_step("success")}
        >
          {t("auth.continue_without_download")}
        </button>
      </motion.div>
    </div>
  );
}
