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
import type { MethodChoiceStepProps } from "./types";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
} from "@/components/auth/mobile_auth_motion";

interface MethodCardProps {
  title: string;
  description: string;
  badge: string;
  badge_tone: "green" | "amber";
  reduce_motion: boolean;
  on_click: () => void;
}

function MethodCard({
  title,
  description,
  badge,
  badge_tone,
  reduce_motion,
  on_click,
}: MethodCardProps) {
  return (
    <motion.button
      className="w-full rounded-xl border p-4 text-start"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-secondary)",
      }}
      type="button"
      variants={reduce_motion ? undefined : fade_up_item}
      whileTap={button_tap}
      onClick={on_click}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={
            badge_tone === "green"
              ? {
                  color: "#22c55e",
                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                }
              : {
                  color: "#f59e0b",
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                }
          }
        >
          {badge}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-tertiary)]">
        {description}
      </p>
    </motion.button>
  );
}

export function MethodChoiceStep({
  error,
  is_dark,
  reduce_motion,
  set_error,
  set_step,
  on_select_phrase,
  on_select_code,
  on_select_email,
}: MethodChoiceStepProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center px-6 pt-4">
        <motion.button
          className={BACK_BUTTON_CLASS}
          style={BACK_BUTTON_STYLE}
          whileTap={button_tap}
          onClick={() => {
            set_error("");
            set_step("email");
          }}
        >
          <ChevronLeftIcon className="h-5 w-5 rtl:-scale-x-100" />
        </motion.button>
      </div>

      <motion.div
        animate="animate"
        className="flex flex-1 flex-col items-center px-6 pt-6"
        initial={reduce_motion ? false : "initial"}
        variants={reduce_motion ? undefined : stagger_container}
      >
        <motion.img
          alt="Aster"
          className="h-8"
          decoding="async"
          src="/text_logo.png"
          variants={reduce_motion ? undefined : fade_up_item}
        />

        <motion.h1
          className="mt-6 text-center text-xl font-semibold text-[var(--text-primary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.forgot_method_title")}
        </motion.h1>

        <motion.p
          className="mt-2 text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
          variants={reduce_motion ? undefined : fade_up_item}
        >
          {t("auth.forgot_method_desc")}
        </motion.p>

        <AnimatePresence>
          {error && (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center text-sm"
              exit={{ opacity: 0, y: -4 }}
              initial={{ opacity: 0, y: -4 }}
              style={{ color: is_dark ? "#f87171" : "#dc2626" }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className={`w-full space-y-3 ${error ? "mt-4" : "mt-6"}`}>
          <MethodCard
            badge={t("auth.forgot_method_full_restore")}
            badge_tone="green"
            description={t("auth.forgot_method_phrase_desc")}
            on_click={on_select_phrase}
            reduce_motion={reduce_motion}
            title={t("auth.forgot_method_phrase_title")}
          />
          <MethodCard
            badge={t("auth.forgot_method_full_restore")}
            badge_tone="green"
            description={t("auth.forgot_method_code_desc")}
            on_click={on_select_code}
            reduce_motion={reduce_motion}
            title={t("auth.forgot_method_code_title")}
          />
          <MethodCard
            badge={t("auth.forgot_method_access_only")}
            badge_tone="amber"
            description={t("auth.forgot_method_email_desc")}
            on_click={on_select_email}
            reduce_motion={reduce_motion}
            title={t("auth.forgot_method_email_title")}
          />
        </div>
      </motion.div>
    </div>
  );
}
