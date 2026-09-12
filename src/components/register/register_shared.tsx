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
import type { AlertProps } from "@/components/register/register_types";

import { motion } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";

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

interface StepShellProps {
  step_key: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  wide?: boolean;
}

export const StepShell = ({
  step_key,
  title,
  subtitle,
  children,
  wide = false,
}: StepShellProps) => (
  <motion.div
    key={step_key}
    animate="animate"
    className={`w-full ${wide ? "max-w-[520px]" : "max-w-[400px]"}`}
    exit="exit"
    initial="initial"
    transition={page_transition}
    variants={page_variants}
  >
    <div
      className="flex flex-col items-center rounded-2xl border px-8 py-8 text-center"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-primary)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      }}
    >
      <img
        alt="Aster"
        className="h-9 w-9 rounded-[10px]"
        src="/mail_logo.png"
      />
      <h1 className="mt-4 text-base font-semibold text-txt-primary">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-txt-tertiary">
        {subtitle}
      </p>
      <div className="mt-6 w-full">{children}</div>
    </div>
  </motion.div>
);

interface SkipLinkProps {
  label: string;
  on_click: () => void;
  disabled?: boolean;
}

export const SkipLink = ({ label, on_click, disabled }: SkipLinkProps) => (
  <button
    className="mt-4 w-full text-center text-sm text-txt-tertiary transition-colors hover:text-txt-primary disabled:opacity-50"
    disabled={disabled}
    type="button"
    onClick={on_click}
  >
    {label}
  </button>
);

export const CheckCircleIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
