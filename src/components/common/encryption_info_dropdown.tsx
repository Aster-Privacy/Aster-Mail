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
import type { SenderVerificationStatus } from "@/types/email";

import {
  useId,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckBadgeIcon,
  ShieldExclamationIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/solid";

import { LockIcon } from "@/components/common/icons";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_should_reduce_motion } from "@/provider";

const PANEL_WIDTH = 256;
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 8;

interface EncryptionInfoDropdownProps {
  is_external: boolean;
  has_pq_protection: boolean;
  has_recipient_key?: boolean;
  size?: number;
  label?: string;
  context?: "message" | "attachments";
  description_key?: import("@/lib/i18n").TranslationKey;
  sender_verification?: SenderVerificationStatus;
}

export function EncryptionInfoDropdown({
  is_external,
  has_pq_protection,
  has_recipient_key = false,
  size = 18,
  label,
  context = "message",
  description_key,
  sender_verification,
}: EncryptionInfoDropdownProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const reduce_motion = use_should_reduce_motion();
  const [is_open, set_is_open] = useState(false);
  const panel_id = useId();
  const container_ref = useRef<HTMLDivElement>(null);
  const panel_ref = useRef<HTMLDivElement>(null);
  const [panel_position, set_panel_position] = useState({ top: 0, left: 0 });
  const close_dropdown = useCallback(() => set_is_open(false), []);

  const place_panel = useCallback(() => {
    const trigger = container_ref.current;

    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const panel_width = panel_ref.current?.offsetWidth ?? PANEL_WIDTH;
    const panel_height = panel_ref.current?.offsetHeight ?? 0;
    const is_rtl = document.dir === "rtl";
    const preferred_left = is_rtl ? rect.right - panel_width : rect.left;
    const max_left = window.innerWidth - panel_width - VIEWPORT_MARGIN;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(preferred_left, Math.max(VIEWPORT_MARGIN, max_left)),
    );
    const below = rect.bottom + PANEL_GAP;
    const fits_below =
      below + panel_height + VIEWPORT_MARGIN <= window.innerHeight;
    const top = fits_below
      ? below
      : Math.max(VIEWPORT_MARGIN, rect.top - PANEL_GAP - panel_height);

    set_panel_position({ top, left });
  }, []);

  use_escape_layer(is_open, close_dropdown, "encryption_info_dropdown");

  useEffect(() => {
    if (!is_open) return;

    const handle_pointer_down = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target) return;
      if (container_ref.current?.contains(target)) return;
      if (panel_ref.current?.contains(target)) return;
      set_is_open(false);
    };

    document.addEventListener("pointerdown", handle_pointer_down);

    return () => {
      document.removeEventListener("pointerdown", handle_pointer_down);
    };
  }, [is_open]);

  useLayoutEffect(() => {
    if (!is_open) return;

    place_panel();
  }, [is_open, place_panel]);

  useEffect(() => {
    if (!is_open) return;

    const handle = () => place_panel();

    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);

    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [is_open, place_panel]);

  if (preferences.show_encryption_indicators === false) {
    return null;
  }

  const is_encrypted = !is_external || has_recipient_key;
  const lock_color = is_encrypted ? "rgb(59, 130, 246)" : "var(--text-muted)";

  return (
    <div ref={container_ref} className="relative inline-flex">
      <button
        aria-controls={is_open ? panel_id : undefined}
        aria-expanded={is_open}
        aria-haspopup="dialog"
        className="flex-shrink-0 flex items-center gap-1 transition-colors hover:opacity-80"
        style={{ color: lock_color }}
        onClick={(e) => {
          e.stopPropagation();
          set_is_open(!is_open);
        }}
      >
        <LockIcon size={size} />
        {label && <span className="text-xs font-medium">{label}</span>}
      </button>

      {createPortal(
        <AnimatePresence>
          {is_open && (
            <motion.div
              ref={panel_ref}
              animate={{ opacity: 1, y: 0 }}
              className="fixed z-[200] w-64 rounded-lg border shadow-lg bg-surf-primary border-edge-secondary"
              exit={{ opacity: 0, y: -4 }}
              id={panel_id}
              initial={reduce_motion ? false : { opacity: 0, y: -4 }}
              style={{ top: panel_position.top, left: panel_position.left }}
              transition={{
                duration: reduce_motion ? 0 : 0.15,
                ease: "easeOut",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3">
                <div className="text-xs space-y-2 text-txt-secondary">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-shrink-0"
                      style={{ color: lock_color }}
                    >
                      <LockIcon size={16} />
                    </div>
                    <p className="font-medium text-txt-primary">
                      {is_encrypted
                        ? t("common.end_to_end_encrypted_label")
                        : t("common.protected_in_transit")}
                    </p>
                  </div>
                  <p className="ps-6">
                    {description_key
                      ? t(description_key)
                      : context === "attachments"
                        ? is_encrypted
                          ? t("common.files_end_to_end_encrypted")
                          : t("common.files_protected_in_transit")
                        : is_encrypted
                          ? is_external
                            ? t("common.wkd_encrypted_description")
                            : t("common.only_you_and_sender")
                          : t("common.encrypted_in_transit_stored")}
                  </p>
                  <p className="ps-6 text-txt-muted">
                    AES-256-GCM · {has_pq_protection ? "ML-KEM-768" : "KEM-768"}
                  </p>
                  {sender_verification && sender_verification !== "unknown" && (
                    <div className="pt-2 mt-2 border-t border-edge-secondary">
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                          {sender_verification === "verified" && (
                            <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                          )}
                          {sender_verification === "invalid" && (
                            <ShieldExclamationIcon className="w-4 h-4 text-red-500" />
                          )}
                          {(sender_verification === "no_keys" ||
                            sender_verification === "unsigned") && (
                            <QuestionMarkCircleIcon className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                        <p className="font-medium text-txt-primary">
                          {sender_verification === "verified" &&
                            t("common.sender_verified")}
                          {sender_verification === "invalid" &&
                            t("common.sender_invalid")}
                          {sender_verification === "no_keys" &&
                            t("common.sender_no_keys")}
                          {sender_verification === "unsigned" &&
                            t("common.sender_unsigned")}
                        </p>
                      </div>
                      <p className="ps-6 mt-1">
                        {sender_verification === "verified" &&
                          t("common.sender_verified_desc")}
                        {sender_verification === "invalid" &&
                          t("common.sender_invalid_desc")}
                        {sender_verification === "no_keys" &&
                          t("common.sender_no_keys_desc")}
                        {sender_verification === "unsigned" &&
                          t("common.sender_unsigned_desc")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
