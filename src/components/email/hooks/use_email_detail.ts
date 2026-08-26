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
import type { PrintThreadData } from "@/utils/print_email";

import { useRef, useEffect, useCallback } from "react";

import { is_system_email } from "@/lib/utils";
import {
  fetch_and_decrypt_thread_messages,
} from "@/services/thread_service";
import {
  type DraftWithContent,
  type DraftContent,
} from "@/services/api/multi_drafts";
import {
  get_preferences,
} from "@/services/api/preferences";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import {
  print_thread,
  setup_thread_print_intercept,
} from "@/utils/print_email";
import { set_forward_mail_id } from "@/services/forward_store";
import { use_date_format } from "@/hooks/use_date_format";

export type {
  DecryptedEmail,
  ReplyModalData,
} from "@/components/email/hooks/email_detail_types";

export {
  consume_preloaded_email,
  get_preloaded_email,
  await_preloaded_email,
  clear_preload_cache,
  preload_email_detail,
  mark_preload_stale,
  delete_preloaded_email,
  is_preload_busy,
} from "@/components/email/hooks/preload_cache";
import { use_email_detail_load } from "./use_email_detail_load";

export function use_email_detail() {
  const { format_email_detail } = use_date_format();
  const {
    t,
    email_id,
    navigate,
    vault,
    user,
    preferences,
    update_preference,
    save_now,
    mail_item,
    email,
    is_loading,
    error,
    is_unsubscribe_modal_open,
    set_is_unsubscribe_modal_open,
    is_sender_dropdown_open,
    set_is_sender_dropdown_open,
    is_block_sender_modal_open,
    set_is_block_sender_modal_open,
    is_archive_confirm_open,
    set_is_archive_confirm_open,
    is_trash_confirm_open,
    set_is_trash_confirm_open,
    is_forward_modal_open,
    set_is_forward_modal_open,
    is_settings_open,
    set_is_settings_open,
    settings_section,
    set_settings_section,
    compose_instances,
    open_compose,
    close_compose,
    toggle_minimize,
    set_auto_advance,
    email_list,
    is_archive_loading,
    is_trash_loading,
    is_mobile_sidebar_open,
    thread_messages,
    set_thread_messages,
    thread_truncated,
    set_thread_truncated,
    thread_draft,
    set_thread_draft,
    current_user_email,
    thread_ghost_email,
    is_reply_modal_open,
    set_is_reply_modal_open,
    reply_modal_data,
    set_reply_modal_data,
    view_source_message,
    set_view_source_message,
    forward_target,
    set_forward_target,
    tracking_report,
    handle_external_content_detected,
    current_email_index,
    can_go_newer,
    can_go_older,
    handle_go_newer,
    handle_go_older,
    get_next_email_destination,
    toggle_mobile_sidebar,
    actions,
    fetch_email,
  } = use_email_detail_load();

  useEffect(() => {
    fetch_email();
  }, [fetch_email]);

  const last_detail_refresh_ref = useRef(0);

  useEffect(() => {
    const handle_refresh = () => {
      last_detail_refresh_ref.current = Date.now();
      fetch_email();
    };

    const maybe_revalidate = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last_detail_refresh_ref.current < 5_000) return;
      last_detail_refresh_ref.current = Date.now();
      fetch_email();
    };

    const handle_reply_sent = () => {
      set_thread_draft(null);
    };

    const handle_reply_optimistic = (event: Event) => {
      const detail = (event as CustomEvent<{ thread_token: string; original_email_id?: string }>)
        .detail;
      const current_token = mail_item?.thread_token;
      const matches_thread = current_token && detail.thread_token === current_token;
      const matches_email =
        detail.original_email_id && detail.original_email_id === email_id;

      if (matches_thread || matches_email) {
        set_thread_draft(null);
      }
    };

    window.addEventListener(MAIL_EVENTS.REFRESH_REQUESTED, handle_refresh);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_refresh);
    window.addEventListener(MAIL_EVENTS.THREAD_REPLY_SENT, handle_reply_sent);
    window.addEventListener(
      MAIL_EVENTS.THREAD_REPLY_OPTIMISTIC,
      handle_reply_optimistic,
    );
    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, maybe_revalidate);
    document.addEventListener("visibilitychange", maybe_revalidate);
    window.addEventListener("focus", maybe_revalidate);

    return () => {
      window.removeEventListener(MAIL_EVENTS.REFRESH_REQUESTED, handle_refresh);
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_refresh);
      window.removeEventListener(
        MAIL_EVENTS.THREAD_REPLY_SENT,
        handle_reply_sent,
      );
      window.removeEventListener(
        MAIL_EVENTS.THREAD_REPLY_OPTIMISTIC,
        handle_reply_optimistic,
      );
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, maybe_revalidate);
      document.removeEventListener("visibilitychange", maybe_revalidate);
      window.removeEventListener("focus", maybe_revalidate);
    };
  }, [fetch_email, mail_item?.thread_token, email_id]);

  useEffect(() => {
    const load_preferences = async () => {
      if (!vault) return;
      const response = await get_preferences(vault);

      if (response.data) {
        set_auto_advance(response.data.auto_advance);
      }
    };

    load_preferences();
  }, [vault]);

  useEffect(() => {
    const handle_keyboard_reply = (e: Event) => {
      const last_msg =
        thread_messages.length > 0
          ? thread_messages[thread_messages.length - 1]
          : null;

      if (last_msg && !is_system_email(last_msg.sender_email)) {
        set_reply_modal_data(
          actions.build_reply_modal_data(
            last_msg,
            (e as CustomEvent<{ reply_all?: boolean }>).detail?.reply_all ===
              true || preferences.default_reply_behavior === "reply_all",
          ),
        );
        set_is_reply_modal_open(true);
      }
    };
    const handle_keyboard_forward = () => {
      const last_msg =
        thread_messages.length > 0
          ? thread_messages[thread_messages.length - 1]
          : null;

      if (last_msg) {
        set_forward_mail_id(last_msg.id);
        set_forward_target(last_msg);
        set_is_forward_modal_open(true);
      }
    };

    window.addEventListener("astermail:keyboard-reply", handle_keyboard_reply);
    window.addEventListener(
      "astermail:keyboard-forward",
      handle_keyboard_forward,
    );

    return () => {
      window.removeEventListener(
        "astermail:keyboard-reply",
        handle_keyboard_reply,
      );
      window.removeEventListener(
        "astermail:keyboard-forward",
        handle_keyboard_forward,
      );
    };
  }, [
    thread_messages,
    mail_item?.thread_token,
    preferences.default_reply_behavior,
    actions.build_reply_modal_data,
  ]);

  const build_thread_print_data = useCallback((): PrintThreadData | null => {
    if (!email || thread_messages.length === 0) return null;

    return {
      subject: email.subject,
      messages: thread_messages.map((msg) => ({
        sender: msg.display_sender_name || msg.sender_name,
        sender_email: msg.display_sender_email || msg.sender_email,
        timestamp: format_email_detail(new Date(msg.timestamp)),
        body: msg.html_content || msg.body,
        to_recipients: msg.to_recipients,
        cc_recipients: msg.cc_recipients,
        bcc_recipients: msg.bcc_recipients,
      })),
    };
  }, [email, thread_messages, format_email_detail]);

  const thread_data_ref = useRef(build_thread_print_data);

  thread_data_ref.current = build_thread_print_data;

  useEffect(() => {
    const teardown = setup_thread_print_intercept(() =>
      thread_data_ref.current(),
    );

    return teardown;
  }, []);

  const handle_print = useCallback(() => {
    const data = build_thread_print_data();

    if (!data) return;
    print_thread(data);
  }, [build_thread_print_data]);

  const handle_draft_saved = useCallback(
    (draft: { id: string; version: number; content: DraftContent }) => {
      if (!mail_item?.id) return;

      const now = new Date().toISOString();
      const expires_at = new Date(
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
        expires_at,
      });
    },
    [mail_item?.id, mail_item?.thread_token],
  );

  const handle_edit_thread_draft = useCallback(
    (draft: DraftWithContent) => {
      open_compose({
        id: draft.id,
        version: draft.version,
        draft_type: draft.draft_type,
        reply_to_id: draft.reply_to_id,
        thread_token: draft.thread_token,
        to_recipients: draft.content.to_recipients,
        cc_recipients: draft.content.cc_recipients,
        bcc_recipients: draft.content.bcc_recipients,
        subject: draft.content.subject,
        message: draft.content.message,
        updated_at: draft.updated_at,
      });
    },
    [open_compose],
  );

  const handle_thread_draft_deleted = useCallback(() => {
    set_thread_draft(null);
  }, []);

  const load_all_thread_messages = useCallback(async () => {
    if (!mail_item?.thread_token || !user?.email) return;

    const thread_result = await fetch_and_decrypt_thread_messages(
      mail_item.thread_token,
      user.email,
      {
        is_trashed: !!mail_item.is_trashed,
        is_spam: !!mail_item.is_spam,
      },
    );

    if (thread_result.messages.length > 0) {
      set_thread_messages(thread_result.messages);
      set_thread_truncated(false);
    }
  }, [mail_item?.thread_token, mail_item?.is_trashed, mail_item?.is_spam, user?.email]);

  return {
    t,
    email_id,
    navigate,
    user,
    preferences,
    update_preference,
    save_now,
    mail_item,
    email,
    is_loading,
    error,
    is_unsubscribe_modal_open,
    set_is_unsubscribe_modal_open,
    is_sender_dropdown_open,
    set_is_sender_dropdown_open,
    is_block_sender_modal_open,
    set_is_block_sender_modal_open,
    is_archive_confirm_open,
    set_is_archive_confirm_open,
    is_trash_confirm_open,
    set_is_trash_confirm_open,
    is_forward_modal_open,
    set_is_forward_modal_open,
    is_settings_open,
    set_is_settings_open,
    settings_section,
    set_settings_section,
    compose_instances,
    open_compose,
    close_compose,
    toggle_minimize,
    email_list,
    is_archive_loading,
    is_trash_loading,
    is_mobile_sidebar_open,
    toggle_mobile_sidebar,
    thread_messages,
    thread_truncated,
    load_all_thread_messages,
    thread_draft,
    current_user_email,
    is_reply_modal_open,
    set_is_reply_modal_open,
    reply_modal_data,
    set_reply_modal_data,
    view_source_message,
    set_view_source_message,
    forward_target,
    set_forward_target,
    current_email_index,
    can_go_newer,
    can_go_older,
    handle_go_newer,
    handle_go_older,
    get_next_email_destination,
    handle_archive: actions.handle_archive,
    handle_trash: actions.handle_trash,
    handle_print,
    handle_copy_text: actions.handle_copy_text,
    handle_draft_saved,
    handle_edit_thread_draft,
    handle_thread_draft_deleted,
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
    tracking_report,
    handle_external_content_detected,
    thread_ghost_email,
  };
}
