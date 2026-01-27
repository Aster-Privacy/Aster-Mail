import type { DecryptedThreadMessage } from "@/types/thread";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, useRef, forwardRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import EmojiPicker from "@/components/emoji_picker";
import {
  send_reply,
  cancel_mail_action,
  send_mail_now,
  type OriginalEmail,
} from "@/services/mail_actions";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/simple_toast";
import { emit_thread_reply_sent } from "@/hooks/mail_events";

const ASTER_FOOTER =
  '<br><br><span style="color: var(--text-tertiary); font-size: 12px;">Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer" style="color: #3b82f6;">Aster Mail</a></span>';

type SendState = "idle" | "queued" | "sending" | "sent" | "error";

interface InlineReplySectionProps {
  email_id: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  timestamp: string;
  thread_token?: string;
  is_visible: boolean;
  on_close: () => void;
  on_reply_sent: (message: DecryptedThreadMessage) => void;
}

export const InlineReplySection = forwardRef<
  HTMLDivElement,
  InlineReplySectionProps
>(function InlineReplySection(
  {
    email_id,
    sender_name,
    sender_email,
    subject,
    body,
    timestamp,
    thread_token,
    is_visible,
    on_close,
    on_reply_sent,
  },
  ref,
) {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();
  const [reply_text, set_reply_text] = useState("");
  const [show_emoji_picker, set_show_emoji_picker] = useState(false);
  const [send_state, set_send_state] = useState<SendState>("idle");
  const [error_message, set_error_message] = useState<string | null>(null);
  const [queued_id, set_queued_id] = useState<string | null>(null);
  const [countdown, set_countdown] = useState(0);
  const textarea_ref = useRef<HTMLTextAreaElement>(null);

  const undo_enabled = preferences.undo_send_enabled ?? true;
  const undo_seconds = undo_enabled
    ? Math.min(30, Math.max(1, preferences.undo_send_seconds ?? 3))
    : 0;

  useEffect(() => {
    if (!is_visible) {
      set_send_state("idle");
      set_error_message(null);
      set_queued_id(null);
      set_countdown(0);
    } else {
      setTimeout(() => {
        textarea_ref.current?.focus();
      }, 100);
    }
  }, [is_visible]);

  useEffect(() => {
    if (send_state !== "queued") return;

    const timer = setInterval(() => {
      set_countdown((prev) => {
        if (prev <= 1) {
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [send_state]);

  const get_signature = useCallback((): string => {
    if (!user || preferences.signature_mode === "disabled") {
      return "";
    }

    if (preferences.signature_mode === "auto" && default_signature) {
      return get_formatted_signature(default_signature);
    }

    return "";
  }, [
    user,
    preferences.signature_mode,
    default_signature,
    get_formatted_signature,
  ]);

  const handle_send_reply = useCallback(async () => {
    if (!reply_text.trim() || send_state !== "idle") return;

    set_error_message(null);
    set_send_state("queued");
    set_countdown(undo_seconds);

    const original: OriginalEmail = {
      sender_email: sender_email,
      sender_name: sender_name,
      subject: subject,
      body: body,
      timestamp: timestamp,
    };

    const message_with_signature =
      reply_text.trim() + ASTER_FOOTER + get_signature();

    const result = await send_reply(
      {
        original,
        message: message_with_signature,
        thread_token,
        original_email_id: email_id,
      },
      {
        on_complete: () => {
          set_send_state("sent");
          show_toast("Email sent.", "success");

          if (thread_token) {
            emit_thread_reply_sent({
              thread_token,
              original_email_id: email_id,
            });
          }

          const new_message: DecryptedThreadMessage = {
            id: `temp_${Date.now()}`,
            item_type: "sent",
            sender_name: user?.display_name || user?.email || "Me",
            sender_email: user?.email || "",
            subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
            body: reply_text.trim(),
            timestamp: new Date().toISOString(),
            is_read: true,
            is_starred: false,
            is_deleted: false,
          };

          on_reply_sent(new_message);

          setTimeout(() => {
            set_reply_text("");
            on_close();
          }, 500);
        },
        on_cancel: () => {
          set_send_state("idle");
          set_queued_id(null);
        },
        on_error: (error) => {
          set_send_state("error");
          set_error_message(error);
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      set_queued_id(result.queued_id);
    } else if (!result.success) {
      set_send_state("error");
      set_error_message(result.error || "Failed to send reply");
    }
  }, [
    reply_text,
    send_state,
    sender_email,
    sender_name,
    subject,
    body,
    timestamp,
    thread_token,
    email_id,
    preferences.undo_send_period,
    undo_seconds,
    get_signature,
    user,
    on_reply_sent,
    on_close,
  ]);

  const handle_undo = useCallback(() => {
    if (!queued_id) return;
    cancel_mail_action(queued_id);
    set_send_state("idle");
    set_queued_id(null);
    set_countdown(0);
  }, [queued_id]);

  const handle_send_now = useCallback(() => {
    if (!queued_id) return;
    send_mail_now(queued_id);
    set_send_state("sending");
  }, [queued_id]);

  const handle_emoji_select = (emoji: string) => {
    set_reply_text(reply_text + emoji);
    set_show_emoji_picker(false);
    textarea_ref.current?.focus();
  };

  const handle_cancel = useCallback(() => {
    if (send_state === "queued" && queued_id) {
      cancel_mail_action(queued_id);
    }
    set_reply_text("");
    on_close();
  }, [send_state, queued_id, on_close]);

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handle_send_reply();
      }
    },
    [handle_send_reply],
  );

  const is_disabled = send_state !== "idle";

  return (
    <div ref={ref}>
      <AnimatePresence>
        {is_visible && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="mt-6 border rounded-lg overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            style={{
              borderColor: "var(--border-secondary)",
              backgroundColor: "var(--bg-card)",
            }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{
                borderColor: "var(--border-secondary)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div className="flex items-center gap-3">
                <ProfileAvatar name={sender_name} size="sm" />
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Reply to {sender_name}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {sender_email}
                  </p>
                </div>
              </div>
              <button
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-muted)" }}
                onClick={handle_cancel}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {error_message && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {error_message}
                  </p>
                </div>
              )}

              {send_state === "queued" && (
                <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      Sending in {countdown}s...
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                        onClick={handle_undo}
                      >
                        Undo
                      </button>
                      <button
                        className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                        onClick={handle_send_now}
                      >
                        Send now
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {send_state === "sent" && (
                <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Reply sent successfully
                  </p>
                </div>
              )}

              <textarea
                ref={textarea_ref}
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm disabled:opacity-50"
                disabled={is_disabled}
                placeholder="Write your reply..."
                rows={4}
                style={{
                  backgroundColor: "var(--input-bg)",
                  borderColor: "var(--input-border)",
                  color: "var(--text-primary)",
                }}
                value={reply_text}
                onChange={(e) => set_reply_text(e.target.value)}
                onKeyDown={handle_key_down}
              />

              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    className="p-2 rounded-lg transition-colors disabled:opacity-50"
                    disabled={is_disabled}
                    style={{ backgroundColor: "transparent" }}
                    onClick={() =>
                      !is_disabled && set_show_emoji_picker(!show_emoji_picker)
                    }
                    onMouseEnter={(e) =>
                      !is_disabled &&
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    😊
                  </button>
                  {show_emoji_picker && !is_disabled && (
                    <EmojiPicker on_select={handle_emoji_select} />
                  )}
                </div>
                <span
                  className="text-xs ml-auto"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {reply_text.length}/1000
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!reply_text.trim() || is_disabled}
                  style={{
                    background: reply_text.trim() && !is_disabled
                      ? "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)"
                      : "var(--bg-tertiary)",
                    color: reply_text.trim() && !is_disabled
                      ? "#ffffff"
                      : "var(--text-muted)",
                    boxShadow: reply_text.trim() && !is_disabled
                      ? "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "none",
                  }}
                  onClick={handle_send_reply}
                >
                  {send_state === "sending" ? "Sending..." : "Send"}
                </button>
                <button
                  className="px-4 py-2.5 border rounded-lg font-medium transition-colors text-sm"
                  style={{
                    borderColor: "var(--border-secondary)",
                    color: "var(--text-secondary)",
                  }}
                  onClick={handle_cancel}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  Cancel
                </button>
              </div>

              <p
                className="text-xs text-center"
                style={{ color: "var(--text-muted)" }}
              >
                Press ⌘+Enter to send
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
