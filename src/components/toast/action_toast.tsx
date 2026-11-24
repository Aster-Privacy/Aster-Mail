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

import {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon,
  ExclamationCircleIcon,
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
import { publish_action_toast_box } from "@/components/toast/toast_offset";

export type UndoResultTone = "success" | "info" | "error";

export interface UndoToastResult {
  message: string;
  tone: UndoResultTone;
  keep_undo?: boolean;
}

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
    | "download"
    | "unsubscribe";
  email_ids: string[];
  on_undo?: () => Promise<void | UndoToastResult>;
  action_label?: string;
  progress?: { completed: number; total: number };
  on_cancel?: () => void;
  sound?: IconicSound | "none";
  hide_dismiss?: boolean;
  actions?: ActionToastButton[];
  resume_key?: string;
  result_tone?: UndoResultTone;
  is_undoing?: boolean;
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
  tone: UndoResultTone = "success",
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
    result_tone: tone,
    is_undoing: false,
    on_undo: undefined,
    actions: undefined,
    resume_key: undefined,
  };
  notify_toast_listeners();
  if (tone === "error") play_iconic_sound("fail");
  toast_timeout = setTimeout(end_current_toast, dismiss_after_ms);

  return true;
}

const UNDO_DONE_MS = 2000;
const UNDO_RESULT_MS = 5000;

let translate_undo_text: (key: TranslationKey) => string = (key) => key;

export function set_action_toast_translator(
  translate: (key: TranslationKey) => string,
): void {
  translate_undo_text = translate;
}

const undos_in_flight = new Map<string, Promise<void>>();

function patch_action_toast(
  toast_id: string,
  patch: Partial<ActionToastState>,
): void {
  if (resumable_toast?.state.id === toast_id) {
    resumable_toast = {
      ...resumable_toast,
      state: { ...resumable_toast.state, ...patch },
    };
  }
  if (current_toast?.id !== toast_id) return;
  current_toast = { ...current_toast, ...patch };
  notify_toast_listeners();
}

function find_action_toast(toast_id: string): ActionToastState | null {
  if (current_toast?.id === toast_id) return current_toast;

  const resumable = live_resumable_toast();

  return resumable?.state.id === toast_id ? resumable.state : null;
}

function bring_resumable_to_front(): ActionToastState | null {
  const resumable = live_resumable_toast();

  if (!resumable) return null;
  if (current_toast?.id === resumable.state.id) return current_toast;
  if (toast_timeout) clearTimeout(toast_timeout);
  held_toast_id = null;
  current_toast = resumable.state;
  notify_toast_listeners();
  toast_timeout = setTimeout(
    end_current_toast,
    resumable.expires_at - Date.now(),
  );

  return current_toast;
}

function keep_undo_after_result(
  toast_id: string,
  result: UndoToastResult,
): void {
  const resumable =
    resumable_toast?.state.id === toast_id ? live_resumable_toast() : null;

  patch_action_toast(toast_id, {
    message: result.message,
    result_tone: result.tone,
    is_undoing: false,
  });
  if (current_toast?.id !== toast_id) return;
  if (result.tone === "error") play_iconic_sound("fail");
  held_toast_id = null;
  if (toast_timeout) clearTimeout(toast_timeout);
  toast_timeout = setTimeout(
    end_current_toast,
    resumable
      ? Math.max(UNDO_RESULT_MS, resumable.expires_at - Date.now())
      : UNDO_RESULT_MS,
  );
}

function apply_undo_result(
  toast: ActionToastState,
  result: UndoToastResult,
): void {
  if (result.keep_undo && find_action_toast(toast.id)) {
    keep_undo_after_result(toast.id, result);

    return;
  }

  const dismiss_ms = result.tone === "success" ? UNDO_DONE_MS : UNDO_RESULT_MS;

  if (settle_undo_toast(toast, result.message, dismiss_ms, result.tone)) {
    return;
  }

  if (resumable_toast?.state.id === toast.id) resumable_toast = null;
  show_action_toast({
    message: result.message,
    action_type: toast.action_type,
    email_ids: toast.email_ids,
    sound: result.tone === "error" ? "fail" : "none",
    result_tone: result.tone,
    duration_ms: dismiss_ms,
  });
}

export function run_action_toast_undo(toast_id: string): Promise<void> {
  const running = undos_in_flight.get(toast_id);

  if (running) return running;

  const toast = find_action_toast(toast_id);
  const on_undo = toast?.on_undo;

  if (!toast || !on_undo) return Promise.resolve();

  patch_action_toast(toast_id, { is_undoing: true });
  if (current_toast?.id === toast_id) hold_action_toast();

  const run = (async () => {
    let result: UndoToastResult;

    try {
      const outcome = await on_undo();

      result = outcome ?? {
        message: translate_undo_text("common.action_undone"),
        tone: "success",
      };
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      result = {
        message: translate_undo_text("common.undo_failed"),
        tone: "error",
      };
    }
    apply_undo_result(find_action_toast(toast_id) ?? toast, result);
  })().finally(() => {
    undos_in_flight.delete(toast_id);
  });

  undos_in_flight.set(toast_id, run);

  return run;
}

