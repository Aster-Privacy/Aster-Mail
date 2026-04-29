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
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { use_popup_drag_resize } from "@/components/email/hooks/popup_viewer_drag";
import { get_mail_item, type MailItem } from "@/services/api/mail";
import {
  get_draft_by_thread,
  type DraftContent,
  type DraftWithContent,
} from "@/services/api/multi_drafts";
import {
  update_item_metadata,
  decrypt_mail_metadata,
} from "@/services/crypto/mail_metadata";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
  type ThreadReplySentEventDetail,
  type ThreadReplyOptimisticEventDetail,
  type ThreadReplyCancelledEventDetail,
} from "@/hooks/mail_events";
import type { UndoSendEvent } from "@/hooks/use_undo_send";
import {
  get_external_content_mode,
  set_external_content_mode,
} from "@/components/email/viewer_shared";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { use_date_format } from "@/hooks/use_date_format";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { extract_email_details } from "@/services/extraction/extractor";
import { get_email_username } from "@/lib/utils";
import {
  process_envelope_body,
  build_preview_text,
  build_single_thread_message,
} from "@/components/email/shared/build_email_from_envelope";
import {
  format_snooze_remaining,
  format_snooze_target,
} from "@/utils/date_format";
import {
  fetch_and_decrypt_thread_messages,
  fetch_and_decrypt_virtual_group,
} from "@/services/thread_service";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { await_preloaded_email } from "@/components/email/hooks/preload_cache";
import {
  type DecryptedEmail,
  type EmailPopupViewerProps,
} from "@/components/email/hooks/popup_viewer_types";
import { use_popup_viewer_actions } from "@/components/email/hooks/popup_viewer_actions";

export type {
  EmailRecipient,
  DecryptedEmail,
  LocalEmailData,
  EmailPopupViewerProps,
  PopupSize,
} from "@/components/email/hooks/popup_viewer_types";

export {
  POPUP_MARGIN,
  FULLSCREEN_MARGIN,
} from "@/components/email/hooks/popup_viewer_types";

