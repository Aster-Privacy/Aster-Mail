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
import { useCallback, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";

export type SettingsSection =
  | "account"
  | "appearance"
  | "accessibility"
  | "security"
  | "encryption"
  | "aliases"
  | "billing"
  | "notifications"
  | "behavior"
  | "signatures"
  | "templates"
  | "import"
  | "external_accounts"
  | "sender_filters"
  | "feedback"
  | "about";

export const chip_selected_style: React.CSSProperties = {
  background: "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
  boxShadow: "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
};

export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-1.5">
      {title && (
        <p className="mb-1 px-1 pt-4 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl bg-[var(--mobile-bg-card)]">
        {children}
      </div>
    </div>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  on_press,
  trailing,
  destructive,
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  on_press?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}) {
  const row_ref = useRef<HTMLDivElement>(null);

  const handle_row_tap = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    if (
      target.closest("[role='switch']") ||
      target.closest("button[role='switch']")
    )
      return;
    const switch_el = row_ref.current?.querySelector(
      "[role='switch']",
    ) as HTMLElement | null;

    if (switch_el) {
      const mouse_event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      switch_el.dispatchEvent(mouse_event);
    }
  }, []);

  const content = (
    <>
      {icon && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]">
          {icon}
        </span>
      )}
      <span
        className={`min-w-0 flex-1 text-[15px] ${destructive ? "text-[var(--color-danger,#ef4444)]" : "text-[var(--text-primary)]"}`}
      >
        {label}
      </span>
      {value && (
        <span className="shrink-0 text-[14px] text-[var(--text-muted)]">
          {value}
        </span>
      )}
      {trailing}
      {on_press && !trailing && (
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      )}
    </>
  );

  if (on_press) {
    return (
      <button
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--mobile-bg-card-hover)]"
        type="button"
        onClick={on_press}
      >
        {content}
      </button>
    );
  }

  if (trailing) {
    return (
      <div
        ref={row_ref}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--mobile-bg-card-hover)]"
        onClick={handle_row_tap}
      >
        {content}
      </div>
    );
  }

  return <div className="flex items-center gap-3 px-4 py-3.5">{content}</div>;
}

export function SettingsHeader({
  title,
  on_back,
  on_close,
}: {
  title: string;
  on_back?: () => void;
  on_close: () => void;
}) {
  const { safe_area_insets } = use_platform();

  return (
    <header
      className="sticky top-0 z-40 flex h-12 shrink-0 items-center border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/95 px-2 backdrop-blur-lg"
      style={{
        paddingTop: safe_area_insets.top,
        height: 48 + safe_area_insets.top,
      }}
    >
      <div className="flex w-8 items-center justify-center">
        {on_back && (
          <motion.button
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
            type="button"
            onClick={on_back}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </motion.button>
        )}
      </div>
      <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold text-[var(--text-primary)]">
        {title}
      </h1>
      <motion.button
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
        type="button"
        onClick={on_close}
      >
        <XMarkIcon className="h-4 w-4" strokeWidth={2.5} />
      </motion.button>
    </header>
  );
}

export function OptionList<T extends string>({
  options,
  value,
  on_change,
}: {
  options: { value: T; label: string }[];
  value: T;
  on_change: (v: T) => void;
}) {
  return (
    <div className="divide-y divide-[var(--border-primary)]">
      {options.map((opt) => (
        <button
          key={opt.value}
          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)]"
          type="button"
          onClick={() => on_change(opt.value)}
        >
          <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
            {opt.label}
          </span>
          {value === opt.value && (
            <CheckIcon className="h-5 w-5 shrink-0 text-[var(--accent-color,#3b82f6)]" />
          )}
        </button>
      ))}
    </div>
  );
}

export function SettingsAnimatedSection({ children }: { children: ReactNode }) {
  const reduce_motion = use_should_reduce_motion();

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="absolute inset-0 flex flex-col bg-[var(--bg-primary)]"
      exit={reduce_motion ? undefined : { opacity: 0, x: -50 }}
      initial={reduce_motion ? false : { opacity: 0, x: 50 }}
      transition={
        reduce_motion ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }
      }
    >
      {children}
    </motion.div>
  );
}
