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
} from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface ActionToastState {
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

export function show_action_toast(
  toast: Omit<ActionToastState, "id"> & { duration_ms?: number },
) {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }

  current_toast = {
    ...toast,
    id: crypto.randomUUID(),
  };

  toast_listeners.forEach((listener) => listener(current_toast));

  if (!toast.progress) {
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

  current_toast = {
    ...current_toast,
    progress: { completed, total },
    message: t
      ? t("common.processing_count", { completed, total })
      : `Processing ${completed} of ${total}...`,
  };

  toast_listeners.forEach((listener) => listener(current_toast));
}

export function hide_action_toast() {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
  }
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
  position?: "top" | "bottom";
}

export function ActionToast({ position = "bottom" }: ActionToastProps) {
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
      set_toast((prev) =>
        prev
          ? {
              ...prev,
              message: t("common.undo_failed"),
              on_undo: undefined,
            }
          : null,
      );
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

  const is_top = position === "top";
  const y_offset = is_top ? -20 : 20;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="action-toast"
          animate={{ opacity: 1, y: 0 }}
          className={`fixed left-1/2 -translate-x-1/2 z-[100] ${is_top ? "" : is_island_up ? "bottom-20" : "bottom-6"}`}
          exit={{ opacity: 0, y: y_offset }}
          initial={reduce_motion ? false : { opacity: 0, y: y_offset }}
          style={
            is_top
              ? { top: `calc(env(safe-area-inset-top, 0px) + 12px)` }
              : undefined
          }
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <div
            className="px-4 py-2.5 rounded-xl shadow-lg flex flex-col gap-2 bg-modal-bg border border-edge-secondary"
            style={{
              minWidth: toast.progress ? "280px" : undefined,
            }}
          >
            <div className="flex items-center justify-center gap-2 whitespace-nowrap">
              <span className="flex-shrink-0 text-txt-primary">
                {get_icon_for_action(toast.action_type)}
              </span>
              <span className="text-[13px] font-medium text-center text-txt-primary">
                {toast.message}
              </span>
              {toast.on_undo && !toast.progress && (
                <button
                  className="text-[13px] font-medium ml-1 underline text-brand"
                  disabled={is_undoing}
                  onClick={handle_undo}
                >
                  {is_undoing ? "..." : (toast.action_label || t("common.undo"))}
                </button>
              )}
              {toast.on_view_message && (
                <button
                  className="text-[13px] font-medium ml-1 underline text-brand"
                  onClick={toast.on_view_message}
                >
                  {t("mail.view_message")}
                </button>
              )}
              {toast.on_cancel && toast.progress && (
                <button
                  className="text-[13px] font-medium ml-1 hover:underline text-brand"
                  onClick={handle_cancel}
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>
            {toast.progress && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-edge-primary">
                  <div
                    className="h-full rounded-full transition-all duration-200 bg-brand"
                    style={{
                      width: `${progress_percentage}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium min-w-[32px] text-right text-txt-secondary">
                  {progress_percentage}%
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
