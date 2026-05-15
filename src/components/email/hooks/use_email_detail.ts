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
import type { PrintThreadData } from "@/utils/print_email";
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import { get_email_username, is_system_email } from "@/lib/utils";
import { is_ghost_email } from "@/stores/ghost_alias_store";
import { get_recipient_hint } from "@/stores/recipient_hint_store";
import { get_mail_item } from "@/services/api/mail";
import {
  fetch_and_decrypt_thread_messages,
  fetch_and_decrypt_virtual_group,
} from "@/services/thread_service";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import {
  get_draft,
  get_draft_by_thread,
  type DraftWithContent,
  type DraftContent,
} from "@/services/api/multi_drafts";
import {
  process_envelope_body,
  build_preview_text,
  build_single_thread_message,
} from "@/components/email/shared/build_email_from_envelope";
import { use_auth } from "@/contexts/auth_context";
import {
  get_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { use_folders } from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { use_document_title } from "@/hooks/use_document_title";
import { use_date_format } from "@/hooks/use_date_format";
import { use_preferences } from "@/contexts/preferences_context";
import { MAIL_EVENTS, emit_mail_item_updated } from "@/hooks/mail_events";
import {
  print_thread,
  setup_thread_print_intercept,
} from "@/utils/print_email";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";
import { use_i18n } from "@/lib/i18n/context";
import { use_compose_manager } from "@/components/compose/compose_manager";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  get_preload_cache,
  get_preload_in_flight,
  preload_email_detail,
} from "@/components/email/hooks/preload_cache";
import { use_email_detail_actions } from "@/components/email/hooks/email_detail_actions";
import { set_forward_mail_id } from "@/services/forward_store";

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
} from "@/components/email/hooks/preload_cache";

