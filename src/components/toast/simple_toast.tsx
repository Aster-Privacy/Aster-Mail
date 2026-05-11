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

type ToastIconType = "success" | "warning" | "error" | "info";

interface ToastState {
  id: string;
  message: string;
  icon_type?: ToastIconType;
}

const MAX_TOASTS = 5;

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
): string {
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
  }, 2000);

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

interface SimpleToastProps {
  position?: "top" | "bottom";
}

export function SimpleToast({ position = "bottom" }: SimpleToastProps) {
  const reduce_motion = use_should_reduce_motion();
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

  const is_top = position === "top";
  const y_offset = is_top ? -20 : 20;

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-[100] flex ${is_top ? "flex-col" : "flex-col-reverse"} gap-2 pointer-events-none`}
      style={
        is_top
          ? { top: `calc(env(safe-area-inset-top, 0px) + 12px)` }
          : { bottom: "24px" }
      }
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
            layout={!reduce_motion}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
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
                aria-label="Dismiss"
                className="ml-1 flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors"
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
