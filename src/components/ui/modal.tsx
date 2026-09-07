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
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_dialog_shell } from "@/lib/use_dialog_shell";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface ModalProps {
  is_open: boolean;
  on_close: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  show_close_button?: boolean;
  close_on_overlay?: boolean;
  close_on_escape?: boolean;
  z_index?: number;
}

interface ModalHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface ModalBodyProps {
  children?: React.ReactNode;
  className?: string;
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

const modal_labels_context = React.createContext<{
  title_id: string;
  description_id: string;
} | null>(null);

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
  close_on_escape = true,
  z_index,
}: ModalProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const instance_id = React.useId().replace(/:/g, "");

  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(
      is_open,
      on_close,
      "modal",
      close_on_escape,
    );

  const label_ids = React.useMemo(
    () => ({
      title_id: `${instance_id}_title`,
      description_id: `${instance_id}_description`,
    }),
    [instance_id],
  );

  const overlay = (
    <AnimatePresence>
      {is_open && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: z_index ?? 60 }}
        >
          <div
            className="absolute inset-0 backdrop-blur-sm sm:backdrop-blur-md"
            style={{
              backgroundColor: "var(--modal-overlay)",
              transform: "translateZ(0)",
            }}
            onPointerDown={
              close_on_overlay ? handle_backdrop_pointer_down : undefined
            }
          />

          <motion.div
            ref={dialog_ref}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-describedby={label_ids.description_id}
            aria-labelledby={label_ids.title_id}
            aria-modal="true"
            className={cn(
              "relative w-full mx-4 my-4 rounded-xl border flex flex-col max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain outline-none focus:outline-none focus-visible:outline-none",
              SIZE_CLASSES[size],
            )}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97, y: 4 }}
            role="dialog"
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              outline: "none",
            }}
            tabIndex={-1}
            transition={{
              duration: reduce_motion ? 0 : 0.12,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {show_close_button && (
              <button
                aria-label={t("common.close")}
                className="aster_modal_close absolute end-5 top-5 z-10 flex items-center justify-center rounded-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style={{ width: 28, height: 28, padding: 0 }}
                type="button"
                onClick={on_close}
              >
                <XMarkIcon
                  className="text-txt-secondary"
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
              </button>
            )}
            <modal_labels_context.Provider value={label_ids}>
              {children}
            </modal_labels_context.Provider>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return overlay;

  return createPortal(overlay, document.body);
}

export function ModalHeader({ children, className }: ModalHeaderProps) {
  return (
    <div
      className={cn(
        "aster_modal_header flex flex-col px-6 pt-6 pb-5 pe-12",
        className,
      )}
    >
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
  const labels = React.useContext(modal_labels_context);

  return (
    <h3
      className={cn(
        "aster_modal_title w-full text-base font-semibold leading-tight",
        className,
      )}
      id={labels?.title_id}
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
  const labels = React.useContext(modal_labels_context);

  return (
    <p
      className={cn("text-[13px] w-full mt-2.5 leading-relaxed", className)}
      id={labels?.description_id}
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
