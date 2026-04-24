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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type {
  DecryptedEmail,
  UseEmailViewerOptions,
} from "@/components/email/email_viewer_types";

import { useState, useEffect, useRef, useCallback } from "react";

import { get_mail_item, type MailItem } from "@/services/api/mail";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import {
  emit_mail_item_updated,
  MAIL_EVENTS,
  type MailItemUpdatedEventDetail,
  type ThreadReplySentEventDetail,
} from "@/hooks/mail_events";
import { get_email_username } from "@/lib/utils";
import {
  process_envelope_body,
  build_preview_text,
  build_single_thread_message,
} from "@/components/email/shared/build_email_from_envelope";
import { is_ghost_email } from "@/stores/ghost_alias_store";
import { use_i18n } from "@/lib/i18n/context";
import { use_date_format } from "@/hooks/use_date_format";
import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import { type ThreadMessagesListRef } from "@/components/email/thread_message_block";
import {
  fetch_and_decrypt_thread_messages,
  fetch_and_decrypt_virtual_group,
} from "@/services/thread_service";
import {
  get_draft_by_thread,
  type DraftContent,
  type DraftWithContent,
} from "@/services/api/multi_drafts";
import {
  await_preloaded_email,
  type PreloadedSanitizedContent,
} from "@/components/email/hooks/preload_cache";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { use_email_viewer_actions } from "@/components/email/email_viewer_actions";

export type {
  EmailRecipient,
  DecryptedEmail,
  ReplyData,
  ForwardData,
} from "@/components/email/email_viewer_types";

interface LocalDecryptedEnvelope {
  subject: string;
  body_text: string;
  body_html?: string;
  text_body?: string;
  html_body?: string | null;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
  list_unsubscribe?: string;
  list_unsubscribe_post?: string;
}

export function format_snooze_time(
  snooze_date: Date,
  t?: (key: string, params?: Record<string, string | number>) => string,
): string {
  const now = new Date();
  const diff_ms = snooze_date.getTime() - now.getTime();

  if (diff_ms <= 0) {
    return t ? t("common.snooze_expired") : "Snooze expired";
  }

  const diff_minutes = Math.floor(diff_ms / (1000 * 60));
  const diff_hours = Math.floor(diff_ms / (1000 * 60 * 60));
  const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24));

  if (diff_minutes < 60) {
    return t
      ? t("common.minutes_remaining", { count: diff_minutes })
      : `${diff_minutes} minute${diff_minutes !== 1 ? "s" : ""} remaining`;
  } else if (diff_hours < 24) {
    return t
      ? t("common.hours_remaining", { count: diff_hours })
      : `${diff_hours} hour${diff_hours !== 1 ? "s" : ""} remaining`;
  } else if (diff_days < 7) {
    return t
      ? t("common.days_remaining", { count: diff_days })
      : `${diff_days} day${diff_days !== 1 ? "s" : ""} remaining`;
  } else {
    const weeks = Math.floor(diff_days / 7);

    return t
      ? t("common.weeks_remaining", { count: weeks })
      : `${weeks} week${weeks !== 1 ? "s" : ""} remaining`;
  }
}

export function format_snooze_target(
  snooze_date: Date,
  t?: (key: string, params?: Record<string, string | number>) => string,
): string {
  const now = new Date();
  const tomorrow = new Date(now);

  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const snooze_day = new Date(snooze_date);

  snooze_day.setHours(0, 0, 0, 0);

  const today = new Date(now);

  today.setHours(0, 0, 0, 0);

  const time_str = snooze_date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (snooze_day.getTime() === today.getTime()) {
    return t
      ? t("common.today_at_time", { time: time_str })
      : `Today at ${time_str}`;
  } else if (snooze_day.getTime() === tomorrow.getTime()) {
    return t
      ? t("common.tomorrow_at_time", { time: time_str })
      : `Tomorrow at ${time_str}`;
  } else {
    const date_str = snooze_date.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    return t
      ? t("common.date_at_time", { date: date_str, time: time_str })
      : `${date_str} at ${time_str}`;
  }
}

