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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  use_toast_position,
  type ToastPosition,
} from "@/components/toast/toast_position";

export interface ActionToastState {
  id: string;
  message: string;
  action_type:
    | "archive"
    | "trash"
    | "spam"
    | "read"
    | "unread"
    | "star"
    | "unstar"
    | "folder"
    | "tag"
    | "pin"
    | "restore"
    | "not_spam"
    | "snooze"
    | "progress"
    | "refresh";
  email_ids: string[];
  on_undo?: () => Promise<void>;
  action_label?: string;
  progress?: { completed: number; total: number };
  on_cancel?: () => void;
  on_view_message?: () => void;
}

const toast_listeners = new Set<(toast: ActionToastState | null) => void>();
let current_toast: ActionToastState | null = null;
let toast_timeout: NodeJS.Timeout | null = null;
let progress_stall_timeout: NodeJS.Timeout | null = null;

const PROGRESS_STALL_MS = 90000;

function clear_progress_stall_timeout() {
  if (!progress_stall_timeout) return;
  clearTimeout(progress_stall_timeout);
  progress_stall_timeout = null;
}

function arm_progress_stall_timeout() {
  clear_progress_stall_timeout();
  progress_stall_timeout = setTimeout(() => {
    progress_stall_timeout = null;
    if (!current_toast?.progress) return;
    current_toast = null;
    toast_listeners.forEach((listener) => listener(null));
  }, PROGRESS_STALL_MS);
}

export type ActionToastConfig = Omit<ActionToastState, "id"> & {
  duration_ms?: number;
};

export function show_action_toast(toast: ActionToastConfig) {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }

  current_toast = {
    ...toast,
    id: crypto.randomUUID(),
  };

  toast_listeners.forEach((listener) => listener(current_toast));

  if (toast.progress) {
    arm_progress_stall_timeout();
  } else {
    clear_progress_stall_timeout();
    toast_timeout = setTimeout(
      () => {
        current_toast = null;
        toast_listeners.forEach((listener) => listener(null));
      },
      toast.duration_ms && toast.duration_ms > 0 ? toast.duration_ms : 5000,
    );
  }
}

export function update_progress_toast(
  completed: number,
  total: number,
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  if (!current_toast?.progress) return;

  arm_progress_stall_timeout();

  current_toast = {
    ...current_toast,
    progress: { completed, total },
    message: t
      ? t("common.processing_count", { completed, total })
      : `Processing ${completed} of ${total}...`,
  };

  toast_listeners.forEach((listener) => listener(current_toast));
}

export function subscribe_action_toast(
  listener: (toast: ActionToastState | null) => void,
): () => void {
  toast_listeners.add(listener);

  return () => {
    toast_listeners.delete(listener);
  };
}

export function hide_action_toast() {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
  }
  clear_progress_stall_timeout();
  current_toast = null;
  toast_listeners.forEach((listener) => listener(null));
}

function get_icon_for_action(action_type: ActionToastState["action_type"]) {
  const icon_class = "w-4 h-4";

  switch (action_type) {
    case "spam":
      return <ExclamationTriangleIcon className={icon_class} />;
    case "refresh":
      return <ArrowPathIcon className={`${icon_class} animate-spin`} />;
    case "archive":
    case "trash":
    case "pin":
    case "restore":
    case "not_spam":
    case "snooze":
    case "read":
    case "unread":
    case "star":
    case "unstar":
    case "folder":
    case "tag":
      return <CheckIcon className={icon_class} />;
    default:
      return <InformationCircleIcon className={icon_class} />;
  }
}

let island_visible = false;
const island_listeners = new Set<() => void>();

export function set_island_visible(visible: boolean) {
  island_visible = visible;
  island_listeners.forEach((fn) => fn());
}

interface ActionToastProps {
  position?: ToastPosition;
}

