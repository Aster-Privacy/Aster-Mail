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
import { motion, } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";


export type RecoveryStep =
  | "email"
  | "method_choice"
  | "phrase_entry"
  | "code"
  | "password"
  | "processing"
  | "new_codes"
  | "success"
  | "email_sent";

export type RecoveryMethod = "code" | "phrase";

export const page_variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const page_transition = {
  duration: 0.2,
  ease: "easeOut",
};

export interface AlertProps {
  message: string;
  is_dark: boolean;
}

export const Alert = ({ message, is_dark }: AlertProps) => {
  const reduce_motion = use_should_reduce_motion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="w-full mt-6"
      exit={{ opacity: 0 }}
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={{ duration: reduce_motion ? 0 : 0.15 }}
    >
      <p
        className="text-sm text-center"
        style={{ color: is_dark ? "#f87171" : "#dc2626" }}
      >
        {message}
      </p>
    </motion.div>
  );
};

export interface MethodCardProps {
  title: string;
  description: string;
  badge: string;
  badge_tone: "green" | "amber";
  on_click: () => void;
}

export const MethodCard = ({
  title,
  description,
  badge,
  badge_tone,
  on_click,
}: MethodCardProps) => (
  <button
    className="w-full rounded-lg border p-4 text-left transition-opacity hover:opacity-85 bg-surf-tertiary border-edge-secondary"
    type="button"
    onClick={on_click}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium text-txt-primary">{title}</span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={
          badge_tone === "green"
            ? {
                color: "var(--color-success)",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
              }
            : {
                color: "var(--color-warning)",
                backgroundColor: "rgba(245, 158, 11, 0.1)",
              }
        }
      >
        {badge}
      </span>
    </div>
    <p className="mt-1.5 text-xs leading-relaxed text-txt-tertiary">
      {description}
    </p>
  </button>
);

export const CopyIcon = () => (
  <svg
    className="w-5 h-5"
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
);

export const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const { t } = use_i18n();

  const get_strength = () => {
    if (!password) return { level: 0, label: "", color: "", suggestions: [] };

    let score = 0;
    const suggestions: string[] = [];

    if (password.length >= 8) score++;
    else suggestions.push(t("auth.use_8_characters"));

    if (password.length >= 12) score++;
    else if (password.length >= 8)
      suggestions.push(t("auth.try_12_characters"));

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    else suggestions.push(t("auth.mix_case"));

    if (/[0-9]/.test(password)) score++;
    else suggestions.push(t("auth.add_numbers"));

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else if (score >= 2) suggestions.push(t("auth.add_special_characters"));

    if (score <= 1)
      return {
        level: 1,
        label: t("auth.password_weak"),
        color: "var(--color-danger)",
        suggestions,
      };
    if (score === 2)
      return {
        level: 2,
        label: t("auth.password_fair"),
        color: "var(--color-warning)",
        suggestions,
      };
    if (score === 3)
      return {
        level: 3,
        label: t("auth.password_good"),
        color: "var(--color-success)",
        suggestions,
      };

    return {
      level: 4,
      label: t("auth.password_strong"),
      color: "var(--color-success)",
      suggestions: [],
    };
  };

  const strength = get_strength();

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i <= strength.level
                    ? strength.color
                    : "var(--border-secondary)",
              }}
            />
          ))}
        </div>
        <span className="text-xs" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      {strength.suggestions.length > 0 && strength.level < 3 && (
        <p className="text-xs mt-1.5 text-left text-txt-muted">
          {strength.suggestions[0]}
        </p>
      )}
    </div>
  );
};