export function use_popup_viewer({
  email_id,
  local_email,
  on_close,
  on_reply,
  on_forward,
  snoozed_until,
  grouped_email_ids,
}: Pick<
  EmailPopupViewerProps,
  | "email_id"
  | "local_email"
  | "on_close"
  | "on_reply"
  | "on_forward"
  | "snoozed_until"
  | "grouped_email_ids"
>) {
  const { user } = use_auth();
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { format_email_detail, format_email_popup } = use_date_format();
  const [email, set_email] = useState<DecryptedEmail | null>(null);
  const [mail_item, set_mail_item] = useState<MailItem | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [is_read, set_is_read] = useState(true);
  const [is_pinned, set_is_pinned] = useState(false);
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_spam_loading, set_is_spam_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_pin_loading, set_is_pin_loading] = useState(false);
  const drag = use_popup_drag_resize();
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const [current_thread_token, set_current_thread_token] = useState<
    string | null
  >(null);
  const [thread_draft, set_thread_draft] = useState<DraftWithContent | null>(
    null,
  );
  const [external_content_state, set_external_content_state] = useState<{
    mode: "blocked" | "loaded" | "dismissed";
    report: ExternalContentReport | null;
  }>(() => {
    const cached = email_id ? get_external_content_mode(email_id) : undefined;

    return { mode: cached || "blocked", report: null };
  });
  const timestamp_date = useRef<Date | null>(null);
  const mark_as_read_timeout = useRef<number | null>(null);

  const unsubscribe_info = useMemo(() => {
    if (!email) return null;
    if (email.unsubscribe_info) return email.unsubscribe_info;

    return detect_unsubscribe_info(email.body, email.body);
  }, [email]);

  const extraction_result = useMemo(() => {
    if (!email) return null;

    return extract_email_details(
      email.subject,
      email.body,
      undefined,
      email.sender_email,
      email.sender,
    );
  }, [email]);

  const handle_external_content_detected = useCallback(
    (report: ExternalContentReport) => {
      if (report.blocked_count > 0) {
        set_external_content_state((prev) => {
          if (prev.mode === "loaded") return prev;
          const merged_report: ExternalContentReport = prev.report
            ? {
                has_remote_images:
                  prev.report.has_remote_images || report.has_remote_images,
                has_remote_fonts:
                  prev.report.has_remote_fonts || report.has_remote_fonts,
                has_remote_css:
                  prev.report.has_remote_css || report.has_remote_css,
                has_tracking_pixels:
                  prev.report.has_tracking_pixels || report.has_tracking_pixels,
                blocked_count: prev.report.blocked_count + report.blocked_count,
                blocked_items: [
                  ...(prev.report.blocked_items || []),
                  ...(report.blocked_items || []),
                ],
                cleaned_links: [
                  ...(prev.report.cleaned_links || []),
                  ...(report.cleaned_links || []),
                ],
              }
            : report;

          return { mode: "blocked", report: merged_report };
        });
      }
    },
    [],
  );

  const [loaded_content_types, set_loaded_content_types] = useState<Set<string>>(new Set());

  const handle_load_external_content = useCallback((types?: string[]) => {
    if (!types) {
      set_external_content_state((prev) => ({ mode: "loaded", report: prev.report }));
      if (email_id) set_external_content_mode(email_id);
      set_loaded_content_types(new Set());
      return;
    }
    set_loaded_content_types((prev) => {
      const next = new Set(prev);
      for (const t of types) next.add(t);
      return next;
    });
  }, [email_id]);

  const handle_dismiss_external_content = useCallback(() => {
    set_external_content_state((prev) => ({ ...prev, mode: "dismissed" }));
  }, []);

  const external_content_mode: "always" | undefined =
    external_content_state.mode === "loaded" ? "always" : undefined;

  useEffect(() => {
    const cached = email_id ? get_external_content_mode(email_id) : undefined;

    set_external_content_state({ mode: cached || "blocked", report: null });
  }, [email_id]);

  useEffect(() => {
    const handle_escape = (e: KeyboardEvent) => {
      if (e["key"] === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [on_close]);

  const actions = use_popup_viewer_actions({
    email_id,
    email,
    mail_item,
    is_read,
    is_pinned,
    is_archive_loading,
    is_spam_loading,
    is_trash_loading,
    is_pin_loading,
    thread_messages,
    current_thread_token,
    set_is_read,
    set_is_pinned,
    set_is_archive_loading,
    set_is_spam_loading,
    set_is_trash_loading,
    set_is_pin_loading,
    set_mail_item,
    set_thread_messages,
    on_close,
    on_reply,
    on_forward,
    t,
    preferences_default_reply_behavior: preferences.default_reply_behavior,
  });

  const fetch_email = useCallback(async () => {
    if (!email_id) {
      return;
    }

    set_email(null);
    set_mail_item(null);
    set_error(null);
    set_thread_messages([]);
    set_current_thread_token(null);
    set_thread_draft(null);

    const preloaded = await await_preloaded_email(
      email_id,
      preferences.conversation_grouping !== false,
    );

    if (preloaded) {
      const pe = preloaded.email;

      timestamp_date.current = new Date(preloaded.mail_item.created_at);

      const decrypted: DecryptedEmail = {
        id: pe.id,
        sender: pe.sender,
        sender_email: pe.sender_email,
        subject: pe.subject,
        preview: pe.preview,
        timestamp: format_email_detail(timestamp_date.current),
        is_read: pe.is_read,
        is_starred: pe.is_starred,
        body: pe.html_content || pe.body,
        html_content: pe.html_content,
        unsubscribe_info: pe.unsubscribe_info,
        to: pe.to?.map((r) => ({ name: r.name || "", email: r.email })) || [],
        cc:
          pe.cc?.map((r) => ({ name: r.name || "", email: r.email || "" })) ||
          [],
        bcc:
          pe.bcc?.map((r) => ({ name: r.name || "", email: r.email || "" })) ||
          [],
        expires_at: preloaded.mail_item.expires_at,
      };

      set_email(decrypted);
      set_mail_item(preloaded.mail_item);
      set_is_read(pe.is_read);
      set_is_pinned(preloaded.mail_item.metadata?.is_pinned ?? false);
      set_thread_messages(preloaded.thread_messages);
      set_current_thread_token(preloaded.mail_item.thread_token || null);

      if (preloaded.mail_item.thread_token) {
        const { get_vault_from_memory } = await import(
          "@/services/crypto/memory_key_store"
        );
        const current_vault = get_vault_from_memory();

        if (current_vault) {
          const draft_result = await get_draft_by_thread(
            preloaded.mail_item.thread_token,
            current_vault,
          );

          if (draft_result.data) {
            set_thread_draft(draft_result.data);
          }
        }
      }

      return;
    }

    const response = await get_mail_item(email_id);

    if (response.error) {
      set_error(response.error);

      return;
    }

    if (response.data) {
      let decrypted_metadata = response.data.metadata ?? null;

      if (
        !decrypted_metadata &&
        response.data.encrypted_metadata &&
        response.data.metadata_nonce
      ) {
        decrypted_metadata = await decrypt_mail_metadata(
          response.data.encrypted_metadata,
          response.data.metadata_nonce,
          response.data.metadata_version,
        );
      }

      const item_with_metadata = {
        ...response.data,
        metadata: decrypted_metadata ?? undefined,
      };

      set_mail_item(item_with_metadata);
      set_is_read(decrypted_metadata?.is_read ?? false);
      set_is_pinned(decrypted_metadata?.is_pinned ?? false);

      const envelope = await decrypt_mail_envelope(
        response.data.encrypted_envelope,
        response.data.envelope_nonce,
      );

      if (envelope) {
        timestamp_date.current = new Date(
          envelope.sent_at || response.data.created_at,
        );

        const {
          body_text,
          safe_html,
          unsubscribe_info: unsubscribe,
        } = await process_envelope_body(envelope, user?.email);

        const decrypted: DecryptedEmail = {
          id: response.data.id,
          sender: envelope.from.name || get_email_username(envelope.from.email),
          sender_email: envelope.from.email,
          subject: envelope.subject || t("mail.no_subject"),
          preview: build_preview_text(body_text, safe_html),
          timestamp: format_email_detail(timestamp_date.current),
          is_read: decrypted_metadata?.is_read ?? false,
          is_starred: decrypted_metadata?.is_starred ?? false,
          body: safe_html || body_text,
          html_content: safe_html,
          unsubscribe_info: unsubscribe,
          to: envelope.to || [],
          cc: envelope.cc || [],
          bcc: envelope.bcc || [],
          expires_at: response.data.expires_at,
          raw_headers: envelope.raw_headers,
        };

        set_email(decrypted);

        set_current_thread_token(response.data.thread_token || null);

        const single_message = build_single_thread_message(
          response.data,
          envelope,
          body_text,
          safe_html,
          decrypted_metadata,
        );

        if (
          preferences.conversation_grouping !== false &&
          response.data.thread_token
        ) {
          const thread_result = await fetch_and_decrypt_thread_messages(
            response.data.thread_token,
            user?.email,
          );

          if (thread_result.messages.length > 0) {
            set_thread_messages(thread_result.messages);
          } else {
            set_thread_messages([single_message]);
          }
        } else if (
          preferences.conversation_grouping !== false &&
          grouped_email_ids &&
          grouped_email_ids.length > 1 &&
          email_id &&
          grouped_email_ids.includes(email_id)
        ) {
          const group_messages = await fetch_and_decrypt_virtual_group(
            grouped_email_ids,
            user?.email,
          );

          if (group_messages.length > 0) {
            set_thread_messages(group_messages);
          } else {
            set_thread_messages([single_message]);
          }
        } else {
          set_thread_messages([single_message]);
        }

        if (response.data.thread_token) {
          const { get_vault_from_memory } = await import(
            "@/services/crypto/memory_key_store"
          );
          const current_vault = get_vault_from_memory();

          if (current_vault) {
            const draft_result = await get_draft_by_thread(
              response.data.thread_token,
              current_vault,
            );

            if (draft_result.data) {
              set_thread_draft(draft_result.data);
            }
          }
        }

        const mail_data = response.data;

        if (
          !(decrypted_metadata?.is_read ?? false) &&
          preferences.mark_as_read_delay !== "never"
        ) {
          const current_email_id = email_id;
          const is_received = mail_data.item_type === "received";
          const mark_read = async () => {
            if (current_email_id !== email_id) return;

            if (is_received) {
              adjust_unread_count(-1);
            }
            const result = await update_item_metadata(
              current_email_id,
              {
                encrypted_metadata: mail_data.encrypted_metadata,
                metadata_nonce: mail_data.metadata_nonce,
                metadata_version: mail_data.metadata_version,
              },
              { is_read: true },
            );

            if (result.success && current_email_id === email_id) {
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
                id: current_email_id,
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
              mark_read,
              delay_ms,
            );
          }
        }
      }
    }
  }, [email_id, format_email_detail, preferences.mark_as_read_delay]);

  useEffect(() => {
    if (local_email) {
      const s_email = local_email.sender_email || user?.email || "me";
      const s_name = local_email.sender_name || user?.email || t("common.me");
      const now_str = format_email_detail(new Date());

      const decrypted: DecryptedEmail = {
        id: "undo-send-preview",
        sender: s_name,
        sender_email: s_email,
        subject: local_email.subject || t("mail.no_subject"),
        preview: "",
        timestamp: now_str,
        is_read: true,
        is_starred: false,
        body: local_email.body,
        html_content: local_email.body,
        to: local_email.to.map((e) => ({ name: "", email: e })),
        cc: (local_email.cc || []).map((e) => ({ name: "", email: e })),
        bcc: (local_email.bcc || []).map((e) => ({ name: "", email: e })),
      };

      set_email(decrypted);
      set_error(null);

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
      timestamp_date.current = new Date();

      return;
    }
  }, [local_email, user, format_email_detail]);

  useEffect(() => {
    if (local_email) return;

    if (mark_as_read_timeout.current) {
      clearTimeout(mark_as_read_timeout.current);
      mark_as_read_timeout.current = null;
    }

    if (email_id) {
      fetch_email();
    }

    return () => {
      if (mark_as_read_timeout.current) {
        clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [email_id, fetch_email, local_email]);

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
    const handle_email_sent = () => {
      setTimeout(() => {
        fetch_email();
      }, 500);
    };

    window.addEventListener("astermail:email-sent", handle_email_sent);

    return () => {
      window.removeEventListener("astermail:email-sent", handle_email_sent);
    };
  }, [fetch_email]);

  useEffect(() => {
    const handle_refresh = () => {
      fetch_email();
    };

    window.addEventListener(MAIL_EVENTS.REFRESH_REQUESTED, handle_refresh);

    return () => {
      window.removeEventListener(MAIL_EVENTS.REFRESH_REQUESTED, handle_refresh);
    };
  }, [fetch_email]);

  useEffect(() => {
    const handle_thread_reply = async (event: Event) => {
      const custom_event = event as CustomEvent<ThreadReplySentEventDetail>;
      const detail = custom_event.detail;

      const matches_thread =
        current_thread_token && detail.thread_token === current_thread_token;
      const matches_email =
        detail.original_email_id && detail.original_email_id === email_id;

      if (!matches_thread && !matches_email) {
        return;
      }

      if (preferences.conversation_grouping === false) return;

      await new Promise((resolve) => setTimeout(resolve, 500));

      const thread_result = await fetch_and_decrypt_thread_messages(
        detail.thread_token,
        user?.email,
      );

      if (thread_result.messages.length > 0) {
        set_thread_messages(thread_result.messages);

        if (!current_thread_token) {
          set_current_thread_token(detail.thread_token);
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
  }, [current_thread_token, email_id]);

  useEffect(() => {
    const handle_optimistic = (event: Event) => {
      const detail = (event as CustomEvent<ThreadReplyOptimisticEventDetail>)
        .detail;

      const matches_thread =
        current_thread_token && detail.thread_token === current_thread_token;
      const matches_email =
        detail.original_email_id && detail.original_email_id === email_id;

      if (!matches_thread && !matches_email) return;
      if (preferences.conversation_grouping === false) return;

      const optimistic_message: DecryptedThreadMessage = {
        id: detail.optimistic_id,
        item_type: "sent",
        sender_name: detail.sender_name,
        sender_email: detail.sender_email,
        subject: detail.subject,
        body: detail.body,
        timestamp: new Date().toISOString(),
        is_read: true,
        is_starred: false,
        is_deleted: false,
        is_external: false,
        to_recipients: detail.to_recipients,
      };

      set_thread_messages((prev) => [...prev, optimistic_message]);

      if (!current_thread_token) {
        set_current_thread_token(detail.thread_token);
      }
    };

    const handle_cancelled = (event: Event) => {
      const detail = (event as CustomEvent<ThreadReplyCancelledEventDetail>)
        .detail;

      const matches_thread =
        current_thread_token && detail.thread_token === current_thread_token;

      if (!matches_thread) return;

      set_thread_messages((prev) =>
        prev.filter((msg) => msg.id !== detail.optimistic_id),
      );
    };

    const handle_undo_send = (event: Event) => {
      const { pending } = (event as CustomEvent<UndoSendEvent>).detail;

      if (!pending.optimistic_id || !pending.thread_token) return;

      const matches_thread =
        current_thread_token &&
        pending.thread_token === current_thread_token;

      if (!matches_thread) return;

      set_thread_messages((prev) =>
        prev.filter((msg) => msg.id !== pending.optimistic_id),
      );
    };

    window.addEventListener(
      MAIL_EVENTS.THREAD_REPLY_OPTIMISTIC,
      handle_optimistic,
    );
    window.addEventListener(
      MAIL_EVENTS.THREAD_REPLY_CANCELLED,
      handle_cancelled,
    );
    window.addEventListener(MAIL_EVENTS.UNDO_SEND, handle_undo_send);

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.THREAD_REPLY_OPTIMISTIC,
        handle_optimistic,
      );
      window.removeEventListener(
        MAIL_EVENTS.THREAD_REPLY_CANCELLED,
        handle_cancelled,
      );
      window.removeEventListener(MAIL_EVENTS.UNDO_SEND, handle_undo_send);
    };
  }, [current_thread_token, email_id, preferences.conversation_grouping]);

  useEffect(() => {
    const handle_keyboard_reply = () => actions.handle_reply();
    const handle_keyboard_forward = () => actions.handle_forward();

    const handle_keyboard_archive = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id) {
        e.stopImmediatePropagation();
        actions.handle_archive();
      }
    };

    const handle_keyboard_delete = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id) {
        e.stopImmediatePropagation();
        actions.handle_trash();
      }
    };

    const handle_keyboard_spam = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id) {
        e.stopImmediatePropagation();
        actions.handle_spam();
      }
    };

    const handle_keyboard_mark_read = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id && !is_read) {
        e.stopImmediatePropagation();
        actions.handle_read_toggle();
      }
    };

    const handle_keyboard_mark_unread = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id && is_read) {
        e.stopImmediatePropagation();
        actions.handle_read_toggle();
      }
    };

    window.addEventListener(
      "astermail:keyboard-reply",
      handle_keyboard_reply,
      true,
    );
    window.addEventListener(
      "astermail:keyboard-forward",
      handle_keyboard_forward,
      true,
    );
    window.addEventListener(
      "astermail:keyboard-archive",
      handle_keyboard_archive,
      true,
    );
    window.addEventListener(
      "astermail:keyboard-delete",
      handle_keyboard_delete,
      true,
    );
    window.addEventListener(
      "astermail:keyboard-spam",
      handle_keyboard_spam,
      true,
    );
    window.addEventListener(
      "astermail:keyboard-mark-read",
      handle_keyboard_mark_read,
      true,
    );
    window.addEventListener(
      "astermail:keyboard-mark-unread",
      handle_keyboard_mark_unread,
      true,
    );

    return () => {
      window.removeEventListener(
        "astermail:keyboard-reply",
        handle_keyboard_reply,
        true,
      );
      window.removeEventListener(
        "astermail:keyboard-forward",
        handle_keyboard_forward,
        true,
      );
      window.removeEventListener(
        "astermail:keyboard-archive",
        handle_keyboard_archive,
        true,
      );
      window.removeEventListener(
        "astermail:keyboard-delete",
        handle_keyboard_delete,
        true,
      );
      window.removeEventListener(
        "astermail:keyboard-spam",
        handle_keyboard_spam,
        true,
      );
      window.removeEventListener(
        "astermail:keyboard-mark-read",
        handle_keyboard_mark_read,
        true,
      );
      window.removeEventListener(
        "astermail:keyboard-mark-unread",
        handle_keyboard_mark_unread,
        true,
      );
    };
  }, [
    actions.handle_reply,
    actions.handle_forward,
    actions.handle_archive,
    actions.handle_trash,
    actions.handle_spam,
    actions.handle_read_toggle,
    email_id,
    is_read,
  ]);

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
    t,
    user,
    email,
    mail_item,
    error,
    is_read,
    is_pinned,
    is_archive_loading,
    is_spam_loading,
    is_trash_loading,
    is_pin_loading,
    popup_size: drag.popup_size,
    position: drag.position,
    is_dragging: drag.is_dragging,
    is_fullscreen: drag.is_fullscreen,
    is_exiting_fullscreen: drag.is_exiting_fullscreen,
    dimensions: drag.dimensions,
    popup_ref: drag.popup_ref,
    timestamp_date,
    thread_messages,
    thread_draft,
    handle_draft_saved,
    unsubscribe_info,
    extraction_result,
    external_content_state,
    external_content_mode,
    snoozed_until,
    format_email_popup,
    format_snooze_target: (date: Date) => format_snooze_target(date, t),
    format_snooze_remaining: (date: Date) => format_snooze_remaining(date, t),
    handle_drag_start: drag.handle_drag_start,
    toggle_size: drag.toggle_size,
    handle_fullscreen: drag.handle_fullscreen,
    handle_read_toggle: actions.handle_read_toggle,
    handle_archive: actions.handle_archive,
    handle_spam: actions.handle_spam,
    handle_trash: actions.handle_trash,
    handle_pin_toggle: actions.handle_pin_toggle,
    handle_reply: actions.handle_reply,
    handle_forward: actions.handle_forward,
    handle_print: actions.handle_print,
    handle_unsubscribe: () =>
      actions.handle_unsubscribe(unsubscribe_info),
    handle_external_content_detected,
    handle_load_external_content,
    handle_dismiss_external_content,
    loaded_content_types,
    handle_per_message_reply: actions.handle_per_message_reply,
    handle_per_message_reply_all: actions.handle_per_message_reply_all,
    handle_per_message_forward: actions.handle_per_message_forward,
    handle_per_message_archive: actions.handle_per_message_archive,
    handle_per_message_trash: actions.handle_per_message_trash,
    handle_per_message_print: actions.handle_per_message_print,
    handle_per_message_report_phishing:
      actions.handle_per_message_report_phishing,
    handle_per_message_not_spam: actions.handle_per_message_not_spam,
    handle_toggle_message_read: actions.handle_toggle_message_read,
  };
}
