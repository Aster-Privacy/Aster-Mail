import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

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
    | "pin"
    | "restore"
    | "not_spam"
    | "snooze"
    | "progress";
  email_ids: string[];
  on_undo?: () => Promise<void>;
  progress?: { completed: number; total: number };
  on_cancel?: () => void;
}

const toast_listeners = new Set<(toast: ActionToastState | null) => void>();
let current_toast: ActionToastState | null = null;
let toast_timeout: NodeJS.Timeout | null = null;

export function show_action_toast(toast: Omit<ActionToastState, "id">) {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
    toast_timeout = null;
  }

  current_toast = {
    ...toast,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  toast_listeners.forEach((listener) => listener(current_toast));

  if (!toast.progress) {
    toast_timeout = setTimeout(() => {
      current_toast = null;
      toast_listeners.forEach((listener) => listener(null));
    }, 5000);
  }
}

export function update_progress_toast(completed: number, total: number) {
  if (!current_toast?.progress) return;

  current_toast = {
    ...current_toast,
    progress: { completed, total },
    message: `Processing ${completed} of ${total}...`,
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
      return <CheckIcon className={icon_class} />;
    default:
      return <InformationCircleIcon className={icon_class} />;
  }
}

export function ActionToast() {
  const [toast, set_toast] = useState<ActionToastState | null>(null);
  const [is_undoing, set_is_undoing] = useState(false);

  useEffect(() => {
    const listener = (new_toast: ActionToastState | null) => {
      set_toast(new_toast);
      set_is_undoing(false);
    };

    toast_listeners.add(listener);

    return () => {
      toast_listeners.delete(listener);
    };
  }, []);

  const handle_undo = useCallback(async () => {
    if (!toast?.on_undo || is_undoing) return;

    set_is_undoing(true);
    try {
      await toast.on_undo();
      hide_action_toast();
    } catch {
      set_toast((prev) =>
        prev
          ? {
              ...prev,
              message: "Undo failed. Please try again.",
              on_undo: undefined,
            }
          : null,
      );
    } finally {
      set_is_undoing(false);
    }
  }, [toast, is_undoing]);

  const handle_cancel = useCallback(() => {
    toast?.on_cancel?.();
    hide_action_toast();
  }, [toast]);

  const progress_percentage =
    toast?.progress && toast.progress.total > 0
      ? Math.round((toast.progress.completed / toast.progress.total) * 100)
      : 0;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]"
          exit={{ opacity: 0, y: 20 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="px-4 py-2.5 rounded-lg shadow-lg flex flex-col gap-2"
            style={{
              backgroundColor: "var(--modal-bg)",
              border: "1px solid var(--border-secondary)",
              minWidth: toast.progress ? "280px" : undefined,
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <span
                className="flex-shrink-0"
                style={{ color: "var(--text-primary)" }}
              >
                {get_icon_for_action(toast.action_type)}
              </span>
              <span
                className="text-[13px] font-medium text-center"
                style={{ color: "var(--text-primary)" }}
              >
                {toast.message}
              </span>
              {toast.on_undo && !toast.progress && (
                <button
                  className="text-[13px] font-medium ml-1 hover:underline"
                  disabled={is_undoing}
                  style={{ color: "var(--accent-blue)" }}
                  onClick={handle_undo}
                >
                  {is_undoing ? "..." : "Undo"}
                </button>
              )}
              {toast.on_cancel && toast.progress && (
                <button
                  className="text-[13px] font-medium ml-1 hover:underline"
                  style={{ color: "var(--accent-blue)" }}
                  onClick={handle_cancel}
                >
                  Cancel
                </button>
              )}
            </div>
            {toast.progress && (
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--border-primary)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      backgroundColor: "var(--accent-blue)",
                      width: `${progress_percentage}%`,
                    }}
                  />
                </div>
                <span
                  className="text-xs font-medium min-w-[32px] text-right"
                  style={{ color: "var(--text-secondary)" }}
                >
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
