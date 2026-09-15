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
import { motion } from "framer-motion";
import { ReactNode } from "react";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

export type RecoveryStep =
  | "email"
  | "code"
  | "other_ways"
  | "reset_email_confirm"
  | "support"
  | "password"
  | "processing"
  | "new_codes"
  | "review_security"
  | "email_sent";

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

export const ChevronRightIcon = () => (
  <svg
    className="w-4 h-4 shrink-0 text-txt-muted"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export interface OptionRowProps {
  title: string;
  description: string;
  icon: ReactNode;
  on_click: () => void;
}

export const OptionRow = ({
  title,
  description,
  icon,
  on_click,
}: OptionRowProps) => (
  <button
    className="w-full flex items-start gap-3 rounded-lg border px-4 py-3.5 text-start transition-opacity hover:opacity-85 bg-surf-tertiary border-edge-secondary"
    type="button"
    onClick={on_click}
  >
    <span className="mt-0.5 shrink-0 text-txt-secondary">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium text-txt-primary">
        {title}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-txt-tertiary">
        {description}
      </span>
    </span>
    <span className="mt-1">
      <ChevronRightIcon />
    </span>
  </button>
);

export interface ReviewRowProps {
  label: string;
  action_label?: string;
  on_action?: () => void;
}

export const ReviewRow = ({
  label,
  action_label,
  on_action,
}: ReviewRowProps) => (
  <div className="w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-start bg-surf-tertiary border-edge-secondary">
    <span className="text-sm text-txt-primary">{label}</span>
    {action_label && on_action && (
      <button
        className="shrink-0 text-sm font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--accent-color)" }}
        type="button"
        onClick={on_action}
      >
        {action_label}
      </button>
    )}
  </div>
);

export const KeyIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912l-2.148 2.148a2.25 2.25 0 01-1.591.659h-1.232v1.232a2.25 2.25 0 01-.659 1.591l-.621.621a2.25 2.25 0 01-1.591.659H4.5a1.5 1.5 0 01-1.5-1.5v-1.982c0-.597.237-1.169.659-1.591l6.66-6.661A6 6 0 1121.75 8.25z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MailIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HelpIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const WarningIcon = () => (
  <svg
    className="w-8 h-8"
    fill="none"
    stroke="var(--color-warning)"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
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

export const PasswordStrengthIndicator = ({
  password,
}: {
  password: string;
}) => {
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
        <p className="text-xs mt-1.5 text-start text-txt-muted">
          {strength.suggestions[0]}
        </p>
      )}
    </div>
  );
};
