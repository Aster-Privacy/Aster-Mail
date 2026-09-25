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
} from "@/components/auth/mobile_auth_motion";

const SMALL_ACTION_CLASS =
  "h-11 w-full rounded-xl text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors duration-150";

export function NewCodesStep({
  new_recovery_codes,
  is_key_visible,
  set_is_key_visible,
  copy_success,
  codes_saved,
  set_codes_saved,
  reduce_motion,
  on_copy_codes,
  on_download_pdf,
  on_download_txt,
  on_print_codes,
  on_continue,
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
            <button
              className="p-1.5 rounded text-[var(--text-muted)]"
              type="button"
              onClick={() => set_is_key_visible(!is_key_visible)}
            >
              {is_key_visible ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
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

        <motion.div
          className="mt-6 grid grid-cols-3 gap-2"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          <motion.button
            className={SMALL_ACTION_CLASS}
            type="button"
            whileTap={button_tap}
            onClick={on_download_pdf}
          >
            {t("common.download")}
          </motion.button>
          <motion.button
            className={SMALL_ACTION_CLASS}
            type="button"
            whileTap={button_tap}
            onClick={on_print_codes}
          >
            {t("auth.print_codes")}
          </motion.button>
          <motion.button
            className={SMALL_ACTION_CLASS}
            type="button"
            whileTap={button_tap}
            onClick={on_copy_codes}
          >
            {copy_success ? t("common.copied") : t("auth.copy_codes")}
          </motion.button>
        </motion.div>

        <motion.button
          className="mt-4 w-full py-2 text-center text-sm text-[var(--text-tertiary)]"
          type="button"
          variants={reduce_motion ? undefined : fade_up_item}
          onClick={on_download_txt}
        >
          {t("auth.download_as_text")}
        </motion.button>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className="shrink-0 space-y-4 px-6 pb-4 pt-4"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={
          reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }
        }
      >
        <label className="flex cursor-pointer items-start gap-3 text-start">
          <input
            checked={codes_saved}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-color)]"
            type="checkbox"
            onChange={(e) => set_codes_saved(e.target.checked)}
          />
          <span className="text-sm text-[var(--text-secondary)]">
            {t("auth.i_saved_these_codes")}
          </span>
        </label>

        <motion.button
          className={DEPTH_CTA_CLASS}
          disabled={!codes_saved}
          style={DEPTH_CTA_STYLE}
          whileTap={codes_saved ? button_tap : undefined}
          onClick={on_continue}
        >
          {t("common.continue")}
        </motion.button>
      </motion.div>
    </div>
  );
}
