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
import {
  use_toast_position,
  type ToastPosition,
} from "@/components/toast/toast_position";

export type { ToastPosition };

type ToastIconType = "success" | "warning" | "error" | "info";

interface ToastAction {
  label: string;
  on_click: () => void;
}

interface ToastState {
  id: string;
  message: string;
  icon_type?: ToastIconType;
  action?: ToastAction;
}

const MAX_TOASTS = 3;

const OFFLINE_FAILURE_TOAST_MS = 8000;

export const TOAST_DURATION_DEFAULT_MS = 2000;

export const TOAST_DURATION_BILLING_MS = 8000;

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
  action?: ToastAction,
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
    action,
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

interface SimpleToastProps {
  position?: ToastPosition;
}

export function SimpleToast({ position }: SimpleToastProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_translation();
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

  useEffect(() => {
    const on_queue_failure = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: { type?: string } }>)
        .detail;
      const message =
        detail?.action?.type === "send_email"
          ? t("common.offline_send_failed")
          : t("common.offline_change_failed");

      show_toast(message, "error", OFFLINE_FAILURE_TOAST_MS, {
        label: t("common.retry"),
        on_click: () => {
          void import("@/native/offline_queue").then((queue) =>
            queue.retry_failed_actions(),
          );
        },
      });
    };

    window.addEventListener("offline-queue-failure", on_queue_failure);

    return () => {
      window.removeEventListener("offline-queue-failure", on_queue_failure);
    };
  }, [t]);

  const { layout, y_offset } = use_toast_position(position);

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
            transition={{
              duration: reduce_motion ? 0 : 0.15,
              layout: { duration: 0.2 },
            }}
          >
            <div className="px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 bg-modal-bg border border-edge-secondary max-w-[min(92vw,28rem)]">
              {get_toast_icon(toast.icon_type) && (
                <span className="flex-shrink-0 text-txt-primary">
                  {get_toast_icon(toast.icon_type)}
                </span>
              )}
              <span className="text-[13px] font-medium text-txt-primary min-w-0 break-words">
                {toast.message}
              </span>
              {toast.action && (
                <button
                  className="flex-shrink-0 text-[13px] font-semibold text-brand hover:underline"
                  onClick={() => {
                    const run = toast.action?.on_click;

                    dismiss_toast(toast.id);
                    run?.();
                  }}
                >
                  {toast.action.label}
                </button>
              )}
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
