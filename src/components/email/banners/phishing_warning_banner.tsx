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
import type { PhishingSignal } from "@/lib/phishing_analyzer";
import type { PhishingLevel } from "@/lib/phishing_analyzer";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useCallback } from "react";
import {
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

function get_signal_descriptions(
  t: (key: TranslationKey) => string,
): Record<string, string> {
  return {
    dkim_fail: t("common.signal_dkim_fail"),
    spf_fail: t("common.signal_spf_fail"),
    dmarc_fail: t("common.signal_dmarc_fail"),
    all_auth_fail: t("common.signal_all_auth_fail"),
    all_auth_pass: t("common.signal_all_auth_pass"),
    reply_to_mismatch: t("common.signal_reply_to_mismatch"),
    missing_from: t("common.signal_missing_from"),
    missing_message_id: t("common.signal_missing_message_id"),
    multiple_from: t("common.signal_multiple_from"),
    future_dated: t("common.signal_future_dated"),
    domain_reputation_high: t("common.signal_domain_reputation_high"),
    domain_reputation_medium: t("common.signal_domain_reputation_medium"),
    domain_new: t("common.signal_domain_new"),
    user_reputation_high: t("common.signal_user_reputation_high"),
    rbl_spamhaus: t("common.signal_rbl_spamhaus"),
    rbl_barracuda: t("common.signal_rbl_barracuda"),
    rbl_other: t("common.signal_rbl_other"),
    display_name_brand_spoof: t("common.signal_display_name_brand_spoof"),
    display_name_email_spoof: t("common.signal_display_name_email_spoof"),
    domain_blocklist: t("common.signal_domain_blocklist"),
    safe_browsing_match: t("common.signal_safe_browsing_match"),
    url_on_blocklist: t("common.signal_url_on_blocklist"),
    homoglyph_domain: t("common.signal_homoglyph_domain"),
    display_name_brand_spoof_client: t(
      "common.signal_display_name_brand_spoof_client",
    ),
    display_name_email_mismatch: t("common.signal_display_name_email_mismatch"),
    urgency_language: t("common.signal_urgency_language"),
  };
}

function capitalize_first(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function get_signal_description(
  signal: PhishingSignal,
  descriptions: Record<string, string>,
): string {
  if (signal.description) return capitalize_first(signal.description);
  const mapped = descriptions[signal.name];

  if (mapped) return mapped;

  return capitalize_first(signal.name.replace(/_/g, " "));
}

interface PhishingWarningBannerProps {
  level: PhishingLevel;
  signals: PhishingSignal[];
  on_report_not_phishing?: () => void;
  on_acknowledge_danger?: () => void;
}

export function PhishingWarningBanner({
  level,
  signals,
  on_report_not_phishing,
  on_acknowledge_danger,
}: PhishingWarningBannerProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const signal_descriptions = get_signal_descriptions(t);
  const [dismissed, set_dismissed] = useState(false);
  const [show_details, set_show_details] = useState(false);
  const [confirm_text, set_confirm_text] = useState("");
  const [show_confirm, set_show_confirm] = useState(false);
  const [links_enabled, set_links_enabled] = useState(false);

  const visible_signals = signals.filter((s) => s.name !== "all_auth_pass");

  const handle_dismiss = useCallback(() => {
    set_dismissed(true);
  }, []);

  const handle_acknowledge = useCallback(() => {
    if (confirm_text.toLowerCase() === t("common.phishing_confirm_text")) {
      on_acknowledge_danger?.();
      set_show_confirm(false);
      set_show_details(false);
      set_links_enabled(true);
    }
  }, [confirm_text, on_acknowledge_danger]);

  if (level === "safe" || (level === "suspicious" && dismissed)) {
    return null;
  }

  if (level === "suspicious") {
    return (
      <div className="mb-4">
        <div className="rounded-lg bg-[#d97706]">
          <div className="flex items-start gap-3 px-4 py-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {t("common.suspicious_email_detected")}
              </p>
              <p className="text-xs text-white/80 mt-1">
                {t("common.phishing_warning_message")}
              </p>
              {visible_signals.length > 0 && (
                <button
                  className="text-xs text-white/70 mt-1.5 flex items-center gap-1 hover:text-white transition-colors"
                  type="button"
                  onClick={() => set_show_details(!show_details)}
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
                {show_details && visible_signals.length > 0 && (
                  <motion.div
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden"
                    exit={{ height: 0, opacity: 0 }}
                    initial={reduce_motion ? false : { height: 0, opacity: 0 }}
                    transition={{ duration: reduce_motion ? 0 : 0.2 }}
                  >
                    <ul className="mt-2 space-y-1">
                      {visible_signals.map((signal, i) => (
                        <li
                          key={i}
                          className="text-xs text-white/70 flex items-start gap-1.5"
                        >
                          <span className="text-white mt-0.5">•</span>
                          {get_signal_description(signal, signal_descriptions)}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {on_report_not_phishing && (
                <button
                  className="text-xs text-white/60 hover:text-white transition-colors"
                  type="button"
                  onClick={on_report_not_phishing}
                >
                  {t("common.not_phishing")}
                </button>
              )}
              <button
                className="rounded-md px-3 py-1.5 text-xs font-medium bg-white/20 text-white hover:bg-white/30 transition-colors"
                type="button"
                onClick={handle_dismiss}
              >
                {t("common.i_understand")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="rounded-lg bg-[#dc2626]">
        <div className="flex items-start gap-3 px-4 py-3">
          <ShieldExclamationIcon className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              {t("common.dangerous_email_links_disabled")}
            </p>
            <p className="text-xs text-white/80 mt-1">
              {t("common.phishing_danger_message")}
            </p>
            {!links_enabled && visible_signals.length > 0 && (
              <button
                className="text-xs text-white/70 mt-1.5 flex items-center gap-1 hover:text-white transition-colors"
                type="button"
                onClick={() => set_show_details(!show_details)}
              >
                {show_details
                  ? t("common.hide_reasons")
                  : t("common.show_reasons")}
                {show_details ? (
                  <ChevronUpIcon className="w-3 h-3" />
                ) : (
                  <ChevronDownIcon className="w-3 h-3" />
                )}
              </button>
            )}
            <AnimatePresence>
              {!links_enabled && show_details && visible_signals.length > 0 && (
                <motion.div
                  animate={{ height: "auto", opacity: 1 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0 }}
                  initial={reduce_motion ? false : { height: 0, opacity: 0 }}
                  transition={{ duration: reduce_motion ? 0 : 0.2 }}
                >
                  <ul className="mt-2 space-y-1">
                    {visible_signals.map((signal, i) => (
                      <li
                        key={i}
                        className="text-xs text-white/70 flex items-start gap-1.5"
                      >
                        <span className="text-white mt-0.5">•</span>
                        {get_signal_description(signal, signal_descriptions)}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
            {!links_enabled && !show_confirm && (
              <button
                className="text-xs text-white/50 mt-2 hover:text-white/70 transition-colors"
                type="button"
                onClick={() => set_show_confirm(true)}
              >
                {t("common.view_links_anyway")}
              </button>
            )}
            <AnimatePresence>
              {!links_enabled && show_confirm && (
                <motion.div
                  animate={{ height: "auto", opacity: 1 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0 }}
                  initial={reduce_motion ? false : { height: 0, opacity: 0 }}
                  transition={{ duration: reduce_motion ? 0 : 0.2 }}
                >
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      className="border-white/30 bg-white/10 text-white placeholder:text-white/50 w-56 focus:border-white/50"
                      placeholder={t("common.phishing_confirm_placeholder")}
                      size="sm"
                      type="text"
                      value={confirm_text}
                      onChange={(e) => set_confirm_text(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handle_acknowledge();
                      }}
                    />
                    <button
                      className="text-xs px-2 py-1.5 rounded font-medium bg-white/20 text-white hover:bg-white/30 disabled:opacity-30 transition-colors"
                      disabled={
                        confirm_text.toLowerCase() !==
                        t("common.i_understand_the_risks")
                      }
                      type="button"
                      onClick={handle_acknowledge}
                    >
                      {t("common.enable_links")}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {links_enabled && (
              <p className="text-xs text-white/60 mt-1.5">
                {t("common.links_re_enabled")}
              </p>
            )}
          </div>
          <div className="flex-shrink-0">
            {on_report_not_phishing && (
              <button
                className="text-xs text-white/60 hover:text-white transition-colors"
                type="button"
                onClick={on_report_not_phishing}
              >
                {t("common.not_phishing")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
