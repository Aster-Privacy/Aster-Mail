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
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_i18n } from "@/lib/i18n/context";
import { AccountChip } from "@/pages/forgot_password/shared";
import {
  fade_up_item,
  button_tap,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
} from "@/components/auth/mobile_auth_motion";

export const TEXT_ACTION_CLASS = "text-sm font-semibold disabled:opacity-50";

interface StepBackBarProps {
  on_back: () => void;
}

export const StepBackBar = ({ on_back }: StepBackBarProps) => {
  const { t } = use_i18n();

  return (
    <div className="flex items-center px-6 pt-4">
      <motion.button
        aria-label={t("common.back")}
        className={BACK_BUTTON_CLASS}
        style={BACK_BUTTON_STYLE}
        type="button"
        whileTap={button_tap}
        onClick={on_back}
      >
        <ChevronLeftIcon className="h-5 w-5 rtl:-scale-x-100" />
      </motion.button>
    </div>
  );
};

interface MobileStepHeaderProps {
  title: string;
  description: string;
  reduce_motion: boolean;
  email?: string;
  on_change_account?: () => void;
  show_logo?: boolean;
}

export const MobileStepHeader = ({
  title,
  description,
  reduce_motion,
  email,
  on_change_account,
  show_logo = true,
}: MobileStepHeaderProps) => {
  const { t } = use_i18n();
  const variants = reduce_motion ? undefined : fade_up_item;

  return (
    <>
      {show_logo && (
        <motion.img
          alt="Aster"
          className="h-7 self-start"
          decoding="async"
          draggable={false}
          src="/text_logo.png"
          variants={variants}
        />
      )}
      <motion.h1
        className="mt-6 w-full text-start text-2xl font-semibold leading-tight text-[var(--text-primary)]"
        variants={variants}
      >
        {title}
      </motion.h1>
      <motion.p
        className="mt-2 w-full text-start text-[15px] leading-relaxed text-[var(--text-secondary)]"
        variants={variants}
      >
        {description}
      </motion.p>
      {email && (
        <motion.div className="mt-4 w-full text-start" variants={variants}>
          <AccountChip
            email={email}
            label={t("auth.change_account")}
            on_click={on_change_account}
          />
        </motion.div>
      )}
    </>
  );
};

interface StepErrorProps {
  error: string;
  is_dark: boolean;
  reduce_motion?: boolean;
}

export const StepError = ({
  error,
  is_dark,
  reduce_motion,
}: StepErrorProps) => (
  <AnimatePresence>
    {error && (
      <motion.p
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 w-full text-start text-sm"
        exit={reduce_motion ? undefined : { opacity: 0, y: -4 }}
        initial={reduce_motion ? false : { opacity: 0, y: -4 }}
        role="alert"
        style={{ color: is_dark ? "#f87171" : "#dc2626" }}
      >
        {error}
      </motion.p>
    )}
  </AnimatePresence>
);

interface MobileActionRowProps {
  reduce_motion: boolean;
  primary_label: string;
  on_primary: () => void;
  primary_disabled?: boolean;
  secondary_label?: string;
  on_secondary?: () => void;
  secondary_disabled?: boolean;
}

export const MobileActionRow = ({
  reduce_motion,
  primary_label,
  on_primary,
  primary_disabled,
  secondary_label,
  on_secondary,
  secondary_disabled,
}: MobileActionRowProps) => (
  <motion.div
    animate={{ opacity: 1 }}
    className="flex shrink-0 flex-col items-center px-6 pb-6 pt-4"
    initial={reduce_motion ? false : { opacity: 0 }}
    transition={reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }}
  >
    <motion.button
      className={DEPTH_CTA_CLASS}
      disabled={primary_disabled}
      style={DEPTH_CTA_STYLE}
      type="button"
      whileTap={button_tap}
      onClick={on_primary}
    >
      {primary_label}
    </motion.button>
    {secondary_label && on_secondary && (
      <button
        className={`mt-4 ${TEXT_ACTION_CLASS}`}
        disabled={secondary_disabled}
        style={{ color: "var(--accent-color)" }}
        type="button"
        onClick={on_secondary}
      >
        {secondary_label}
      </button>
    )}
  </motion.div>
);
