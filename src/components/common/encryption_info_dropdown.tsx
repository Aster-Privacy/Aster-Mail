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

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckBadgeIcon,
  ShieldExclamationIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/solid";

import { LockIcon } from "@/components/common/icons";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

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

  useEffect(() => {
    if (!is_open) return;

    const handle_escape = (event: KeyboardEvent) => {
      if (event["key"] === "Escape") {
        set_is_open(false);
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => {
      document.removeEventListener("keydown", handle_escape);
    };
  }, [is_open]);

  if (!preferences.show_encryption_indicators) {
    return null;
  }

  const is_encrypted = !is_external || has_recipient_key;
  const lock_color = is_encrypted ? "rgb(59, 130, 246)" : "var(--text-muted)";

  return (
    <div className="relative inline-flex">
      <button
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

      <AnimatePresence>
        {is_open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                set_is_open(false);
              }}
            />
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="absolute left-0 top-full mt-2 z-50 w-64 rounded-lg border shadow-lg bg-surf-primary border-edge-secondary"
              exit={{ opacity: 0, y: -4 }}
              initial={reduce_motion ? false : { opacity: 0, y: -4 }}
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
                  <p className="pl-6">
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
                  <p className="pl-6 text-txt-muted">
                    AES-256-GCM · {has_pq_protection ? "ML-KEM-768" : "KEM-768"}
                  </p>
                  {sender_verification &&
                    sender_verification !== "unknown" && (
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
                        <p className="pl-6 mt-1">
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
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
