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

import * as React from "react";
import { motion } from "framer-motion";
import { Slot } from "@radix-ui/react-slot";
import { Spinner } from "@aster/ui";

import { cn } from "@/lib/utils";
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
    <div className="flex flex-col items-start px-4 text-start">
      <img
        alt="Aster"
        className="h-7"
        decoding="async"
        draggable={false}
        src="/text_logo.png"
      />
      <h1 className="mt-5 text-base font-semibold text-txt-primary">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-txt-tertiary">
        {subtitle}
      </p>
      <div className="mt-5 w-full">{children}</div>
    </div>
  </motion.div>
);

type OnboardingButtonVariant = "primary" | "secondary";

interface OnboardingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: OnboardingButtonVariant;
  is_loading?: boolean;
  as_child?: boolean;
}

const BUTTON_VARIANT_CLASSES: Record<OnboardingButtonVariant, string> = {
  primary:
    "bg-[var(--accent-color)] text-[var(--accent-color-foreground,#fff)] hover:brightness-110",
  secondary:
    "border border-black/10 bg-white text-txt-primary hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/10",
};

export const OnboardingButton = ({
  variant = "primary",
  is_loading = false,
  as_child = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: OnboardingButtonProps) => {
  const Comp = as_child ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex h-9 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-[background-color,filter,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-surf-primary disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled || is_loading}
      type={as_child ? undefined : type}
      {...props}
    >
      {is_loading ? <Spinner size="sm" /> : children}
    </Comp>
  );
};

type OnboardingInputStatus = "default" | "success" | "error";

interface OnboardingInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  status?: OnboardingInputStatus;
}

const INPUT_STATUS_CLASSES: Record<OnboardingInputStatus, string> = {
  default: "border-transparent focus:border-[var(--accent-color)]",
  success: "border-[#22c55e] focus:border-[#22c55e]",
  error: "border-[#ef4444] focus:border-[#ef4444]",
};

export const OnboardingInput = React.forwardRef<
  HTMLInputElement,
  OnboardingInputProps
>(({ className, status = "default", ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-lg border bg-black/[0.05] px-3 text-sm text-txt-primary outline-none transition-colors duration-150 placeholder:text-txt-muted hover:bg-black/[0.07] focus:bg-black/[0.05] disabled:opacity-60 dark:bg-white/[0.08] dark:hover:bg-white/[0.1] dark:focus:bg-white/[0.08]",
      INPUT_STATUS_CLASSES[status],
      className,
    )}
    {...props}
  />
));

OnboardingInput.displayName = "OnboardingInput";

interface SkipLinkProps {
  label: string;
  on_click: () => void;
  disabled?: boolean;
}

export const SkipLink = ({ label, on_click, disabled }: SkipLinkProps) => (
  <button
    className="mt-3 w-full text-center text-xs text-txt-tertiary transition-colors hover:text-txt-primary disabled:opacity-50"
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
