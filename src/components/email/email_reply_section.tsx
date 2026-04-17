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
import type { Email } from "@/types/email";

import { motion } from "framer-motion";
import { useState, useCallback, useEffect, useRef } from "react";

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
import { use_i18n } from "@/lib/i18n/context";
import { use_signatures } from "@/contexts/signatures_context";
import { show_toast } from "@/components/toast/simple_toast";
import { is_system_email } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";
import { get_aster_footer } from "@/components/compose/compose_shared";

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
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();
  const [show_emoji_picker, set_show_emoji_picker] = useState(false);
  const [send_state, set_send_state] = useState<SendState>("idle");
  const is_sending_ref = useRef(false);
  const last_send_time_ref = useRef<number>(0);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [queued_id, set_queued_id] = useState<string | null>(null);
  const [countdown, set_countdown] = useState(0);

  const undo_enabled = preferences.undo_send_enabled ?? true;
  const undo_seconds = undo_enabled
    ? Math.min(30, Math.max(1, preferences.undo_send_seconds ?? 10))
    : 0;

  useEffect(() => {
    if (!show_reply_menu) {
      is_sending_ref.current = false;
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
    if (is_sending_ref.current) return;
    if (!reply_text.trim() || send_state !== "idle") return;

    const now = Date.now();

    if (now - last_send_time_ref.current < 2000) return;

    is_sending_ref.current = true;
    last_send_time_ref.current = now;
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
      reply_text.trim() +
      get_aster_footer(t, preferences.show_aster_branding) +
      get_signature();

    const result = await send_reply(
      { original, message: message_with_signature },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          set_send_state("sent");
          show_toast(t("common.email_sent"), "success");
          setTimeout(() => {
            set_reply_text("");
            set_show_reply_menu(false);
          }, 1000);
        },
        on_cancel: () => {
          is_sending_ref.current = false;
          set_send_state("idle");
          set_queued_id(null);
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          set_send_state("error");
          set_error_message(error);
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      set_queued_id(result.queued_id);
    } else if (!result.success) {
      is_sending_ref.current = false;
      set_send_state("error");
      set_error_message(result.error || t("common.failed_to_send_reply"));
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
    t,
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

  const reduce_motion = use_should_reduce_motion();
  const is_disabled = send_state !== "idle";

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="px-6 py-3 border-t border-edge-secondary bg-surf-card"
      initial={reduce_motion ? false : { y: 10, opacity: 0 }}
      transition={{ duration: reduce_motion ? 0 : 0.3, delay: 0.3 }}
    >
      {!show_reply_menu ? (
        <motion.button
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg shadow-md transition-shadow duration-200"
          disabled={is_system_email(email.sender.email)}
          style={{
            opacity: is_system_email(email.sender.email) ? 0.6 : 1,
            cursor: is_system_email(email.sender.email)
              ? "not-allowed"
              : "pointer",
          }}
          whileHover={
            is_system_email(email.sender.email)
              ? {}
              : {
                  scale: 1.02,
                  boxShadow: "0 8px 16px rgba(59, 130, 246, 0.3)",
                }
          }
          onClick={
            is_system_email(email.sender.email)
              ? undefined
              : () => set_show_reply_menu(true)
          }
        >
          {t("mail.reply")}
        </motion.button>
      ) : (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 p-3 rounded-lg border border-edge-secondary bg-surf-tertiary"
          exit={{ opacity: 0, y: 20 }}
          initial={reduce_motion ? false : { opacity: 0, y: 20 }}
          transition={{
            type: "tween",
            ease: "easeOut",
            duration: reduce_motion ? 0 : 0.25,
          }}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 pb-3 border-b border-edge-secondary"
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ delay: 0.1 }}
          >
            <ProfileAvatar
              use_domain_logo
              email={email.sender.email}
              name={email.sender.name}
              size="sm"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-txt-primary">
                {t("mail.replying_to", { name: email.sender.name })}
              </p>
              <p className="text-xs text-txt-tertiary">{email.sender.email}</p>
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
                  {`${t("mail.sending_in")} ${countdown}${t("common.seconds")}...`}
                </p>
                <div className="flex gap-2">
                  <button
                    className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    onClick={handle_undo}
                  >
                    {t("common.undo")}
                  </button>
                  <button
                    className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    onClick={handle_send_now}
                  >
                    {t("common.send_now")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {send_state === "sent" && (
            <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-700 dark:text-green-400">
                {t("mail.reply_sent_successfully")}
              </p>
            </div>
          )}

          <motion.div
            animate={{ opacity: 1 }}
            className="relative"
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ delay: 0.15 }}
          >
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="aster_input resize-none p-3 disabled:opacity-50"
              disabled={is_disabled}
              placeholder={t("mail.write_reply")}
              rows={3}
              value={reply_text}
              onChange={(e) => set_reply_text(e.target.value)}
            />
          </motion.div>

          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="relative">
              <motion.button
                className="p-2 rounded-lg transition-colors disabled:opacity-50"
                disabled={is_disabled}
                style={{ backgroundColor: "transparent" }}
                whileHover={{ scale: is_disabled ? 1 : 1.1 }}
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
            <span className="text-xs ml-auto text-txt-tertiary">
              {reply_text.length}/1000
            </span>
          </motion.div>

          <motion.div
            animate={{ opacity: 1 }}
            className="flex gap-2 pt-1"
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ delay: 0.25 }}
          >
            <motion.button
              className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:from-blue-400 disabled:to-blue-500 transition-all text-sm"
              disabled={!reply_text.trim() || is_disabled}
              transition={{
                type: "tween",
                ease: "easeOut",
                duration: 0.15,
              }}
              whileHover={{
                scale: reply_text.trim() && !is_disabled ? 1.02 : 1,
              }}
              onClick={handle_send_reply}
            >
              {send_state === "sending" ? t("common.sending") : t("mail.send")}
            </motion.button>
            <motion.button
              className="px-4 py-2 border border-edge-secondary rounded-lg font-semibold transition-colors text-sm hover_bg text-txt-secondary"
              transition={{
                type: "tween",
                ease: "easeOut",
                duration: 0.15,
              }}
              whileHover={{ scale: 1.02 }}
              onClick={handle_cancel}
            >
              {t("common.cancel")}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
