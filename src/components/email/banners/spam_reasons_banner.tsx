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

import { useState } from "react";
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

export interface SpamReasonSignal {
  name: string;
  score: number;
  category: string;
}

const REASON_KEYS: Record<string, TranslationKey> = {
  content_analysis: "mail.spam_reason_content_analysis",
  spf_fail: "mail.spam_reason_spf_fail",
  dkim_fail: "mail.spam_reason_dkim_fail",
  dmarc_fail: "mail.spam_reason_dmarc_fail",
  missing_from: "mail.spam_reason_missing_headers",
  missing_date: "mail.spam_reason_missing_headers",
  missing_message_id: "mail.spam_reason_missing_headers",
  reply_to_mismatch: "mail.spam_reason_reply_to_mismatch",
  future_dated: "mail.spam_reason_future_dated",
  phishing_url: "mail.spam_reason_phishing_url",
  phishing_domain: "mail.spam_reason_phishing_domain",
  user_spam_learning: "mail.spam_reason_user_spam_learning",
  global_domain_reputation: "mail.spam_reason_global_domain_reputation",
  auth_hard_fail: "mail.spam_reason_auth_hard_fail",
  sender_marked_spam: "mail.spam_reason_sender_marked_spam",
};

const ALWAYS_SHOWN = new Set(["auth_hard_fail", "sender_marked_spam"]);

interface SpamReasonsBannerProps {
  signals: SpamReasonSignal[];
  on_not_spam?: () => void;
}

export function SpamReasonsBanner({
  signals,
  on_not_spam,
}: SpamReasonsBannerProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [show_details, set_show_details] = useState(false);

  const qualifying_signals = signals.filter(
    (s) => s.score > 0 || ALWAYS_SHOWN.has(s.name),
  );
  const reason_labels = qualifying_signals
    .map((s) => REASON_KEYS[s.name])
    .filter((key): key is TranslationKey => Boolean(key))
    .map((key) => t(key));
  const unique_reasons = Array.from(new Set(reason_labels));

  if (qualifying_signals.length === 0) {
    return null;
  }

  return (
    <div className="mx-4 mt-2 mb-3 rounded-md bg-surface-2 border border-border">
      <div className="flex items-start gap-2 px-3 py-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-txt leading-snug">
            {t("mail.spam_reasons_title")}
          </p>
          {unique_reasons.length > 0 && (
            <button
              className="text-xs text-txt-muted mt-1 flex items-center gap-1 hover:text-txt transition-colors"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                set_show_details(!show_details);
              }}
            >
              {show_details
                ? t("common.hide_details")
                : t("common.show_details")}
              {show_details ? (
                <ChevronUpIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
            </button>
          )}
          <AnimatePresence>
            {show_details && unique_reasons.length > 0 && (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={reduce_motion ? false : { height: 0, opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.2 }}
              >
                <ul className="mt-2 space-y-1">
                  {unique_reasons.map((label) => (
                    <li
                      key={label}
                      className="text-xs text-txt-muted flex items-start gap-1.5"
                    >
                      <span className="mt-0.5">•</span>
                      {label}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {on_not_spam && (
          <button
            className="text-xs text-txt-muted hover:text-txt transition-colors flex-shrink-0"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              on_not_spam();
            }}
          >
            {t("mail.not_spam")}
          </button>
        )}
      </div>
    </div>
  );
}
