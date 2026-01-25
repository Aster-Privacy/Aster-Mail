import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

type ToastIconType = "success" | "warning" | "error" | "info";

interface ToastState {
  id: string;
  message: string;
  icon_type?: ToastIconType;
}

let toast_listeners: ((toast: ToastState | null) => void)[] = [];
let current_toast: ToastState | null = null;
let toast_timeout: NodeJS.Timeout | null = null;

export function show_toast(message: string, icon_type?: ToastIconType) {
  if (toast_timeout) {
    clearTimeout(toast_timeout);
  }

  current_toast = {
    message,
    icon_type,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  toast_listeners.forEach((listener) => listener(current_toast));

  toast_timeout = setTimeout(() => {
    current_toast = null;
    toast_listeners.forEach((listener) => listener(null));
  }, 2000);
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

export function SimpleToast() {
  const [toast, set_toast] = useState<ToastState | null>(null);

  useEffect(() => {
    const listener = (new_toast: ToastState | null) => {
      set_toast(new_toast);
    };

    toast_listeners.push(listener);

    return () => {
      toast_listeners = toast_listeners.filter((l) => l !== listener);
    };
  }, []);

  const icon = toast ? get_toast_icon(toast.icon_type) : null;

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="simple-toast"
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]"
          exit={{ opacity: 0, y: 20 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="px-4 py-2.5 rounded-lg shadow-lg flex items-center justify-center gap-2"
            style={{
              backgroundColor: "var(--modal-bg)",
              border: "1px solid var(--border-secondary)",
            }}
          >
            {icon && (
              <span
                className="flex-shrink-0"
                style={{ color: "var(--text-primary)" }}
              >
                {icon}
              </span>
            )}
            <span
              className="text-[13px] font-medium text-center"
              style={{ color: "var(--text-primary)" }}
            >
              {toast.message}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