export function use_email_detail() {
  const { t } = use_i18n();
  const { email_id } = useParams();
  const navigate = useNavigate();
  const { vault, user } = use_auth();
  const { state: folders_state } = use_folders();
  const { format_email_popup } = use_date_format();
  const { preferences, update_preference, save_now } = use_preferences();
  const mark_as_read_timeout = useRef<number | null>(null);
  const has_loaded_once = useRef(false);
  const [mail_item, set_mail_item] = useState<
    import("@/services/api/mail").MailItem | null
  >(null);
  const [email, set_email] = useState<
    import("@/components/email/hooks/email_detail_types").DecryptedEmail | null
  >(null);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [is_unsubscribe_modal_open, set_is_unsubscribe_modal_open] =
    useState(false);
  const [is_sender_dropdown_open, set_is_sender_dropdown_open] =
    useState(false);
  const [is_block_sender_modal_open, set_is_block_sender_modal_open] =
    useState(false);
  const [is_archive_confirm_open, set_is_archive_confirm_open] =
    useState(false);
  const [is_trash_confirm_open, set_is_trash_confirm_open] = useState(false);
  const [is_forward_modal_open, set_is_forward_modal_open] = useState(false);
  const [is_settings_open, set_is_settings_open] = useState(false);
  const [settings_section, set_settings_section] = useState<string | undefined>(
    undefined,
  );
  const {
    instances: compose_instances,
    open_compose,
    close_compose,
    toggle_minimize,
  } = use_compose_manager();
  const [auto_advance, set_auto_advance] = useState(
    DEFAULT_PREFERENCES.auto_advance,
  );
  const [email_list] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem("astermail_email_nav");

      if (stored) {
        const parsed = JSON.parse(stored);

        return parsed.email_ids || [];
      }
    } catch {}

    return [];
  });
  const [stored_grouped_email_ids] = useState<string[] | undefined>(() => {
    try {
      const stored = sessionStorage.getItem("astermail_email_nav");

      if (stored) {
        const parsed = JSON.parse(stored);

        return parsed.grouped_email_ids;
      }
    } catch {}

    return undefined;
  });
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_mobile_sidebar_open, set_is_mobile_sidebar_open] = useState(false);
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const [thread_draft, set_thread_draft] = useState<DraftWithContent | null>(
    null,
  );
  const [current_user_email, set_current_user_email] = useState("");
  const [thread_ghost_email, set_thread_ghost_email] = useState<
    string | undefined
  >();
  const [is_reply_modal_open, set_is_reply_modal_open] = useState(false);
  const [reply_modal_data, set_reply_modal_data] = useState<
    import("@/components/email/hooks/email_detail_types").ReplyModalData | null
  >(null);
  const [view_source_message, set_view_source_message] =
    useState<DecryptedThreadMessage | null>(null);
  const [forward_target, set_forward_target] =
    useState<DecryptedThreadMessage | null>(null);
  const [tracking_report, set_tracking_report] =
    useState<ExternalContentReport | null>(null);

  const handle_external_content_detected = useCallback(
    (report: ExternalContentReport) => {
      set_tracking_report((prev) => {
        if (!prev) return report;

        return {
          has_remote_images: prev.has_remote_images || report.has_remote_images,
          has_remote_fonts: prev.has_remote_fonts || report.has_remote_fonts,
          has_remote_css: prev.has_remote_css || report.has_remote_css,
          has_tracking_pixels:
            prev.has_tracking_pixels || report.has_tracking_pixels,
          blocked_count: prev.blocked_count + report.blocked_count,
          blocked_items: [...prev.blocked_items, ...report.blocked_items],
          cleaned_links: [...prev.cleaned_links, ...report.cleaned_links],
        };
      });
    },
    [],
  );

  use_document_title({ email_subject: email?.subject });

  const current_email_index = useMemo(() => {
    if (!email_id || email_list.length === 0) return -1;

    return email_list.indexOf(email_id);
  }, [email_id, email_list]);

  const can_go_newer = current_email_index > 0;
  const can_go_older =
    current_email_index !== -1 && current_email_index < email_list.length - 1;

  const handle_go_newer = useCallback(() => {
    if (can_go_newer) {
      navigate(`/email/${email_list[current_email_index - 1]}`, {
        replace: true,
      });
    }
  }, [can_go_newer, current_email_index, email_list, navigate]);

  const handle_go_older = useCallback(() => {
    if (can_go_older) {
      navigate(`/email/${email_list[current_email_index + 1]}`, {
        replace: true,
      });
    }
  }, [can_go_older, current_email_index, email_list, navigate]);

  const get_next_email_destination = useCallback(() => {
    if (!email_id || current_email_index === -1) return "/";

    if (auto_advance === "Go to next message") {
      if (can_go_older) {
        return `/email/${email_list[current_email_index + 1]}`;
      }

      return "/";
    } else if (auto_advance === "Go to previous message") {
      if (can_go_newer) {
        return `/email/${email_list[current_email_index - 1]}`;
      }

      return "/";
    }

    return "/";
  }, [
    email_id,
    current_email_index,
    email_list,
    auto_advance,
    can_go_newer,
    can_go_older,
  ]);

  useEffect(() => {
    if (thread_messages.length === 0 || !current_user_email) {
      set_thread_ghost_email(undefined);

      return;
    }

    const ghost_pattern = /^[a-z]+\.[a-z]+\d{2}@/;
    let latest_sent: DecryptedThreadMessage | null = null;

    for (const m of thread_messages) {
      if (m.item_type !== "sent") continue;
      if (
        !latest_sent ||
        new Date(m.timestamp).getTime() >
          new Date(latest_sent.timestamp).getTime()
      ) {
        latest_sent = m;
      }
    }

    if (!latest_sent) {
      set_thread_ghost_email(undefined);

      return;
    }

    const sender = latest_sent.sender_email.toLowerCase();

    if (is_ghost_email(sender) || ghost_pattern.test(sender)) {
      set_thread_ghost_email(sender);
    } else {
      set_thread_ghost_email(undefined);
    }
  }, [thread_messages, current_user_email]);

  const toggle_mobile_sidebar = useCallback(() => {
    set_is_mobile_sidebar_open((prev) => !prev);
  }, []);

  const actions = use_email_detail_actions({
    email_id,
    mail_item,
    email,
    thread_messages,
    thread_ghost_email,
    is_archive_loading,
    is_trash_loading,
    set_is_archive_loading,
    set_is_archive_confirm_open,
    set_is_trash_loading,
    set_is_trash_confirm_open,
    set_thread_messages,
    set_reply_modal_data,
    set_is_reply_modal_open,
    set_is_forward_modal_open,
    set_forward_target,
    set_view_source_message,
    get_next_email_destination,
    navigate,
    t,
    preferences_default_reply_behavior: preferences.default_reply_behavior,
  });

  const fetch_email = useCallback(async () => {
    if (!email_id) {
      set_is_loading(false);

      return;
    }

    const preload_in_flight = get_preload_in_flight();
    const preload_cache = get_preload_cache();
    const in_flight = preload_in_flight.get(email_id);

    if (in_flight) {
      await in_flight;
    }

    const cached = preload_cache.get(email_id);
    const current_grouping = preferences.conversation_grouping !== false;

    if (cached && cached.conversation_grouping === current_grouping) {
      set_mail_item(cached.mail_item);
      set_email(cached.email);
      set_thread_messages(cached.thread_messages);
      set_thread_draft(cached.thread_draft);
      set_current_user_email(cached.current_user_email);
      set_is_loading(false);
      has_loaded_once.current = true;

      const item = cached.mail_item;
      const is_sent_type =
        item.item_type === "sent" || item.item_type === "draft";
      const should_auto_mark_read =
        !cached.email.is_read &&
        (is_sent_type ||
          (item.item_type === "received" &&
            preferences.mark_as_read_delay !== "never"));

      if (should_auto_mark_read) {
        const is_received = item.item_type === "received";
        const mark_read = () => {
          if (is_received) {
            adjust_unread_count(-1);
          }
          update_item_metadata(
            email_id,
            {
              encrypted_metadata: item.encrypted_metadata,
              metadata_nonce: item.metadata_nonce,
              metadata_version: item.metadata_version,
            },
            { is_read: true },
          ).then((result) => {
            if (result.success) {
              emit_mail_item_updated({
                id: email_id,
                is_read: true,
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
              });
            } else if (is_received) {
              adjust_unread_count(1);
            }
          });
        };

        if (is_sent_type || preferences.mark_as_read_delay === "immediate") {
          mark_read();
        } else {
          const delay_ms =
            preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

          mark_as_read_timeout.current = window.setTimeout(mark_read, delay_ms);
        }
      }

      if (cached.is_stale || Date.now() - cached.time > 30_000) {
        const revalidate_id = email_id;

        preload_email_detail(
          revalidate_id,
          user?.email,
          true,
          preferences.conversation_grouping,
        )
          .then(() => {
            const fresh = get_preload_cache().get(revalidate_id);

            if (fresh) {
              set_mail_item(fresh.mail_item);
              set_email(fresh.email);
              set_thread_messages(fresh.thread_messages);
              set_thread_draft(fresh.thread_draft);
            }
          })
          .catch(() => {});
      }

      return;
    }

    const is_first_load = !has_loaded_once.current;
    const start_time = Date.now();
    const min_duration = 500;

    const ensure_min_duration = async () => {
      if (!is_first_load) return;
      const elapsed = Date.now() - start_time;

      if (elapsed < min_duration) {
        await new Promise((r) => setTimeout(r, min_duration - elapsed));
      }
    };

    if (is_first_load) {
      set_is_loading(true);
      set_tracking_report(null);
    }

    const response = await get_mail_item(email_id);

    if (response.error) {
      const current_vault = get_vault_from_memory();

      if (current_vault) {
        const draft_response = await get_draft(email_id, current_vault);

        if (draft_response.data) {
          const recipients =
            draft_response.data.content.to_recipients.join(", ") ||
            t("common.no_recipients");
          const decrypted: import("@/components/email/hooks/email_detail_types").DecryptedEmail =
            {
              id: draft_response.data.id,
              sender: recipients,
              sender_email: draft_response.data.content.to_recipients[0] || "",
              subject:
                draft_response.data.content.subject || t("mail.no_subject"),
              preview: draft_response.data.content.message.substring(0, 200),
              timestamp: format_email_popup(
                new Date(draft_response.data.updated_at),
              ),
              is_read: true,
              is_starred: false,
              has_attachment: false,
              thread_count: 1,
              body: draft_response.data.content.message,
              to: draft_response.data.content.to_recipients.map((email) => ({
                email,
              })),
              cc:
                draft_response.data.content.cc_recipients?.map((email) => ({
                  email,
                })) || [],
              bcc:
                draft_response.data.content.bcc_recipients?.map((email) => ({
                  email,
                })) || [],
              replies: [],
              attachments: [],
              labels: ["Draft"],
            };

          set_email(decrypted);
          has_loaded_once.current = true;
          await ensure_min_duration();
          set_is_loading(false);

          return;
        }
      }

      await ensure_min_duration();
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      if (response.data.folders && response.data.folders.length > 0) {
        for (const mail_folder of response.data.folders) {
          const folder = folders_state.folders.find(
            (f) => f.folder_token === mail_folder.token,
          );

          if (
            folder &&
            folder.is_password_protected &&
            folder.password_set &&
            !is_folder_unlocked(folder.id)
          ) {
            await ensure_min_duration();
            set_error(t("common.email_in_locked_folder"));
            set_is_loading(false);

            return;
          }
        }
      }

      set_mail_item(response.data);

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

      const is_sent_type =
        response.data.item_type === "sent" ||
        response.data.item_type === "draft";
      const should_auto_mark_read =
        !decrypted_metadata?.is_read &&
        (is_sent_type ||
          (response.data.item_type === "received" &&
            preferences.mark_as_read_delay !== "never"));

      if (should_auto_mark_read) {
        const mail_data = response.data;
        const is_received = response.data.item_type === "received";
        const mark_read = () => {
          if (is_received) {
            adjust_unread_count(-1);
          }
          update_item_metadata(
            email_id,
            {
              encrypted_metadata: mail_data.encrypted_metadata,
              metadata_nonce: mail_data.metadata_nonce,
              metadata_version: mail_data.metadata_version,
            },
            { is_read: true },
          ).then((result) => {
            if (result.success) {
              emit_mail_item_updated({
                id: email_id,
                is_read: true,
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
              });
            } else if (is_received) {
              adjust_unread_count(1);
            }
          });
        };

        if (is_sent_type || preferences.mark_as_read_delay === "immediate") {
          mark_read();
        } else {
          const delay_ms =
            preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

          mark_as_read_timeout.current = window.setTimeout(mark_read, delay_ms);
        }
      }

      const envelope =
        response.data.encrypted_envelope && response.data.envelope_nonce != null
          ? await decrypt_mail_envelope(
              response.data.encrypted_envelope,
              response.data.envelope_nonce,
            )
          : null;

      if (envelope) {
        const { body_text, safe_html, unsubscribe_info } =
          await process_envelope_body(envelope, user?.email);

        const decrypted: import("@/components/email/hooks/email_detail_types").DecryptedEmail =
          {
            id: response.data.id,
            sender:
              envelope.from.name || get_email_username(envelope.from.email),
            sender_email: envelope.from.email,
            subject: envelope.subject || t("mail.no_subject"),
            preview: build_preview_text(body_text, safe_html),
            timestamp: format_email_popup(
              new Date(envelope.sent_at || response.data.created_at),
            ),
            is_read: decrypted_metadata?.is_read ?? false,
            is_starred: decrypted_metadata?.is_starred ?? false,
            has_attachment: decrypted_metadata?.has_attachments ?? false,
            thread_count: 1,
            body: body_text,
            html_content: safe_html,
            to: envelope.to?.length
              ? envelope.to
              : get_recipient_hint(email_id).map((e) => ({ email: e })),
            cc: envelope.cc || [],
            bcc: envelope.bcc || [],
            replies: [],
            attachments: [],
            labels: [],
            unsubscribe_info,
          };

        set_email(decrypted);

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
            {
              is_trashed: !!response.data.is_trashed,
              is_spam: !!response.data.is_spam,
            },
          );

          if (thread_result.messages.length > 0) {
            set_thread_messages(thread_result.messages);
          } else {
            set_thread_messages([single_message]);
          }
        } else if (
          preferences.conversation_grouping !== false &&
          stored_grouped_email_ids &&
          stored_grouped_email_ids.length > 1 &&
          email_id &&
          stored_grouped_email_ids.includes(email_id)
        ) {
          const group_messages = await fetch_and_decrypt_virtual_group(
            stored_grouped_email_ids,
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

        if (user?.email) {
          set_current_user_email(user.email);
        }

        if (response.data.thread_token) {
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
      }

      has_loaded_once.current = true;
      await ensure_min_duration();
      set_is_loading(false);
    } else {
      has_loaded_once.current = true;
      await ensure_min_duration();
      set_is_loading(false);
    }
  }, [email_id, folders_state.folders, user?.id, user?.email]);

  useEffect(() => {
    if (mark_as_read_timeout.current) {
      clearTimeout(mark_as_read_timeout.current);
      mark_as_read_timeout.current = null;
    }

    fetch_email();

    return () => {
      if (mark_as_read_timeout.current) {
        clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [fetch_email]);

  useEffect(() => {
    const handle_refresh = () => {
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
    const handle_keyboard_reply = () => {
      const last_msg =
        thread_messages.length > 0
          ? thread_messages[thread_messages.length - 1]
          : null;

      if (last_msg && !is_system_email(last_msg.sender_email)) {
        set_reply_modal_data(
          actions.build_reply_modal_data(
            last_msg,
            preferences.default_reply_behavior === "reply_all",
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
        sender: msg.sender_name,
        sender_email: msg.sender_email,
        timestamp: new Date(msg.timestamp).toLocaleString(),
        body: msg.html_content || msg.body,
        to_recipients: msg.to_recipients,
      })),
    };
  }, [email, thread_messages]);

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
