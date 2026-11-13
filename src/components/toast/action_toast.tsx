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
  ArrowDownTrayIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { ButtonSpinner } from "@/components/ui/spinner";
import { play_iconic_sound, type IconicSound } from "@/services/iconic_sounds";
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
    | "refresh"
    | "download";
  email_ids: string[];
  on_undo?: () => Promise<void>;
  action_label?: string;
  progress?: { completed: number; total: number };
  on_cancel?: () => void;
  sound?: IconicSound | "none";
  hide_dismiss?: boolean;
  actions?: ActionToastButton[];
  resume_key?: string;
}

export interface ActionToastButton {
  label: string;
  on_press: () => void;
}

const DONE_SOUND_ACTIONS: ReadonlySet<ActionToastState["action_type"]> =
  new Set([
    "archive",
    "trash",
    "spam",
    "not_spam",
    "folder",
    "restore",
    "snooze",
  ]);

const toast_listeners = new Set<(toast: ActionToastState | null) => void>();
let current_toast: ActionToastState | null = null;
let toast_timeout: NodeJS.Timeout | null = null;
let progress_stall_timeout: NodeJS.Timeout | null = null;
let held_toast_id: string | null = null;
let resumable_toast: { state: ActionToastState; expires_at: number } | null =
  null;

const MIN_RESUME_MS = 500;

function notify_toast_listeners() {
  toast_listeners.forEach((listener) => listener(current_toast));
}

function live_resumable_toast() {
  if (!resumable_toast) return null;
  if (resumable_toast.expires_at - Date.now() < MIN_RESUME_MS) {
    resumable_toast = null;

    return null;
  }

  return resumable_toast;
}

function end_current_toast() {
  toast_timeout = null;
  held_toast_id = null;
  const resumable = live_resumable_toast();

  if (resumable && current_toast?.id !== resumable.state.id) {
    current_toast = resumable.state;
    notify_toast_listeners();
    toast_timeout = setTimeout(
      end_current_toast,
      resumable.expires_at - Date.now(),
    );

    return;
  }

  if (resumable && current_toast?.id === resumable.state.id) {
    resumable_toast = null;
  }
  current_toast = null;
  notify_toast_listeners();
}

export function release_action_toast(resume_key: string): void {
  if (resumable_toast?.state.resume_key === resume_key) {
    resumable_toast = null;
  }
  if (current_toast?.resume_key !== resume_key) return;
  if (current_toast.id === held_toast_id) return;
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }
  end_current_toast();
}

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
    end_current_toast();
  }, PROGRESS_STALL_MS);
}

export function hold_action_toast(): void {
  held_toast_id = current_toast?.id ?? null;
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }
}

export function settle_undo_toast(
  toast: ActionToastState,
  message: string,
  dismiss_after_ms: number,
): boolean {
  if (!current_toast || current_toast.id !== toast.id) return false;

  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }

  if (resumable_toast?.state.id === toast.id) resumable_toast = null;
  held_toast_id = null;
  current_toast = {
    ...current_toast,
    message,
    on_undo: undefined,
    actions: undefined,
  };
  notify_toast_listeners();
  toast_timeout = setTimeout(end_current_toast, dismiss_after_ms);

  return true;
}

export type ActionToastConfig = Omit<ActionToastState, "id"> & {
  duration_ms?: number;
};

export function show_action_toast(toast: ActionToastConfig) {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }

  const { duration_ms, ...state } = toast;

  held_toast_id = null;

  current_toast = {
    ...state,
    id: crypto.randomUUID(),
  };

  const visible_ms = duration_ms && duration_ms > 0 ? duration_ms : 5000;

  if (toast.resume_key && !toast.progress) {
    resumable_toast = {
      state: current_toast,
      expires_at: Date.now() + visible_ms,
    };
  }

  notify_toast_listeners();

  const sound =
    toast.sound ??
    (DONE_SOUND_ACTIONS.has(toast.action_type) ? "done" : "none");

  if (sound !== "none") play_iconic_sound(sound);

  if (toast.progress) {
    arm_progress_stall_timeout();
  } else {
    clear_progress_stall_timeout();
    const resumable = live_resumable_toast();
    const resumes_after = resumable && resumable.state.id !== current_toast.id;
    const own_ms = resumes_after
      ? Math.min(visible_ms, resumable.expires_at - Date.now())
      : visible_ms;

    toast_timeout = setTimeout(end_current_toast, own_ms);
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
  const resumable = live_resumable_toast();

  if (resumable && current_toast?.id === resumable.state.id) return;
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }
  clear_progress_stall_timeout();
  end_current_toast();
}

function get_icon_for_action(action_type: ActionToastState["action_type"]) {
  const icon_class = "w-4 h-4";

  switch (action_type) {
    case "spam":
      return <ExclamationTriangleIcon className={icon_class} />;
    case "refresh":
      return <ArrowPathIcon className={`${icon_class} animate-spin`} />;
    case "download":
      return <ArrowDownTrayIcon className={icon_class} />;
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
    hold_action_toast();
    try {
      await toast.on_undo();
      settle_undo_toast(toast, t("common.action_undone"), 2000);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      settle_undo_toast(toast, t("common.undo_failed"), 5000);
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
            className={`rounded-[var(--aster-radius-floating,16px)] shadow-[var(--aster-floating-shadow)] flex flex-col bg-[var(--aster-floating-bg,var(--modal-bg))] ${
              toast.progress ? "gap-2.5 px-4 py-3" : "gap-2 px-4 py-2.5"
            }`}
            style={{
              minWidth: toast.progress
                ? "min(300px, calc(100vw - 32px))"
                : undefined,
              maxWidth: "min(560px, calc(100vw - 32px))",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 text-txt-primary">
                {get_icon_for_action(toast.action_type)}
              </span>
              <span
                className={`min-w-0 text-[13px] font-medium text-txt-primary ${
                  toast.progress ? "flex-1 truncate" : "break-words"
                } ${toast.actions?.length ? "max-w-[260px] truncate" : ""}`}
                title={toast.actions?.length ? toast.message : undefined}
              >
                {toast.message}
              </span>
              {!toast.progress &&
                toast.actions?.map((action) => (
                  <button
                    key={action.label}
                    className="inline-flex flex-shrink-0 items-center whitespace-nowrap text-[13px] font-medium ms-1 underline text-brand"
                    type="button"
                    onClick={() => {
                      if (toast.resume_key) {
                        release_action_toast(toast.resume_key);
                      } else {
                        hide_action_toast();
                      }
                      action.on_press();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              {toast.on_undo && !toast.progress && (
                <button
                  className="inline-flex flex-shrink-0 items-center whitespace-nowrap text-[13px] font-medium ms-1 underline text-brand"
                  disabled={is_undoing}
                  onClick={handle_undo}
                >
                  {toast.action_label || t("common.undo")}
                  {is_undoing && <ButtonSpinner size="xs" />}
                </button>
              )}
              {!toast.hide_dismiss && (
                <button
                  aria-label={t("common.dismiss")}
                  className="flex-shrink-0 text-txt-muted hover:text-txt-primary hover:bg-edge-primary/60 rounded-full p-1 transition-colors ms-1"
                  onClick={handle_cancel}
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
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
