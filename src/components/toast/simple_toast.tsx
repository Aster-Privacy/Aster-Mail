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
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_translation } from "@/lib/i18n";
import { use_preferences } from "@/contexts/preferences_context";

type ToastIconType = "success" | "warning" | "error" | "info";

interface ToastState {
  id: string;
  message: string;
  icon_type?: ToastIconType;
}

const MAX_TOASTS = 3;

export const TOAST_DURATION_DEFAULT_MS = 2000;

let toast_min_duration_ms = TOAST_DURATION_DEFAULT_MS;

export function set_toast_min_duration(duration_ms: number) {
  toast_min_duration_ms = Math.max(
    TOAST_DURATION_DEFAULT_MS,
    Math.min(30000, Math.round(duration_ms)),
  );
}

let toast_listeners: ((toasts: ToastState[]) => void)[] = [];
let toast_stack: ToastState[] = [];
let toast_timeouts: Map<string, NodeJS.Timeout> = new Map();

export function dismiss_toast(id: string) {
  const existing_timeout = toast_timeouts.get(id);

  if (existing_timeout) {
    clearTimeout(existing_timeout);
    toast_timeouts.delete(id);
  }
  toast_stack = toast_stack.filter((t) => t.id !== id);
  toast_listeners.forEach((listener) => listener([...toast_stack]));
}

export function show_toast(
  message: string,
  icon_type?: ToastIconType,
  duration = TOAST_DURATION_DEFAULT_MS,
): string {
  const effective_duration = Math.max(duration, toast_min_duration_ms);
  const duplicate = toast_stack.find(
    (t) => t.message === message && t.icon_type === icon_type,
  );

  if (duplicate) {
    const existing_timeout = toast_timeouts.get(duplicate.id);

    if (existing_timeout) {
      clearTimeout(existing_timeout);
    }

    const timeout = setTimeout(() => {
      toast_timeouts.delete(duplicate.id);
      toast_stack = toast_stack.filter((t) => t.id !== duplicate.id);
      toast_listeners.forEach((listener) => listener([...toast_stack]));
    }, effective_duration);

    toast_timeouts.set(duplicate.id, timeout);

    return duplicate.id;
  }

  const new_toast: ToastState = {
    message,
    icon_type,
    id: crypto.randomUUID(),
  };

  toast_stack = [new_toast, ...toast_stack];

  if (toast_stack.length > MAX_TOASTS) {
    const overflow = toast_stack.slice(MAX_TOASTS);

    for (const old_toast of overflow) {
      const existing_timeout = toast_timeouts.get(old_toast.id);

      if (existing_timeout) {
        clearTimeout(existing_timeout);
        toast_timeouts.delete(old_toast.id);
      }
    }
    toast_stack = toast_stack.slice(0, MAX_TOASTS);
  }

  toast_listeners.forEach((listener) => listener([...toast_stack]));

  const timeout = setTimeout(() => {
    toast_timeouts.delete(new_toast.id);
    toast_stack = toast_stack.filter((t) => t.id !== new_toast.id);
    toast_listeners.forEach((listener) => listener([...toast_stack]));
  }, effective_duration);

  toast_timeouts.set(new_toast.id, timeout);

  return new_toast.id;
}

function get_toast_icon(icon_type?: ToastIconType) {
  const icon_class = "w-4 h-4";

  switch (icon_type) {
    case "success":
      return <CheckIcon className={icon_class} />;
    case "warning":
      return <ExclamationTriangleIcon className={icon_class} />;
    case "error":
      return <XMarkIcon className={icon_class} />;
    case "info":
      return <InformationCircleIcon className={icon_class} />;
    default:
      return null;
  }
}

export type ToastPosition =
  | "top"
  | "bottom"
  | "top-right"
  | "bottom-right"
  | "top-left"
  | "bottom-left";

interface SimpleToastProps {
  position?: ToastPosition;
}

interface ToastPositionLayout {
  anchor: string;
  align: string;
  column: string;
  style: { top: string } | { bottom: string };
}

const TOP_STYLE = { top: "calc(env(safe-area-inset-top, 0px) + 12px)" };
const BOTTOM_STYLE = { bottom: "24px" };

const TOAST_POSITION_LAYOUT: Record<ToastPosition, ToastPositionLayout> = {
  top: {
    anchor: "left-1/2 -translate-x-1/2",
    align: "items-center",
    column: "flex-col",
    style: TOP_STYLE,
  },
  bottom: {
    anchor: "left-1/2 -translate-x-1/2",
    align: "items-center",
    column: "flex-col-reverse",
    style: BOTTOM_STYLE,
  },
  "top-right": {
    anchor: "right-4",
    align: "items-end",
    column: "flex-col",
    style: TOP_STYLE,
  },
  "top-left": {
    anchor: "left-4",
    align: "items-start",
    column: "flex-col",
    style: TOP_STYLE,
  },
  "bottom-right": {
    anchor: "right-4",
    align: "items-end",
    column: "flex-col-reverse",
    style: BOTTOM_STYLE,
  },
  "bottom-left": {
    anchor: "left-4",
    align: "items-start",
    column: "flex-col-reverse",
    style: BOTTOM_STYLE,
  },
};

export function SimpleToast({ position }: SimpleToastProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_translation();
  const { preferences } = use_preferences();
  const [toasts, set_toasts] = useState<ToastState[]>([]);

  useEffect(() => {
    const listener = (new_toasts: ToastState[]) => {
      set_toasts(new_toasts);
    };

    toast_listeners.push(listener);

    return () => {
      toast_listeners = toast_listeners.filter((l) => l !== listener);
    };
  }, []);

  const effective_position = position ?? preferences.toast_position;
  const layout = TOAST_POSITION_LAYOUT[effective_position];
  const is_top = effective_position === "top" || effective_position === "top-right" || effective_position === "top-left";
  const y_offset = is_top ? -20 : 20;

  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className={`fixed ${layout.anchor} z-[100] flex ${layout.column} ${layout.align} gap-2 pointer-events-none`}
      role="status"
      style={layout.style}
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="pointer-events-auto"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={
              reduce_motion ? false : { opacity: 0, y: y_offset, scale: 0.95 }
            }
            layout={reduce_motion ? false : "position"}
            transition={{ duration: reduce_motion ? 0 : 0.15, layout: { duration: 0.2 } }}
          >
            <div className="px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 bg-modal-bg border border-edge-secondary">
              {get_toast_icon(toast.icon_type) && (
                <span className="flex-shrink-0 text-txt-primary">
                  {get_toast_icon(toast.icon_type)}
                </span>
              )}
              <span className="text-[13px] font-medium text-txt-primary whitespace-nowrap">
                {toast.message}
              </span>
              <button
                aria-label={t("common.dismiss")}
                className="flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors p-1.5 -m-1.5"
                onClick={() => dismiss_toast(toast.id)}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
