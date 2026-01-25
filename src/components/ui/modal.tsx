"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";

interface ModalProps {
  is_open: boolean;
  on_close: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  show_close_button?: boolean;
  close_on_overlay?: boolean;
}

interface ModalHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "max-w-[360px]",
  md: "max-w-[440px]",
  lg: "max-w-[520px]",
  xl: "max-w-[640px]",
  full: "max-w-[800px]",
};

export function Modal({
  is_open,
  on_close,
  children,
  size = "md",
  show_close_button = true,
  close_on_overlay = true,
}: ModalProps) {
  React.useEffect(() => {
    if (is_open) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [is_open]);

  React.useEffect(() => {
    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && is_open) {
        on_close();
      }
    };

    window.addEventListener("keydown", handle_escape);

    return () => window.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  return (
    <AnimatePresence>
      {is_open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{ backgroundColor: "var(--modal-overlay)" }}
            transition={{ duration: 0.15 }}
            onClick={close_on_overlay ? on_close : undefined}
          />

          <motion.div
            animate={{ opacity: 1 }}
            className={cn(
              "relative w-full mx-4 rounded-xl border overflow-hidden",
              SIZE_CLASSES[size],
            )}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            {show_close_button && (
              <button
                className="absolute right-3 top-3 z-10 p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: "var(--text-muted)" }}
                type="button"
                onClick={on_close}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ModalHeader({ children, className }: ModalHeaderProps) {
  return <div className={cn("px-6 pt-6 pb-5", className)}>{children}</div>;
}

export function ModalTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn("text-base font-semibold leading-tight", className)}
      style={{ color: "var(--text-primary)" }}
    >
      {children}
    </h3>
  );
}

export function ModalDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn("text-[13px] mt-1.5 leading-relaxed", className)}
      style={{ color: "var(--text-tertiary)" }}
    >
      {children}
    </p>
  );
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        "px-6 pb-6 pt-2 flex items-center justify-end gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
