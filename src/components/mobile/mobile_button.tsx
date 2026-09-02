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
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import { motion } from "framer-motion";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { haptic_impact } from "@/native/haptic_feedback";
import { use_should_reduce_motion } from "@/provider";

export type MobileButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "ghost";

export type MobileButtonSize = "cta" | "md" | "sm";

export const MOBILE_BUTTON_PRESS_SCALE = 0.97;

const size_classes: Record<MobileButtonSize, string> = {
  cta: "h-[54px] rounded-[20px] px-5 text-[16px]",
  md: "h-11 rounded-[16px] px-4 text-[15px]",
  sm: "h-9 rounded-[12px] px-3.5 text-[14px]",
};

const variant_classes: Record<MobileButtonVariant, string> = {
  primary: "border border-white/10 text-[var(--accent-fg,#ffffff)]",
  secondary:
    "border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
  destructive: "border border-white/10 text-white",
  ghost: "text-[var(--accent-color)]",
};

const primary_style: CSSProperties = {
  background:
    "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
};

const destructive_style: CSSProperties = {
  background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
};

const variant_styles: Record<MobileButtonVariant, CSSProperties | undefined> = {
  primary: primary_style,
  secondary: undefined,
  destructive: destructive_style,
  ghost: undefined,
};

const spinner_sizes: Record<MobileButtonSize, "sm" | "xs"> = {
  cta: "sm",
  md: "sm",
  sm: "xs",
};

export interface MobileButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"
  > {
  variant?: MobileButtonVariant;
  size?: MobileButtonSize;
  is_loading?: boolean;
  full_width?: boolean;
  haptic?: boolean;
}

export const MobileButton = forwardRef<HTMLButtonElement, MobileButtonProps>(
  function MobileButton(
    {
      variant = "primary",
      size = "cta",
      is_loading = false,
      full_width = true,
      haptic = true,
      className,
      style,
      disabled,
      type = "button",
      onClick,
      children,
      ...props
    },
    ref,
  ) {
    const reduce_motion = use_should_reduce_motion();
    const is_disabled = disabled || is_loading;

    return (
      <motion.button
        ref={ref}
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:opacity-50",
          full_width && "w-full",
          size_classes[size],
          variant_classes[variant],
          className,
        )}
        disabled={is_disabled}
        style={{ ...variant_styles[variant], ...style }}
        type={type}
        whileTap={
          reduce_motion || is_disabled
            ? undefined
            : { scale: MOBILE_BUTTON_PRESS_SCALE }
        }
        onClick={(event) => {
          if (is_disabled) return;
          if (haptic) void haptic_impact("light");
          onClick?.(event);
        }}
        {...props}
      >
        {is_loading ? <Spinner size={spinner_sizes[size]} /> : children}
      </motion.button>
    );
  },
);
