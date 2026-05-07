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
import { useState, useEffect, useCallback, forwardRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@aster/ui";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { BUTTON_COLORS } from "@/constants/modal";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { dispatch_undo_send_preview } from "@/components/toast/undo_send_preview_modal";

interface UndoSendToastProps {
  queue_id: string;
  recipient: string;
  subject: string;
  body?: string;
  to_list?: string[];
  cc_list?: string[];
  bcc_list?: string[];
  seconds_remaining: number;
  total_seconds: number;
  is_mac: boolean;
  is_mobile?: boolean;
  is_top?: boolean;
  on_undo: () => void;
  on_send_now: () => void;
  on_dismiss: () => void;
}

function truncate_text(text: string, max_length: number): string {
  if (text.length <= max_length) return text;

  return text.slice(0, max_length).trimEnd() + "\u2026";
}

export const UndoSendToast = forwardRef<HTMLDivElement, UndoSendToastProps>(
  function UndoSendToast(
    {
      queue_id,
      recipient,
      subject,
      body,
      to_list,
      cc_list,
      bcc_list,
      seconds_remaining,
      total_seconds,
      is_mac,
      is_mobile,
      is_top = false,
      on_undo,
      on_send_now,
      on_dismiss,
    },
    ref,
  ) {
    const reduce_motion = use_should_reduce_motion();
    const { t } = use_i18n();
    const [remaining, set_remaining] = useState(seconds_remaining);
    const [is_sending, set_is_sending] = useState(false);

    useEffect(() => {
      set_remaining(seconds_remaining);
    }, [seconds_remaining, queue_id]);

    useEffect(() => {
      if (remaining <= 0) {
        on_dismiss();

        return;
      }

      const interval = setInterval(() => {
        set_remaining((prev) => {
          const next = prev - 1;

          if (next <= 0) {
            clearInterval(interval);
            setTimeout(on_dismiss, 100);
          }

          return Math.max(0, next);
        });
      }, 1000);

      return () => clearInterval(interval);
    }, [remaining, on_dismiss, queue_id]);

    const display_subject = subject || t("mail.no_subject");
    const shortcut_key = is_mac ? "\u2318Z" : "Ctrl+Z";

    const get_countdown_color = () => {
      const ratio = remaining / total_seconds;

      if (ratio > 0.5) return "var(--text-primary)";
      if (ratio > 0.25) return "var(--color-warning)";

      return "var(--color-danger)";
    };

    const handle_undo = useCallback(() => {
      on_undo();
    }, [on_undo]);

    const handle_send_now = useCallback(() => {
      set_is_sending(true);
      on_send_now();
    }, [on_send_now]);

    const handle_view_message = useCallback(() => {
      if (!body) return;

      dispatch_undo_send_preview({
        subject,
        body,
        to: to_list || [recipient],
        cc: cc_list,
        bcc: bcc_list,
      });
    }, [body, subject, to_list, recipient, cc_list, bcc_list]);

    const y_offset = is_top ? -100 : 100;

    return (
      <motion.div
        ref={ref}
        animate={{ opacity: 1, y: 0 }}
        className="w-[340px] rounded-xl overflow-hidden bg-modal-bg"
        exit={{ opacity: 0, y: y_offset, scale: 0.95 }}
        initial={reduce_motion ? false : { opacity: 0, y: y_offset }}
        style={{
          boxShadow:
            "0 4px 24px rgba(0, 0, 0, 0.16), 0 1px 4px rgba(0, 0, 0, 0.08)",
        }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div className="border rounded-xl overflow-hidden border-edge-secondary">
          <div className="px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  <svg
                    aria-hidden="true"
                    className="w-5 h-5"
                    fill="currentColor"
                    style={{ color: BUTTON_COLORS.primary }}
                    viewBox="0 0 24 24"
                  >
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate text-txt-primary">
                    {t("mail.sending_in")}{" "}
                    <span
                      className="tabular-nums font-semibold"
                      style={{
                        color: get_countdown_color(),
                        transition: "color 0.3s ease",
                      }}
                    >
                      {remaining}s
                    </span>
                  </p>
                  <p
                    className="text-[11px] truncate text-txt-muted"
                    title={subject || t("mail.no_subject")}
                  >
                    {truncate_text(display_subject, 40)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  aria-label={t("mail.cancel_sending")}
                  className="font-medium text-white"
                  size="sm"
                  style={{ background: BUTTON_COLORS.primary }}
                  onClick={handle_undo}
                >
                  {t("common.undo")}
                </Button>
                <Button
                  aria-label={t("mail.send_immediately")}
                  className="font-medium"
                  disabled={is_sending}
                  size="sm"
                  variant="ghost"
                  onClick={handle_send_now}
                >
                  {is_sending ? "\u2026" : t("mail.send")}
                </Button>
                <button
                  aria-label={t("common.dismiss")}
                  className="flex-shrink-0 text-txt-muted hover:text-txt-primary transition-colors p-0.5"
                  onClick={on_dismiss}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-edge-secondary">
            <span className="text-[10px] text-txt-muted">
              {is_mobile ? (
                t("mail.tap_undo_to_cancel")
              ) : (
                <>
                  <kbd className="px-1 py-0.5 rounded text-[10px] font-medium bg-surf-tertiary text-txt-secondary">
                    {shortcut_key}
                  </kbd>{" "}
                  {t("mail.press_to_undo")}
                </>
              )}
            </span>
            {body && (
              <button
                className="text-[10px] font-medium transition-colors cursor-pointer text-txt-muted hover:text-txt-primary"
                onClick={handle_view_message}
              >
                {t("mail.view_message")}
              </button>
            )}
          </div>

          <motion.div
            key={queue_id}
            animate={{ width: "0%" }}
            aria-label={t("mail.cancel_sending")}
            className="h-0.5"
            initial={reduce_motion ? false : { width: "100%" }}
            role="progressbar"
            style={{ background: BUTTON_COLORS.primary }}
            transition={{
              duration: reduce_motion ? 0 : total_seconds,
              ease: "linear",
            }}
          />
        </div>
      </motion.div>
    );
  },
);
