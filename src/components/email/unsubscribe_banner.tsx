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
import type { UnsubscribeInfo } from "@/types/email";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EnvelopeIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";
import {
  get_unsubscribe_display_text,
  get_sender_domain,
  perform_unsubscribe,
} from "@/utils/unsubscribe_detector";
import { track_subscription } from "@/services/api/subscriptions";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface UnsubscribeBannerProps {
  unsubscribe_info: UnsubscribeInfo;
  sender_email: string;
  sender_name: string;
  on_unsubscribed?: () => void;
}

type UnsubscribeState = "idle" | "loading" | "success" | "error";

export function UnsubscribeBanner({
  unsubscribe_info,
  sender_email,
  sender_name,
  on_unsubscribed,
}: UnsubscribeBannerProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [state, set_state] = useState<UnsubscribeState>("idle");
  const [error_message, set_error_message] = useState<string | null>(null);
  const [is_dismissed, set_is_dismissed] = useState(false);
  const tracked_ref = useRef(false);

  useEffect(() => {
    if (!unsubscribe_info.has_unsubscribe || tracked_ref.current) return;

    tracked_ref.current = true;
    let is_mounted = true;
    const abort_controller = new AbortController();

    track_subscription({
      sender_email,
      sender_name,
      unsubscribe_link: unsubscribe_info.unsubscribe_link,
      list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
    }).catch(() => {
      if (is_mounted) {
        tracked_ref.current = false;
      }
    });

    return () => {
      is_mounted = false;
      abort_controller.abort();
    };
  }, [sender_email, sender_name, unsubscribe_info]);

  if (!unsubscribe_info.has_unsubscribe || is_dismissed) {
    return null;
  }

  const domain = get_sender_domain(sender_email);
  const display_text = get_unsubscribe_display_text(unsubscribe_info);

  const handle_unsubscribe = async () => {
    set_state("loading");
    set_error_message(null);

    try {
      await perform_unsubscribe(sender_email, sender_name, unsubscribe_info);
      set_state("success");
      on_unsubscribed?.();
    } catch (err) {
      set_state("error");
      set_error_message(
        err instanceof Error ? err.message : t("common.failed_to_unsubscribe"),
      );
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1, y: 0, height: "auto" }}
        className="overflow-hidden"
        exit={{ opacity: 0, y: -10, height: 0 }}
        initial={reduce_motion ? false : { opacity: 0, y: -10, height: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        <div
          className="mx-6 mt-4 p-4 rounded-lg border flex items-start gap-3"
          style={{
            backgroundColor:
              state === "error" ? "#dc2626" : "var(--bg-secondary)",
            borderColor:
              state === "error" ? "#dc2626" : "var(--border-secondary)",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={
                state === "success"
                  ? "success"
                  : state === "error"
                    ? "error"
                    : "idle"
              }
              animate={{ opacity: 1, scale: 1 }}
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              exit={{ opacity: 0, scale: 0.8 }}
              initial={reduce_motion ? false : { opacity: 0, scale: 0.8 }}
              style={{
                backgroundColor:
                  state === "error"
                    ? "rgba(255, 255, 255, 0.2)"
                    : "rgba(59, 130, 246, 0.1)",
              }}
              transition={{ duration: reduce_motion ? 0 : 0.2 }}
            >
              {state === "success" ? (
                <CheckIcon className="w-5 h-5 text-brand" />
              ) : state === "error" ? (
                <XMarkIcon className="w-5 h-5 text-white" />
              ) : (
                <EnvelopeIcon className="w-5 h-5 text-brand" />
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={state}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                initial={reduce_motion ? false : { opacity: 0, y: 4 }}
                transition={{ duration: reduce_motion ? 0 : 0.2 }}
              >
                {state === "success" ? (
                  <>
                    <p className="text-[14px] font-medium text-txt-primary">
                      {t("mail.successfully_unsubscribed")}
                    </p>
                    <p className="text-[13px] mt-0.5 text-txt-secondary">
                      {t("mail.unsubscribe_success_message", {
                        sender: sender_name || domain,
                      })}
                    </p>
                  </>
                ) : state === "error" ? (
                  <>
                    <p className="text-[14px] font-medium text-white">
                      {t("mail.unsubscribe_failed")}
                    </p>
                    <p className="text-[13px] mt-0.5 text-white/80">
                      {error_message || t("mail.unsubscribe_try_again")}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[14px] font-medium text-txt-primary">
                      {display_text}
                    </p>
                    <p className="text-[13px] mt-0.5 text-txt-secondary">
                      {t("mail.stop_receiving_from")}{" "}
                      <span className="font-medium">{domain}</span>
                    </p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {state === "idle" && (
              <>
                {unsubscribe_info.method === "one-click" && (
                  <button
                    className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white"
                    type="button"
                    onClick={handle_unsubscribe}
                  >
                    {t("mail.unsubscribe")}
                  </button>
                )}
                {unsubscribe_info.method === "link" && (
                  <button
                    className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white flex items-center gap-1.5"
                    type="button"
                    onClick={handle_unsubscribe}
                  >
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    {t("mail.unsubscribe")}
                  </button>
                )}
                {unsubscribe_info.method === "mailto" && (
                  <button
                    className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white"
                    type="button"
                    onClick={handle_unsubscribe}
                  >
                    {t("mail.send_email")}
                  </button>
                )}
                <button
                  className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-txt-muted"
                  onClick={() => set_is_dismissed(true)}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </>
            )}
            {state === "loading" && (
              <Spinner className="text-txt-muted" size="md" />
            )}
            {(state === "success" || state === "error") && (
              <button
                className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-txt-muted"
                onClick={() => set_is_dismissed(true)}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