export function use_email_viewer({
  email_id,
  local_email,
  on_dismiss,
  on_reply,
  on_forward,
  on_edit_draft,
  use_refresh_listener = false,
  grouped_email_ids,
}: UseEmailViewerOptions) {
  const { t } = use_i18n();
  const { format_email_detail } = use_date_format();
  const { preferences } = use_preferences();
  const { user } = use_auth();
  const [email, set_email] = useState<DecryptedEmail | null>(null);
  const [mail_item, set_mail_item] = useState<MailItem | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [is_read, set_is_read] = useState(false);
  const [is_pinned, set_is_pinned] = useState(false);
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_spam_loading, set_is_spam_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_pin_loading, set_is_pin_loading] = useState(false);
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const [current_user_email, set_current_user_email] = useState<string>("");
  const [current_user_name, set_current_user_name] = useState<string>("");
  const [is_external, set_is_external] = useState(false);
  const [has_recipient_key, set_has_recipient_key] = useState(false);
  const [has_pq_protection, set_has_pq_protection] = useState(false);
  const [thread_draft, set_thread_draft] = useState<DraftWithContent | null>(
    null,
  );
  const [sending_message, set_sending_message] =
    useState<DecryptedThreadMessage | null>(null);
  const [view_source_message, set_view_source_message] =
    useState<DecryptedThreadMessage | null>(null);
  const [thread_expand_state, set_thread_expand_state] = useState({
    all_expanded: false,
    all_collapsed: true,
    has_unread: false,
  });
  const [thread_ghost_email, set_thread_ghost_email] = useState<
    string | undefined
  >();
  const [refresh_key, set_refresh_key] = useState(0);
  const mark_as_read_timeout = useRef<number | null>(null);
  const loaded_email_id_ref = useRef<string | null>(null);
  const grouped_email_ids_ref = useRef(grouped_email_ids);
  const was_preloaded_ref = useRef(false);
  const thread_sanitized_ref = useRef<Map<string, PreloadedSanitizedContent>>(
    new Map(),
  );

  grouped_email_ids_ref.current = grouped_email_ids;
  const thread_list_ref = useRef<ThreadMessagesListRef>(null);

  useEffect(() => {
    if (thread_messages.length === 0 || !current_user_email) {
      set_thread_ghost_email(undefined);

      return;
    }

    const primary = current_user_email.toLowerCase();
    const ghost_pattern = /^[a-z]+\.[a-z]+\d{2}@/;

    for (const m of thread_messages) {
      if (m.item_type !== "sent") continue;

      const sender = m.sender_email.toLowerCase();

      if (sender === primary) continue;

      if (is_ghost_email(sender)) {
        set_thread_ghost_email(sender);

        return;
      }

      if (ghost_pattern.test(sender)) {
        set_thread_ghost_email(sender);

        return;
      }
    }

    set_thread_ghost_email(undefined);
  }, [thread_messages, current_user_email]);

  const actions = use_email_viewer_actions({
    email_id,
    email,
    mail_item,
    is_read,
    is_pinned,
    is_archive_loading,
    is_spam_loading,
    is_trash_loading,
    is_pin_loading,
    is_external,
    thread_messages,
    current_user_email,
    thread_ghost_email,
    set_is_read,
    set_is_pinned,
    set_is_archive_loading,
    set_is_spam_loading,
    set_is_trash_loading,
    set_is_pin_loading,
    set_mail_item,
    set_thread_messages,
    set_thread_draft,
    set_view_source_message,
    on_dismiss,
    on_reply,
    on_forward,
    on_edit_draft,
    t,
    format_email_detail,
    preferences_default_reply_behavior: preferences.default_reply_behavior,
  });

  useEffect(() => {
    if (!local_email) return;

    const s_email = local_email.sender_email || user?.email || "me";
    const s_name = local_email.sender_name || user?.email || "Me";
    const now_str = format_email_detail(new Date());

    set_email({
      id: "undo-send-preview",
      sender: s_name,
      sender_email: s_email,
      subject: local_email.subject || t("mail.no_subject"),
      preview: "",
      timestamp: now_str,
      is_read: true,
      is_starred: false,
      is_trashed: false,
      is_archived: false,
      body: local_email.body,
      html_content: local_email.body,
      to: local_email.to.map((e) => ({ name: "", email: e })),
      cc: (local_email.cc || []).map((e) => ({ name: "", email: e })),
      bcc: (local_email.bcc || []).map((e) => ({ name: "", email: e })),
    });

    const msg: DecryptedThreadMessage = {
      id: "undo-send-preview",
      item_type: "sent",
      sender_name: s_name,
      sender_email: s_email,
      subject: local_email.subject || t("mail.no_subject"),
      body: local_email.body,
      html_content: local_email.body,
      timestamp: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      is_deleted: false,
      is_external: false,
      is_sending: true,
      to_recipients: local_email.to.map((e) => ({ name: "", email: e })),
    };

    set_thread_messages([msg]);
    set_current_user_email(s_email);
    set_current_user_name(s_name);
    set_is_loading(false);
    set_error(null);
  }, [local_email, user, format_email_detail, t]);

  useEffect(() => {
    if (local_email) return;
    let cancelled = false;

    async function load_email() {
      set_is_loading(true);
      set_error(null);
      set_thread_messages([]);
      set_thread_draft(null);
      set_sending_message(null);
      was_preloaded_ref.current = false;
      thread_sanitized_ref.current = new Map();

      const preloaded = await await_preloaded_email(
        email_id,
        preferences.conversation_grouping !== false,
      );

      if (preloaded && !cancelled) {
        const pe = preloaded.email;

        set_email({
          id: pe.id,
          sender: pe.sender,
          sender_email: pe.sender_email,
          subject: pe.subject,
          preview: pe.preview,
          timestamp: preloaded.mail_item.created_at,
          is_read: pe.is_read,
          is_starred: pe.is_starred,
          is_trashed: false,
          is_archived: false,
          body: pe.html_content || pe.body,
          html_content: pe.html_content,
          unsubscribe_info: pe.unsubscribe_info,
          thread_token: preloaded.mail_item.thread_token,
          to: pe.to?.map((r) => ({ name: r.name || "", email: r.email })) || [],
          cc:
            pe.cc?.map((r) => ({ name: r.name || "", email: r.email || "" })) ||
            [],
          bcc:
            pe.bcc?.map((r) => ({
              name: r.name || "",
              email: r.email || "",
            })) || [],
          expires_at: preloaded.mail_item.expires_at,
        });
        set_is_external(preloaded.mail_item.is_external);
        set_has_recipient_key(!!preloaded.mail_item.has_recipient_key);
        set_has_pq_protection(!!preloaded.mail_item.ephemeral_pq_key);
        set_mail_item(preloaded.mail_item);
        set_is_read(pe.is_read);
        set_is_pinned(preloaded.mail_item.metadata?.is_pinned ?? false);
        set_thread_messages(preloaded.thread_messages);
        set_thread_draft(preloaded.thread_draft);
        set_current_user_email(preloaded.current_user_email);
        thread_sanitized_ref.current = preloaded.thread_sanitized;

        if (preloaded.current_user_name) {
          set_current_user_name(preloaded.current_user_name);
        } else {
          try {
            const { get_current_account } = await import(
              "@/services/account_manager"
            );
            const account = await get_current_account();

            if (account) {
              set_current_user_name(
                account.user.display_name || account.user.email,
              );
              set_current_user_email(account.user.email);
            }
          } catch (e) {
            if (import.meta.env.DEV) console.error(e);
          }
        }

        was_preloaded_ref.current = true;
        set_is_loading(false);
        loaded_email_id_ref.current = email_id;

        if (!pe.is_read && preferences.mark_as_read_delay !== "never") {
          const is_received = preloaded.mail_item.item_type === "received";
          const mark_read = async () => {
            if (cancelled) return;
            const item = preloaded.mail_item;

            if (is_received) {
              adjust_unread_count(-1);
            }
            const result = await update_item_metadata(
              item.id,
              {
                encrypted_metadata: item.encrypted_metadata,
                metadata_nonce: item.metadata_nonce,
                metadata_version: item.metadata_version,
              },
              { is_read: true },
            );

            if (result.success && !cancelled) {
              set_is_read(true);
              if (result.encrypted) {
                set_mail_item((prev) =>
                  prev
                    ? {
                        ...prev,
                        encrypted_metadata:
                          result.encrypted!.encrypted_metadata,
                        metadata_nonce: result.encrypted!.metadata_nonce,
                        metadata: prev.metadata
                          ? { ...prev.metadata, is_read: true }
                          : undefined,
                      }
                    : prev,
                );
              }
              emit_mail_item_updated({
                id: item.id,
                is_read: true,
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
              });
            } else if (!result.success && is_received) {
              adjust_unread_count(1);
            }
          };

          if (preferences.mark_as_read_delay === "immediate") {
            void mark_read();
          } else {
            const delay_ms =
              preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

            mark_as_read_timeout.current = window.setTimeout(
              () => mark_read(),
              delay_ms,
            );
          }
        }

        return;
      }

      const result = await get_mail_item(email_id);

      if (cancelled) return;

      if (result.error || !result.data) {
        set_error(t("common.failed_to_load_email"));
        set_is_loading(false);

        return;
      }

      const item = result.data;

      if (!item.encrypted_envelope || item.envelope_nonce == null) {
        set_error(t("common.email_data_missing"));
        set_is_loading(false);

        return;
      }

      const envelope = await decrypt_mail_envelope<LocalDecryptedEnvelope>(
        item.encrypted_envelope,
        item.envelope_nonce,
      );

      if (cancelled) return;

      if (!envelope) {
        set_error(t("common.failed_to_decrypt_email"));
        set_is_loading(false);

        return;
      }

      let user_email: string | undefined;

      let user_name: string | undefined;

      try {
        const { get_current_account } = await import(
          "@/services/account_manager"
        );
        const account = await get_current_account();

        if (account) {
          user_email = account.user.email;
          user_name = account.user.display_name || account.user.email;
          set_current_user_email(account.user.email);
          set_current_user_name(user_name);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      }

      const {
        body_text,
        safe_html,
        unsubscribe_info: unsubscribe,
      } = await process_envelope_body(envelope, user_email);

      let decrypted_metadata = item.metadata;

      if (
        !decrypted_metadata &&
        item.encrypted_metadata &&
        item.metadata_nonce
      ) {
        const { decrypt_mail_metadata } = await import(
          "@/services/crypto/mail_metadata"
        );

        decrypted_metadata =
          (await decrypt_mail_metadata(
            item.encrypted_metadata,
            item.metadata_nonce,
            item.metadata_version,
          )) ?? undefined;
      }

      const item_with_metadata = {
        ...item,
        metadata: decrypted_metadata,
      };

      set_email({
        id: item.id,
        sender:
          envelope.from.name ||
          get_email_username(envelope.from.email) ||
          "Unknown",
        sender_email: envelope.from.email || "",
        subject: envelope.subject || t("mail.no_subject"),
        preview: build_preview_text(body_text, safe_html),
        timestamp: item.created_at,
        is_read: decrypted_metadata?.is_read ?? false,
        is_starred: decrypted_metadata?.is_starred ?? false,
        is_trashed: decrypted_metadata?.is_trashed ?? false,
        is_archived: decrypted_metadata?.is_archived ?? false,
        body: safe_html || body_text,
        html_content: safe_html,
        unsubscribe_info: unsubscribe,
        thread_token: item.thread_token,
        to: envelope.to || [],
        cc: envelope.cc || [],
        bcc: envelope.bcc || [],
        expires_at: item.expires_at,
      });
      set_is_external(item.is_external);
      set_has_recipient_key(!!item.has_recipient_key);
      set_has_pq_protection(!!item.ephemeral_pq_key);
      set_mail_item(item_with_metadata);
      set_is_read(decrypted_metadata?.is_read ?? false);
      set_is_pinned(decrypted_metadata?.is_pinned ?? false);

      const single_message = build_single_thread_message(
        item,
        envelope,
        body_text,
        safe_html,
        decrypted_metadata ?? null,
      );

      const should_load_thread =
        preferences.conversation_grouping !== false && !!item.thread_token;

      if (should_load_thread) {
        const thread_result = await fetch_and_decrypt_thread_messages(
          item.thread_token!,
          user_email,
        );

        if (!cancelled && thread_result.messages.length > 0) {
          set_thread_messages(thread_result.messages);
        } else if (!cancelled) {
          set_thread_messages([single_message]);
        }
      } else if (
        !cancelled &&
        preferences.conversation_grouping !== false &&
        grouped_email_ids_ref.current &&
        grouped_email_ids_ref.current.length > 1 &&
        grouped_email_ids_ref.current.includes(email_id)
      ) {
        const group_messages = await fetch_and_decrypt_virtual_group(
          grouped_email_ids_ref.current,
          user_email,
        );

        if (!cancelled && group_messages.length > 0) {
          set_thread_messages(group_messages);
        } else if (!cancelled) {
          set_thread_messages([single_message]);
        }
      } else if (!cancelled) {
        set_thread_messages([single_message]);
      }

      set_is_loading(false);
      loaded_email_id_ref.current = email_id;

      if (item.thread_token && !cancelled) {
        const { get_vault_from_memory } = await import(
          "@/services/crypto/memory_key_store"
        );
        const current_vault = get_vault_from_memory();

        if (current_vault) {
          const draft_result = await get_draft_by_thread(
            item.thread_token,
            current_vault,
          );

          if (!cancelled && draft_result.data) {
            set_thread_draft(draft_result.data);
          }
        }
      }

      if (
        !(decrypted_metadata?.is_read ?? false) &&
        preferences.mark_as_read_delay !== "never"
      ) {
        const is_received_item = item.item_type === "received";
        const mark_read = async () => {
          if (cancelled) return;

          if (is_received_item) {
            adjust_unread_count(-1);
          }
          const result = await update_item_metadata(
            item.id,
            {
              encrypted_metadata: item.encrypted_metadata,
              metadata_nonce: item.metadata_nonce,
              metadata_version: item.metadata_version,
            },
            { is_read: true },
          );

          if (result.success && !cancelled) {
            set_is_read(true);
            if (result.encrypted) {
              set_mail_item((prev) =>
                prev
                  ? {
                      ...prev,
                      encrypted_metadata: result.encrypted!.encrypted_metadata,
                      metadata_nonce: result.encrypted!.metadata_nonce,
                      metadata: prev.metadata
                        ? { ...prev.metadata, is_read: true }
                        : undefined,
                    }
                  : prev,
              );
            }
            emit_mail_item_updated({
              id: item.id,
              is_read: true,
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            });
          } else if (!result.success && is_received_item) {
            adjust_unread_count(1);
          }
        };

        if (preferences.mark_as_read_delay === "immediate") {
          void mark_read();
        } else {
          const delay_ms =
            preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

          mark_as_read_timeout.current = window.setTimeout(
            () => mark_read(),
            delay_ms,
          );
        }
      }
    }

    if (mark_as_read_timeout.current) {
      clearTimeout(mark_as_read_timeout.current);
      mark_as_read_timeout.current = null;
    }

    if (loaded_email_id_ref.current !== email_id || refresh_key > 0) {
      loaded_email_id_ref.current = null;
      load_email();
    }

    return () => {
      cancelled = true;
      if (mark_as_read_timeout.current) {
        clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [email_id, preferences.mark_as_read_delay, refresh_key]);

  useEffect(() => {
    if (!use_refresh_listener) return;

    const handle_refresh = () => {
      set_refresh_key((k) => k + 1);
    };

    window.addEventListener(MAIL_EVENTS.REFRESH_REQUESTED, handle_refresh);

    return () => {
      window.removeEventListener(MAIL_EVENTS.REFRESH_REQUESTED, handle_refresh);
    };
  }, [use_refresh_listener]);

  useEffect(() => {
    if (!email_id) return;

    const handle_mail_item_updated = (event: Event) => {
      const detail = (event as CustomEvent<MailItemUpdatedEventDetail>).detail;

      if (detail.id !== email_id) return;

      if (detail.is_read !== undefined) {
        set_is_read(detail.is_read);
      }
      if (detail.is_pinned !== undefined) {
        set_is_pinned(detail.is_pinned);
      }
    };

    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEM_UPDATED,
      handle_mail_item_updated,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_mail_item_updated,
      );
    };
  }, [email_id]);

  useEffect(() => {
    const handle_thread_reply = async (event: Event) => {
      const custom_event = event as CustomEvent<ThreadReplySentEventDetail>;
      const detail = custom_event.detail;

      const matches_thread =
        email?.thread_token && detail.thread_token === email.thread_token;
      const matches_email =
        detail.original_email_id && detail.original_email_id === email_id;

      if (!matches_thread && !matches_email) {
        return;
      }

      if (preferences.conversation_grouping === false) return;

      await new Promise((resolve) => setTimeout(resolve, 500));

      const thread_result = await fetch_and_decrypt_thread_messages(
        detail.thread_token,
        current_user_email || undefined,
      );

      if (thread_result.messages.length > 0) {
        set_thread_messages(thread_result.messages);

        if (!email?.thread_token && email) {
          set_email({ ...email, thread_token: detail.thread_token });
        }
      }
    };

    window.addEventListener(MAIL_EVENTS.THREAD_REPLY_SENT, handle_thread_reply);

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.THREAD_REPLY_SENT,
        handle_thread_reply,
      );
    };
  }, [email?.thread_token, email_id, email]);

  useEffect(() => {
    const update_state = () => {
      if (thread_list_ref.current) {
        set_thread_expand_state({
          all_expanded: thread_list_ref.current.all_expanded,
          all_collapsed: thread_list_ref.current.all_collapsed,
          has_unread: thread_list_ref.current.has_unread,
        });
      }
    };

    update_state();
    const interval = setInterval(update_state, 100);

    return () => clearInterval(interval);
  }, [thread_messages]);

  const handle_draft_saved = useCallback(
    (draft: { id: string; version: number; content: DraftContent }) => {
      if (!mail_item?.id) return;
      const now = new Date().toISOString();
      const expires = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      set_thread_draft({
        id: draft.id,
        version: draft.version,
        draft_type: "reply",
        reply_to_id: mail_item.id,
        thread_token: mail_item.thread_token,
        content: draft.content,
        created_at: now,
        updated_at: now,
        expires_at: expires,
      });
    },
    [mail_item?.id, mail_item?.thread_token],
  );

  return {
    email,
    mail_item,
    is_loading,
    error,
    is_read,
    is_pinned,
    is_archive_loading,
    is_spam_loading,
    is_trash_loading,
    is_pin_loading,
    thread_messages,
    set_thread_messages,
    was_preloaded: was_preloaded_ref.current,
    thread_sanitized: thread_sanitized_ref.current,
    current_user_email,
    current_user_name,
    is_external,
    has_recipient_key,
    has_pq_protection,
    thread_draft,
    sending_message,
    view_source_message,
    set_view_source_message,
    thread_expand_state,
    thread_list_ref,
    format_email_detail,
    copy_to_clipboard: actions.copy_to_clipboard,
    handle_reply: actions.handle_reply,
    handle_forward: actions.handle_forward,
    handle_draft_saved,
    handle_edit_thread_draft: actions.handle_edit_thread_draft,
    handle_thread_draft_deleted: actions.handle_thread_draft_deleted,
    handle_read_toggle: actions.handle_read_toggle,
    handle_pin_toggle: actions.handle_pin_toggle,
    handle_archive: actions.handle_archive,
    handle_spam: actions.handle_spam,
    handle_not_spam: actions.handle_not_spam,
    handle_trash: actions.handle_trash,
    handle_print: actions.handle_print,
    handle_unsubscribe: actions.handle_unsubscribe,
    handle_per_message_reply: actions.handle_per_message_reply,
    handle_per_message_reply_all: actions.handle_per_message_reply_all,
    handle_per_message_forward: actions.handle_per_message_forward,
    handle_per_message_archive: actions.handle_per_message_archive,
    handle_per_message_trash: actions.handle_per_message_trash,
    handle_per_message_print: actions.handle_per_message_print,
    handle_per_message_view_source: actions.handle_per_message_view_source,
    handle_per_message_report_phishing:
      actions.handle_per_message_report_phishing,
    handle_per_message_not_spam: actions.handle_per_message_not_spam,
    handle_toggle_message_read: actions.handle_toggle_message_read,
  };
}
