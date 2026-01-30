import { useState, useEffect, useCallback, forwardRef } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { BUTTON_COLORS } from "@/constants/modal";

interface UndoSendToastProps {
  queue_id: string;
  recipient: string;
  subject: string;
  seconds_remaining: number;
  total_seconds: number;
  is_mac: boolean;
  on_undo: () => void;
  on_send_now: () => void;
  on_dismiss: () => void;
}

function truncate_text(text: string, max_length: number): string {
  if (text.length <= max_length) return text;

  return text.slice(0, max_length - 3) + "...";
}

export const UndoSendToast = forwardRef<HTMLDivElement, UndoSendToastProps>(
  function UndoSendToast(
    {
      queue_id,
      recipient,
      subject,
      seconds_remaining,
      total_seconds,
      is_mac,
      on_undo,
      on_send_now,
      on_dismiss,
    },
    ref,
  ) {
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

    const display_recipient = truncate_text(recipient, 30);
    const display_subject = subject
      ? truncate_text(subject, 25)
      : "(No subject)";
    const shortcut_key = is_mac ? "⌘Z" : "Ctrl+Z";

    const get_countdown_color = () => {
      const ratio = remaining / total_seconds;

      if (ratio > 0.5) return "var(--text-primary)";
      if (ratio > 0.25) return "#f59e0b";

      return "#ef4444";
    };

    const handle_undo = useCallback(() => {
      on_undo();
    }, [on_undo]);

    const handle_send_now = useCallback(() => {
      set_is_sending(true);
      on_send_now();
    }, [on_send_now]);

    return (
      <motion.div
        ref={ref}
        layout
        animate={{ opacity: 1, y: 0 }}
        className="w-[360px] shadow-2xl rounded-lg overflow-hidden"
        exit={{ opacity: 0, y: 100 }}
        initial={{ opacity: 0, y: 100 }}
        style={{
          backgroundColor: "var(--modal-bg)",
          borderColor: "var(--border-primary)",
        }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div
          className="border rounded-lg overflow-hidden"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0 mt-0.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <svg
                      aria-hidden="true"
                      className="w-4 h-4"
                      fill="currentColor"
                      style={{ color: "var(--text-secondary)" }}
                      viewBox="0 0 24 24"
                    >
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Sending in{" "}
                    <span
                      style={{
                        color: get_countdown_color(),
                        fontWeight: 600,
                        transition: "color 0.3s ease",
                      }}
                    >
                      {remaining}s
                    </span>
                    ...
                  </p>
                  <p
                    className="text-xs truncate mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                    title={recipient}
                  >
                    To: {display_recipient}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--text-muted)" }}
                    title={subject || "(No subject)"}
                  >
                    {display_subject}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  aria-label="Cancel sending email"
                  className="font-medium text-white"
                  size="sm"
                  style={{ background: BUTTON_COLORS.primary }}
                  onClick={handle_undo}
                >
                  Undo
                </Button>
                <Button
                  aria-label="Send email immediately"
                  className="font-medium"
                  disabled={is_sending}
                  size="sm"
                  variant="ghost"
                  onClick={handle_send_now}
                >
                  {is_sending ? "..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
          <div
            className="border-t"
            style={{ borderColor: "var(--border-secondary)" }}
          />
          <div className="flex items-center justify-center py-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Press{" "}
              <kbd
                className="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
              >
                {shortcut_key}
              </kbd>{" "}
              to undo
            </span>
          </div>
          <motion.div
            key={queue_id}
            animate={{ width: "0%" }}
            aria-label="Time remaining to cancel send"
            className="h-1"
            initial={{ width: "100%" }}
            role="progressbar"
            style={{ background: BUTTON_COLORS.primary }}
            transition={{ duration: total_seconds, ease: "linear" }}
          />
        </div>
      </motion.div>
    );
  },
);