export async function undo_action_toast_by_key(
  resume_key: string,
): Promise<boolean> {
  let toast = current_toast?.resume_key === resume_key ? current_toast : null;

  if (!toast && live_resumable_toast()?.state.resume_key === resume_key) {
    toast = bring_resumable_to_front();
  }
  if (!toast?.on_undo) return false;
  await run_action_toast_undo(toast.id);

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

export type ActionToastIcon =
  "check" | "error" | "info" | "warning" | "refresh" | "download";

export function resolve_toast_icon(toast: ActionToastState): ActionToastIcon {
  if (toast.result_tone === "error") return "error";
  if (toast.result_tone === "info") return "info";
  if (toast.result_tone === "success") return "check";

  switch (toast.action_type) {
    case "spam":
      return "warning";
    case "refresh":
      return "refresh";
    case "download":
      return "download";
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
      return "check";
    default:
      return "info";
  }
}

function render_toast_icon(icon: ActionToastIcon) {
  const icon_class = "w-4 h-4";

  switch (icon) {
    case "error":
      return <ExclamationCircleIcon className={`${icon_class} text-red-500`} />;
    case "warning":
      return <ExclamationTriangleIcon className={icon_class} />;
    case "refresh":
      return <ArrowPathIcon className={`${icon_class} animate-spin`} />;
    case "download":
      return <ArrowDownTrayIcon className={icon_class} />;
    case "check":
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
  const [is_island_up, set_is_island_up] = useState(island_visible);

  useEffect(() => {
    const listener = (new_toast: ActionToastState | null) => {
      set_toast(new_toast);
    };

    toast_listeners.add(listener);

    const island_listener = () => set_is_island_up(island_visible);

    island_listeners.add(island_listener);

    return () => {
      toast_listeners.delete(listener);
      island_listeners.delete(island_listener);
    };
  }, []);

  useEffect(() => {
    set_action_toast_translator((key) => t(key));
  }, [t]);

  const toast_id = toast?.id;
  const is_undoing = !!toast?.is_undoing;

  const handle_undo = useCallback(() => {
    if (!toast_id) return;
    void run_action_toast_undo(toast_id);
  }, [toast_id]);

  const handle_cancel = useCallback(() => {
    toast?.on_cancel?.();
    hide_action_toast();
  }, [toast]);

  const progress_percentage =
    toast?.progress && toast.progress.total > 0
      ? Math.round((toast.progress.completed / toast.progress.total) * 100)
      : 0;

  const { layout, y_offset, is_top } = use_toast_position(
    position,
    is_island_up,
  );
  const box_ref = useRef<HTMLDivElement | null>(null);
  const edge = "top" in layout.style ? layout.style.top : layout.style.bottom;

  useLayoutEffect(() => {
    const node = box_ref.current;

    if (!toast || !node) {
      publish_action_toast_box(null);

      return;
    }

    const publish = () =>
      publish_action_toast_box({
        height: node.getBoundingClientRect().height,
        edge,
        is_top,
      });

    publish();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(publish);

    observer.observe(node);

    return () => observer.disconnect();
  }, [toast, edge, is_top]);

  useEffect(() => () => publish_action_toast_box(null), []);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="action-toast"
          animate={{ opacity: 1, y: 0 }}
          className={`fixed ${layout.anchor} z-[100]`}
          data-popup-outside-ignore=""
          exit={{ opacity: 0, y: y_offset }}
          initial={reduce_motion ? false : { opacity: 0, y: y_offset }}
          style={layout.style}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <div
            ref={box_ref}
            aria-live={toast.result_tone === "error" ? "assertive" : "polite"}
            className={`rounded-[var(--aster-radius-floating,16px)] shadow-[var(--aster-floating-shadow)] flex flex-col bg-[var(--aster-floating-bg,var(--modal-bg))] ${
              toast.progress ? "gap-2.5 px-4 py-3" : "gap-2 px-4 py-2.5"
            }`}
            style={{
              minWidth: toast.progress
                ? "min(300px, calc(100vw - 32px))"
                : undefined,
              maxWidth: "min(480px, calc(100vw - 32px))",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 text-txt-primary">
                {render_toast_icon(resolve_toast_icon(toast))}
              </span>
              <span
                className={`min-w-0 text-[13px] font-medium leading-snug text-txt-primary ${
                  toast.progress
                    ? "flex-1 truncate"
                    : "line-clamp-2 break-words"
                }`}
                title={toast.progress ? undefined : toast.message}
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
                  aria-busy={is_undoing}
                  disabled={is_undoing}
                  type="button"
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
