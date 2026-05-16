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
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";

interface ModalProps {
  is_open: boolean;
  on_close: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  show_close_button?: boolean;
  close_on_overlay?: boolean;
  z_index?: number;
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
  "2xl": "max-w-[860px]",
  full: "max-w-[800px]",
};

export function Modal({
  is_open,
  on_close,
  children,
  size = "md",
  show_close_button = true,
  close_on_overlay = true,
  z_index,
}: ModalProps) {
  React.useEffect(() => {
    if (is_open) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [is_open]);

  const reduce_motion = use_should_reduce_motion();

  React.useEffect(() => {
    const handle_escape = (e: KeyboardEvent) => {
      if (e["key"] === "Escape" && is_open) {
        on_close();
      }
    };

    window.addEventListener("keydown", handle_escape);

    return () => window.removeEventListener("keydown", handle_escape);
  }, [is_open, on_close]);

  return (
    <AnimatePresence>
      {is_open && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: z_index ?? 60 }}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            style={{ backgroundColor: "var(--modal-overlay)" }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
            onClick={close_on_overlay ? on_close : undefined}
          />

          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "relative w-full mx-4 my-4 rounded-xl border flex flex-col max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain",
              SIZE_CLASSES[size],
            )}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97, y: 4 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{
              duration: reduce_motion ? 0 : 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {show_close_button && (
              <button
                className="aster_modal_close absolute right-5 top-4 z-10 p-1.5 rounded-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                type="button"
                onClick={on_close}
              >
                <XMarkIcon className="w-6 h-6" />
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
  return (
    <div className={cn("aster_modal_header flex flex-col px-6 pt-6 pb-5 pr-12", className)}>
      {children}
    </div>
  );
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
      className={cn(
        "aster_modal_title w-full text-base font-semibold leading-tight",
        className,
      )}
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
      className={cn("text-[13px] w-full mt-2.5 leading-relaxed", className)}
      style={{ color: "var(--text-tertiary)" }}
    >
      {children}
    </p>
  );
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn("aster_modal_body px-5 pb-5", className)}>
      {children}
    </div>
  );
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        "aster_modal_actions px-6 pb-6 pt-2 flex items-center justify-end gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
