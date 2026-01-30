import type { Email } from "@/types/email";

import { motion } from "framer-motion";
import { useState, useCallback, useEffect } from "react";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import EmojiPicker from "@/components/compose/emoji_picker";
import {
  send_reply,
  cancel_mail_action,
  send_mail_now,
  type OriginalEmail,
} from "@/services/mail_actions";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/toast/simple_toast";

const ASTER_FOOTER =
  '<br><br><span style="color: var(--text-tertiary); font-size: 12px;">Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer" style="color: #3b82f6;">Aster Mail</a></span>';

type SendState = "idle" | "queued" | "sending" | "sent" | "error";

interface EmailReplySectionProps {
  email: Email;
  show_reply_menu: boolean;
  set_show_reply_menu: (show: boolean) => void;
  reply_text: string;
  set_reply_text: (text: string) => void;
}

export function EmailReplySection({
  email,
  show_reply_menu,
  set_show_reply_menu,
  reply_text,
  set_reply_text,
}: EmailReplySectionProps) {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();
  const [show_emoji_picker, set_show_emoji_picker] = useState(false);
  const [send_state, set_send_state] = useState<SendState>("idle");
  const [error_message, set_error_message] = useState<string | null>(null);
  const [queued_id, set_queued_id] = useState<string | null>(null);
  const [countdown, set_countdown] = useState(0);

  const undo_enabled = preferences.undo_send_enabled ?? true;
  const undo_seconds = undo_enabled
    ? Math.min(30, Math.max(1, preferences.undo_send_seconds ?? 3))
    : 0;

  useEffect(() => {
    if (!show_reply_menu) {
      set_send_state("idle");
      set_error_message(null);
      set_queued_id(null);
      set_countdown(0);
    }
  }, [show_reply_menu]);

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
      sender_email: email.sender.email,
      sender_name: email.sender.name,
      subject: email.subject,
      body: email.body || email.preview,
      timestamp: email.timestamp,
    };

    const message_with_signature =
      reply_text.trim() + ASTER_FOOTER + get_signature();

    const result = await send_reply(
      { original, message: message_with_signature },
      {
        on_complete: () => {
          set_send_state("sent");
          show_toast("Email sent.", "success");
          setTimeout(() => {
            set_reply_text("");
            set_show_reply_menu(false);
          }, 1000);
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
    email,
    preferences.undo_send_period,
    undo_seconds,
    get_signature,
    set_reply_text,
    set_show_reply_menu,
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
  };

  const handle_cancel = useCallback(() => {
    if (send_state === "queued" && queued_id) {
      cancel_mail_action(queued_id);
    }
    set_show_reply_menu(false);
    set_reply_text("");
  }, [send_state, queued_id, set_show_reply_menu, set_reply_text]);

  const is_disabled = send_state !== "idle";

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="px-6 py-3 border-t"
      initial={{ y: 10, opacity: 0 }}
      style={{
        borderColor: "var(--border-secondary)",
        backgroundColor: "var(--bg-card)",
      }}
      transition={{ duration: 0.3, delay: 0.3 }}
    >
      {!show_reply_menu ? (
        <motion.button
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200"
          whileHover={{
            scale: 1.02,
            boxShadow: "0 8px 16px rgba(59, 130, 246, 0.3)",
          }}
          whileTap={{ scale: 0.96 }}
          onClick={() => set_show_reply_menu(true)}
        >
          Reply
        </motion.button>
      ) : (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 p-3 rounded-lg border"
          exit={{ opacity: 0, y: 20 }}
          initial={{ opacity: 0, y: 20 }}
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
          transition={{
            duration: 0.25,
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 pb-3 border-b"
            initial={{ opacity: 0 }}
            style={{ borderColor: "var(--border-secondary)" }}
            transition={{ delay: 0.1 }}
          >
            <ProfileAvatar name={email.sender.name} size="sm" />
            <div className="flex-1">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Replying to {email.sender.name}
              </p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {email.sender.email}
              </p>
            </div>
          </motion.div>

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

          <motion.div
            animate={{ opacity: 1 }}
            className="relative"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.15 }}
          >
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm disabled:opacity-50"
              disabled={is_disabled}
              placeholder="Write your reply..."
              rows={3}
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--text-primary)",
              }}
              value={reply_text}
              onChange={(e) => set_reply_text(e.target.value)}
            />
          </motion.div>

          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="relative">
              <motion.button
                className="p-2 rounded-lg transition-colors disabled:opacity-50"
                disabled={is_disabled}
                style={{ backgroundColor: "transparent" }}
                whileHover={{ scale: is_disabled ? 1 : 1.1 }}
                whileTap={{ scale: is_disabled ? 1 : 0.9 }}
                onClick={() =>
                  !is_disabled && set_show_emoji_picker(!show_emoji_picker)
                }
                onMouseEnter={(e) =>
                  !is_disabled &&
                  (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                😊
              </motion.button>
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
          </motion.div>

          <motion.div
            animate={{ opacity: 1 }}
            className="flex gap-2 pt-1"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.25 }}
          >
            <motion.button
              className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:from-blue-400 disabled:to-blue-500 transition-all text-sm"
              disabled={!reply_text.trim() || is_disabled}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
              }}
              whileHover={{
                scale: reply_text.trim() && !is_disabled ? 1.02 : 1,
              }}
              whileTap={{
                scale: reply_text.trim() && !is_disabled ? 0.95 : 1,
              }}
              onClick={handle_send_reply}
            >
              {send_state === "sending" ? "Sending..." : "Send"}
            </motion.button>
            <motion.button
              className="px-4 py-2 border rounded-lg font-semibold transition-colors text-sm"
              style={{
                borderColor: "var(--border-secondary)",
                color: "var(--text-secondary)",
              }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={handle_cancel}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              Cancel
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
