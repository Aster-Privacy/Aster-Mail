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
import type { DecryptedThreadMessage } from "@/types/thread";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, useRef, forwardRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

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
import { emit_thread_reply_sent } from "@/hooks/mail_events";
import { use_should_reduce_motion } from "@/provider";
import {
  create_draft,
  update_draft,
  delete_draft,
  type DraftContent,
} from "@/services/api/multi_drafts";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { get_aster_footer } from "@/components/compose/compose_shared";
import { build_badge_html } from "@/components/compose/compose_draft_helpers";
import { fetch_my_badges, type Badge } from "@/services/api/user";

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
  on_sending_start?: (message: DecryptedThreadMessage) => void;
  on_sending_end?: () => void;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: DraftContent;
  }) => void;
  existing_draft?: {
    id: string;
    version: number;
    reply_to_id?: string;
    content: DraftContent;
  } | null;
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
    on_sending_start,
    on_sending_end,
    on_draft_saved,
    existing_draft,
  },
  ref,
) {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { default_signature, get_formatted_signature } = use_signatures();
  const reduce_motion = use_should_reduce_motion();

  const matching_draft =
    existing_draft &&
    (!existing_draft.reply_to_id || existing_draft.reply_to_id === email_id)
      ? existing_draft
      : null;

  const [reply_text, set_reply_text] = useState(
    matching_draft?.content.message ?? "",
  );
  const [show_emoji_picker, set_show_emoji_picker] = useState(false);
  const [send_state, set_send_state] = useState<SendState>("idle");
  const [error_message, set_error_message] = useState<string | null>(null);
  const [queued_id, set_queued_id] = useState<string | null>(null);
  const [countdown, set_countdown] = useState(0);
  const [draft_id, set_draft_id] = useState<string | null>(
    matching_draft?.id ?? null,
  );
  const [draft_version, set_draft_version] = useState<number>(
    matching_draft?.version ?? 1,
  );
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const save_draft_timeout = useRef<number | null>(null);
  const last_saved_text = useRef<string>(
    matching_draft?.content.message ?? "",
  );
  const is_sending_ref = useRef(false);
  const last_send_time_ref = useRef<number>(0);
  const reply_text_ref = useRef(reply_text);
  const save_draft_fn_ref = useRef<(text: string) => Promise<void>>(
    async () => {},
  );
  const prev_visible_ref = useRef(false);
  const [badges, set_badges] = useState<Badge[]>([]);

  useEffect(() => {
    fetch_my_badges().then((r) => {
      if (r.data) set_badges(r.data);
    });
  }, []);

  const undo_enabled = preferences.undo_send_enabled ?? true;
  const undo_seconds = undo_enabled
    ? Math.min(30, Math.max(1, preferences.undo_send_seconds ?? 10))
    : 0;

  useEffect(() => {
    if (!is_visible) {
      is_sending_ref.current = false;
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

  const save_thread_draft = useCallback(
    async (text: string) => {
      if (!thread_token || !text.trim()) return;

      const vault = get_vault_from_memory();

      if (!vault) return;

      const content: DraftContent = {
        to_recipients: [sender_email],
        cc_recipients: [],
        bcc_recipients: [],
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        message: text,
      };

      if (draft_id) {
        const result = await update_draft(
          draft_id,
          content,
          draft_version,
          vault,
          "reply",
          email_id,
          undefined,
          thread_token,
        );

        if (result.data) {
          set_draft_version(result.data.version);
          last_saved_text.current = text;
          on_draft_saved?.({
            id: draft_id,
            version: result.data.version,
            content,
          });
        }
      } else {
        const result = await create_draft(
          content,
          vault,
          "reply",
          email_id,
          undefined,
          thread_token,
        );

        if (result.data) {
          set_draft_id(result.data.id);
          set_draft_version(result.data.version);
          last_saved_text.current = text;
          on_draft_saved?.({
            id: result.data.id,
            version: result.data.version,
            content,
          });
        }
      }
    },
    [
      thread_token,
      sender_email,
      subject,
      email_id,
      draft_id,
      draft_version,
      on_draft_saved,
    ],
  );

  save_draft_fn_ref.current = save_thread_draft;
  reply_text_ref.current = reply_text;

  useEffect(() => {
    if (prev_visible_ref.current && !is_visible) {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
        save_draft_timeout.current = null;
      }
      if (!is_sending_ref.current) {
        const current_text = reply_text_ref.current;
        if (
          current_text !== last_saved_text.current &&
          current_text.trim() &&
          thread_token
        ) {
          save_draft_fn_ref.current(current_text);
        }
      }
    }
    prev_visible_ref.current = is_visible;
  }, [is_visible, thread_token]);

  useEffect(() => {
    if (!is_visible || !thread_token || !reply_text.trim()) return;
    if (reply_text === last_saved_text.current) return;

    if (save_draft_timeout.current) {
      clearTimeout(save_draft_timeout.current);
    }

    save_draft_timeout.current = window.setTimeout(() => {
      save_thread_draft(reply_text);
    }, 1500);

    return () => {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
      }
    };
  }, [is_visible, thread_token, reply_text, save_thread_draft]);

  useEffect(() => {
    return () => {
      if (save_draft_timeout.current) {
        clearTimeout(save_draft_timeout.current);
      }
    };
  }, []);

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

    const sending_message: DecryptedThreadMessage = {
      id: `sending_${Date.now()}`,
      item_type: "sent",
      sender_name: user?.display_name || user?.email || t("mail.me" as never),
      sender_email: user?.email || "",
      subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
      body: reply_text.trim(),
      timestamp: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      is_deleted: false,
      is_external: false,
      is_sending: true,
      to_recipients: [{ name: sender_name, email: sender_email }],
    };

    on_sending_start?.(sending_message);

    const original: OriginalEmail = {
      sender_email: sender_email,
      sender_name: sender_name,
      subject: subject,
      body: body,
      timestamp: timestamp,
    };

    const badge_html = preferences.show_badges_in_signature
      ? build_badge_html(badges)
      : "";
    const message_with_signature =
      reply_text.trim() +
      get_signature() +
      badge_html +
      get_aster_footer(t, preferences.show_aster_branding);

    const result = await send_reply(
      {
        original,
        message: message_with_signature,
        thread_token,
        original_email_id: email_id,
      },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          set_send_state("sent");
          if (!undo_enabled) {
            show_toast(t("common.email_sent"), "success");
          }
          on_sending_end?.();

          if (thread_token) {
            emit_thread_reply_sent({
              thread_token,
              original_email_id: email_id,
            });
          }

          const new_message: DecryptedThreadMessage = {
            id: `temp_${Date.now()}`,
            item_type: "sent",
            sender_name:
              user?.display_name || user?.email || t("mail.me" as never),
            sender_email: user?.email || "",
            subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
            body: reply_text.trim(),
            timestamp: new Date().toISOString(),
            is_read: true,
            is_starred: false,
            is_deleted: false,
            is_external: false,
            to_recipients: [{ name: sender_name, email: sender_email }],
          };

          on_reply_sent(new_message);

          setTimeout(() => {
            set_reply_text("");
            on_close();
          }, 500);
        },
        on_cancel: () => {
          is_sending_ref.current = false;
          set_send_state("idle");
          set_queued_id(null);
          on_sending_end?.();
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          set_send_state("error");
          set_error_message(error);
          on_sending_end?.();
        },
      },
      preferences.undo_send_period,
    );

    if (result.success && result.queued_id) {
      set_queued_id(result.queued_id);

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        delete_draft(captured_draft_id).catch(() => {});
      }
    } else if (!result.success) {
      is_sending_ref.current = false;
      set_send_state("error");
      set_error_message(result.error || t("common.failed_to_send_reply"));
      on_sending_end?.();
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
    on_sending_start,
    on_sending_end,
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
      if ((e.metaKey || e.ctrlKey) && e["key"] === "Enter") {
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
            className="mt-6 border border-edge-secondary rounded-lg overflow-hidden bg-surf-card"
            exit={{ opacity: 0, height: 0 }}
            initial={reduce_motion ? false : { opacity: 0, height: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge-secondary">
              <div className="flex items-center gap-3">
                <ProfileAvatar
                  use_domain_logo
                  email={sender_email}
                  name={sender_name}
                  size="sm"
                />
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    {t("mail.replying_to", { name: sender_name })}
                  </p>
                  <p className="text-xs text-txt-tertiary">{sender_email}</p>
                </div>
              </div>
              <button
                className="p-1.5 rounded-md transition-colors hover:bg-surf-hover text-txt-muted"
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

              <textarea
                ref={textarea_ref}
                className="aster_input resize-none p-3 disabled:opacity-50"
                disabled={is_disabled}
                placeholder={t("mail.write_reply")}
                rows={4}
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
                <span className="text-xs ml-auto text-txt-tertiary">
                  {reply_text.length}/1000
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1"
                  disabled={!reply_text.trim() || is_disabled}
                  variant={
                    reply_text.trim() && !is_disabled ? "depth" : "secondary"
                  }
                  onClick={handle_send_reply}
                >
                  {send_state === "sending"
                    ? t("common.sending")
                    : t("mail.send")}
                </Button>
                <button
                  className="px-4 py-2.5 border border-edge-secondary rounded-lg font-medium transition-colors text-sm hover_bg text-txt-secondary"
                  onClick={handle_cancel}
                >
                  {t("common.cancel")}
                </button>
              </div>

              <p className="text-xs text-center text-txt-muted">
                {t("common.press_shortcut_to_send")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