export function ActionToast({ position }: ActionToastProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [toast, set_toast] = useState<ActionToastState | null>(null);
  const [is_undoing, set_is_undoing] = useState(false);
  const [is_island_up, set_is_island_up] = useState(island_visible);

  useEffect(() => {
    const listener = (new_toast: ActionToastState | null) => {
      set_toast(new_toast);
      set_is_undoing(false);
    };

    toast_listeners.add(listener);

    const island_listener = () => set_is_island_up(island_visible);

    island_listeners.add(island_listener);

    return () => {
      toast_listeners.delete(listener);
      island_listeners.delete(island_listener);
    };
  }, []);

  const handle_undo = useCallback(async () => {
    if (!toast?.on_undo || is_undoing) return;

    set_is_undoing(true);
    try {
      await toast.on_undo();
      if (toast_timeout) {
        clearTimeout(toast_timeout);
        toast_timeout = null;
      }
      set_toast((prev) =>
        prev
          ? {
              ...prev,
              message: t("common.action_undone"),
              on_undo: undefined,
            }
          : null,
      );
      toast_timeout = setTimeout(() => {
        current_toast = null;
        toast_listeners.forEach((listener) => listener(null));
      }, 2000);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      const is_current = current_toast?.id === toast.id;

      if (is_current && toast_timeout) {
        clearTimeout(toast_timeout);
        toast_timeout = null;
      }
      set_toast((prev) =>
        prev
          ? {
              ...prev,
              message: t("common.undo_failed"),
              on_undo: undefined,
            }
          : null,
      );
      if (is_current) {
        toast_timeout = setTimeout(() => {
          current_toast = null;
          toast_listeners.forEach((listener) => listener(null));
        }, 5000);
      }
    } finally {
      set_is_undoing(false);
    }
  }, [toast, is_undoing, t]);

  const handle_cancel = useCallback(() => {
    toast?.on_cancel?.();
    hide_action_toast();
  }, [toast]);

  const progress_percentage =
    toast?.progress && toast.progress.total > 0
      ? Math.round((toast.progress.completed / toast.progress.total) * 100)
      : 0;

  const { layout, y_offset } = use_toast_position(position, is_island_up);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="action-toast"
          animate={{ opacity: 1, y: 0 }}
          className={`fixed ${layout.anchor} z-[100]`}
          exit={{ opacity: 0, y: y_offset }}
          initial={reduce_motion ? false : { opacity: 0, y: y_offset }}
          style={layout.style}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <div
            className={`rounded-xl shadow-lg flex flex-col bg-modal-bg border border-edge-secondary ${
              toast.progress ? "gap-2.5 px-4 py-3" : "gap-2 px-4 py-2.5"
            }`}
            style={{
              minWidth: toast.progress ? "300px" : undefined,
            }}
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="flex-shrink-0 text-txt-primary">
                {get_icon_for_action(toast.action_type)}
              </span>
              <span
                className={`text-[13px] font-medium text-txt-primary ${
                  toast.progress ? "flex-1 min-w-0 truncate" : ""
                }`}
              >
                {toast.message}
              </span>
              {toast.on_undo && !toast.progress && (
                <button
                  className="inline-flex items-center text-[13px] font-medium ms-1 underline text-brand"
                  disabled={is_undoing}
                  onClick={handle_undo}
                >
                  {toast.action_label || t("common.undo")}
                  {is_undoing && <Spinner className="ms-1.5" size="xs" />}
                </button>
              )}
              {toast.on_view_message && (
                <button
                  className="text-[13px] font-medium ms-1 underline text-brand"
                  onClick={toast.on_view_message}
                >
                  {t("mail.view_message")}
                </button>
              )}
              <button
                aria-label={t("common.dismiss")}
                className="flex-shrink-0 text-txt-muted hover:text-txt-primary hover:bg-edge-primary/60 rounded-full p-1 transition-colors ms-1"
                onClick={handle_cancel}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            {toast.progress && (
              <div className="flex items-center gap-3 pt-0.5">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-edge-primary">
                  <div
                    className="h-full rounded-full transition-all duration-200 bg-brand"
                    style={{
                      width: `${progress_percentage}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums min-w-[32px] text-end text-txt-secondary">
                  {progress_percentage}%
                </span>
                {toast.on_cancel && (
                  <button
                    className="text-[13px] font-medium text-brand hover:underline flex-shrink-0"
                    onClick={handle_cancel}
                  >
                    {t("common.cancel")}
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
