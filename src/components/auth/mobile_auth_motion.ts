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
import type { Variants, Transition } from "framer-motion";

export const stagger_container: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0,
    },
  },
};

export const fade_up_item: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

export const page_slide_transition: Transition = {
  duration: 0.15,
  ease: [0.25, 0.46, 0.45, 0.94],
};

export const button_tap = {
  scale: 0.98,
  transition: { duration: 0.1 },
};

export const DEPTH_INPUT_CLASS =
  "h-[52px] w-full rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-4 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-150";

export const DEPTH_INPUT_WRAPPER_CLASS =
  "flex items-center rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-150 focus-within:border-[#3b82f6] focus-within:shadow-[0_0_0_2px_#3b82f6]";

export const DEPTH_CTA_CLASS =
  "h-[52px] w-full rounded-xl font-semibold text-base text-white disabled:opacity-50 transition-colors duration-150";

export const DEPTH_CTA_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
};

export const DEPTH_SECONDARY_CLASS =
  "h-[52px] w-full rounded-xl font-semibold text-base text-[var(--text-primary)] bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50 transition-colors duration-150";

export const LABEL_CLASS =
  "mb-2 block text-sm font-medium text-[var(--text-primary)]";

export const BACK_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-colors";

export const BACK_BUTTON_STYLE: React.CSSProperties = {
  border: "1px solid transparent",
  background:
    "linear-gradient(var(--bg-tertiary), var(--bg-tertiary)) padding-box, conic-gradient(from 315deg, rgba(255,255,255,0.2) 0deg, rgba(255,255,255,0.04) 90deg, rgba(255,255,255,0.12) 180deg, rgba(255,255,255,0.04) 270deg, rgba(255,255,255,0.2) 360deg) border-box",
};

export const INNER_INPUT_CLASS = "h-[52px] flex-1 min-w-0 !bg-transparent !shadow-none !rounded-none !border-none focus:!shadow-none";

export const INNER_INPUT_WITH_ICON_CLASS =
  "h-[52px] flex-1 min-w-0 !bg-transparent !pl-3 !shadow-none !rounded-none !border-none focus:!shadow-none";

export const INPUT_ICON_CLASS =
  "flex items-center pl-4 text-[var(--text-muted)]";
