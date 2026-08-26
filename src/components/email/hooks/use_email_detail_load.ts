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

import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import { get_email_username } from "@/lib/utils";
import { extract_reply_to } from "@/utils/reply_to";
import { resolve_forwarding_display } from "@/utils/forwarding_alias";
import {
  is_ghost_email,
  looks_like_unregistered_ghost_email,
} from "@/stores/ghost_alias_store";
import { get_recipient_hint } from "@/stores/recipient_hint_store";
import { get_mail_item } from "@/services/api/mail";
import {
  fetch_and_decrypt_thread_messages,
  fetch_and_decrypt_virtual_group,
} from "@/services/thread_service";
import { update_item_metadata_safe } from "@/services/crypto/mail_metadata";
import {
  get_draft,
  get_draft_by_thread,
  type DraftWithContent,
} from "@/services/api/multi_drafts";
import { build_list_preview } from "@/utils/preview_text";
import {
  process_envelope_body,
  build_preview_text,
  build_single_thread_message,
} from "@/components/email/shared/build_email_from_envelope";
import { use_auth } from "@/contexts/auth_context";
import {
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import {
  get_vault_from_memory,
  wait_for_keys_ready,
  are_keys_ready,
} from "@/services/crypto/memory_key_store";
import { use_folders } from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import {
  has_protected_folders,
  request_folder_unlock,
} from "@/services/locked_folders";
import { adjust_stats_unread } from "@/hooks/use_mail_stats";
import { read_clears_conversation } from "@/hooks/unread_read_delta";
import { mark_conversation_read } from "@/hooks/mark_conversation_read";
import { use_document_title } from "@/hooks/use_document_title";
import { use_date_format } from "@/hooks/use_date_format";
import { use_preferences } from "@/contexts/preferences_context";
import { emit_mail_item_updated } from "@/hooks/mail_events";
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
import { prefetch_attachment_meta } from "@/services/attachment_meta_cache";
import { prefetch_attachment_previews } from "@/services/attachment_preview_cache";

import { ignore_error } from "@/lib/ignore_error";

export function use_email_detail_load() {
  const { t } = use_i18n();
  const { email_id } = useParams();
  const navigate = useNavigate();
  const { vault, user } = use_auth();
  const { state: folders_state } = use_folders();
  const { format_email_popup } = use_date_format();
  const { preferences, update_preference, save_now } = use_preferences();
  const mark_as_read_delay_ref = useRef(preferences.mark_as_read_delay);
  mark_as_read_delay_ref.current = preferences.mark_as_read_delay;
  const mark_as_read_timeout = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (mark_as_read_timeout.current !== null) {
        window.clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [email_id]);
  const has_loaded_once = useRef(false);
  const load_seq_ref = useRef(0);
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
    } catch (caught) {
      ignore_error("components/email/hooks/use_email_detail_load:use_email_detail_load", caught);
    }

    return [];
  });
  const [stored_grouped_email_ids] = useState<string[] | undefined>(() => {
    try {
      const stored = sessionStorage.getItem("astermail_email_nav");

      if (stored) {
        const parsed = JSON.parse(stored);

        return parsed.grouped_email_ids;
      }
    } catch (caught) {
      ignore_error("components/email/hooks/use_email_detail_load:use_email_detail_load", caught);
    }

    return undefined;
  });
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_mobile_sidebar_open, set_is_mobile_sidebar_open] = useState(false);
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const swept_threads_ref = useRef<Set<string>>(new Set());
  const [thread_truncated, set_thread_truncated] = useState(false);
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
    if (thread_messages.length === 0) return;

    void prefetch_attachment_meta(
      thread_messages
        .filter((message) => message.is_sending !== true)
        .map((message) => message.id),
    );
  }, [thread_messages]);

  useEffect(() => {
    if (thread_messages.length === 0 || !current_user_email) {
      set_thread_ghost_email(undefined);

      return;
    }

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

    if (is_ghost_email(sender) || looks_like_unregistered_ghost_email(sender)) {
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

  useEffect(() => {
    if (!mail_item || mail_item.item_type !== "received") return;
    if (mark_as_read_delay_ref.current === "never") return;
    if (preferences.conversation_grouping === false) return;

    const thread_token = mail_item.thread_token;

    if (!thread_token) return;
    if (!email || !email.is_read) return;
    if (!thread_messages.some((message) => !message.is_read)) return;
    if (swept_threads_ref.current.has(thread_token)) return;

    swept_threads_ref.current.add(thread_token);
    adjust_stats_unread(-1);
    mark_conversation_read({
      thread_token,
      thread_message_count: mail_item.thread_message_count,
      grouped_count: stored_grouped_email_ids?.length,
      conversation_grouping: preferences.conversation_grouping,
    });
  }, [
    mail_item,
    email,
    thread_messages,
    preferences.conversation_grouping,
    stored_grouped_email_ids,
  ]);

  const fetch_email = useCallback(async () => {
    if (!email_id) {
      set_is_loading(false);

      return;
    }

    const my_seq = ++load_seq_ref.current;
    const is_stale = () => load_seq_ref.current !== my_seq;

    const preload_in_flight = get_preload_in_flight();
    const preload_cache = get_preload_cache();
    const in_flight = preload_in_flight.get(email_id);

    if (in_flight) {
      await in_flight;
    }

    const cached = preload_cache.get(email_id);
    const current_grouping = preferences.conversation_grouping !== false;

    if (cached && cached.conversation_grouping === current_grouping) {
      if (is_stale()) return;
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
            mark_as_read_delay_ref.current !== "never"));

      if (should_auto_mark_read) {
        const is_received = item.item_type === "received";
        const mark_read = () => {
          const conversation_options = {
            thread_token: item.thread_token,
            thread_message_count: item.thread_message_count,
            grouped_count: stored_grouped_email_ids?.length,
            conversation_grouping: preferences.conversation_grouping,
            acted_id: email_id,
          };
          const clears_conversation =
            read_clears_conversation(conversation_options);

          if (is_received && item.thread_token) {
            swept_threads_ref.current.add(item.thread_token);
          }
          if (is_received && clears_conversation) {
            adjust_stats_unread(-1);
          }
          emit_mail_item_updated({ id: email_id, is_read: true });
          update_item_metadata_safe(
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
              if (is_received) {
                mark_conversation_read(conversation_options);
              }
            } else {
              emit_mail_item_updated({ id: email_id, is_read: false });
              if (is_received && item.thread_token) {
                swept_threads_ref.current.delete(item.thread_token);
              }
              if (is_received && clears_conversation) {
                adjust_stats_unread(1);
              }
            }
          });
        };

        if (is_sent_type || mark_as_read_delay_ref.current === "immediate") {
          mark_read();
        } else {
          const delay_ms =
            mark_as_read_delay_ref.current === "1_second" ? 1000 : 3000;

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
          .catch((caught) => ignore_error("components/email/hooks/use_email_detail_load:mark_read", caught));
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

    if (is_stale()) return;

    if (response.error) {
      const current_vault = get_vault_from_memory();

      if (current_vault) {
        const draft_response = await get_draft(email_id, current_vault);

        if (is_stale()) return;

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
              preview: build_list_preview(draft_response.data.content.message),
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

      if (
        (response.code === "NOT_FOUND" || response.code === "FORBIDDEN") &&
        has_protected_folders()
      ) {
        request_folder_unlock();
        await ensure_min_duration();
        set_error(t("common.email_in_locked_folder"));
        set_is_loading(false);

        return;
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
            request_folder_unlock(mail_folder.token);
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
      const is_read_on_server =
        response.data.is_read === true || (decrypted_metadata?.is_read ?? false);
      const should_auto_mark_read =
        !is_read_on_server &&
        (is_sent_type ||
          (response.data.item_type === "received" &&
            mark_as_read_delay_ref.current !== "never"));

      if (should_auto_mark_read) {
        const mail_data = response.data;
        const is_received = response.data.item_type === "received";
        const mark_read = () => {
          const conversation_options = {
            thread_token: mail_data.thread_token,
            thread_message_count: mail_data.thread_message_count,
            grouped_count: stored_grouped_email_ids?.length,
            conversation_grouping: preferences.conversation_grouping,
            acted_id: email_id,
          };
          const clears_conversation =
            read_clears_conversation(conversation_options);

          if (is_received && mail_data.thread_token) {
            swept_threads_ref.current.add(mail_data.thread_token);
          }
          if (is_received && clears_conversation) {
            adjust_stats_unread(-1);
          }
          emit_mail_item_updated({ id: email_id, is_read: true });
          update_item_metadata_safe(
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
              if (is_received) {
                mark_conversation_read(conversation_options);
              }
            } else {
              emit_mail_item_updated({ id: email_id, is_read: false });
              if (is_received && mail_data.thread_token) {
                swept_threads_ref.current.delete(mail_data.thread_token);
              }
              if (is_received && clears_conversation) {
                adjust_stats_unread(1);
              }
            }
          });
        };

        if (is_sent_type || mark_as_read_delay_ref.current === "immediate") {
          mark_read();
        } else {
          const delay_ms =
            mark_as_read_delay_ref.current === "1_second" ? 1000 : 3000;

          mark_as_read_timeout.current = window.setTimeout(mark_read, delay_ms);
        }
      }

      const envelope =
        response.data.encrypted_envelope && response.data.envelope_nonce != null
          ? await decrypt_mail_envelope(
              response.data.encrypted_envelope,
              response.data.envelope_nonce,
              response.data.id,
            )
          : null;

      const attachment_meta_ready = prefetch_attachment_meta([email_id]);

      void prefetch_attachment_previews(email_id);

      if (envelope) {
        const { body_text, safe_html, unsubscribe_info } =
          await process_envelope_body(envelope, user?.email, response.data.id);

        const decrypted: import("@/components/email/hooks/email_detail_types").DecryptedEmail =
          {
            id: response.data.id,
            sender:
              envelope.from.name || get_email_username(envelope.from.email),
            sender_email: envelope.from.email,
            ...(resolve_forwarding_display(
              envelope.from,
              envelope.raw_headers,
            ) ?? {}),
            raw_headers: envelope.raw_headers,
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
            reply_to: (() => {
              const parsed = extract_reply_to(envelope.raw_headers);
              return parsed
                ? { name: parsed.name, email: parsed.email }
                : undefined;
            })(),
          };

        if (is_stale()) return;
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
              limit: preferences.low_network_mode ? 4 : undefined,
            },
          );

          if (is_stale()) return;
          if (thread_result.messages.length > 0) {
            set_thread_messages(thread_result.messages);
            set_thread_truncated(thread_result.truncated);
          } else {
            set_thread_messages([single_message]);
            set_thread_truncated(false);
          }
        } else if (
          preferences.conversation_grouping !== false &&
          stored_grouped_email_ids &&
          stored_grouped_email_ids.length > 1 &&
          stored_grouped_email_ids.includes(email_id)
        ) {
          const group_messages = await fetch_and_decrypt_virtual_group(
            stored_grouped_email_ids,
            user?.email,
          );

          if (is_stale()) return;
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
          if (!are_keys_ready()) {
            await wait_for_keys_ready();
          }

          const current_vault = get_vault_from_memory();

          if (current_vault && !is_stale()) {
            const draft_result = await get_draft_by_thread(
              response.data.thread_token,
              current_vault,
            );

            if (draft_result.data && !is_stale()) {
              set_thread_draft(draft_result.data);
            }
          }
        }
      }

      await attachment_meta_ready;

      if (is_stale()) return;

      has_loaded_once.current = true;
      await ensure_min_duration();
      set_is_loading(false);
    } else {
      has_loaded_once.current = true;
      await ensure_min_duration();
      set_is_loading(false);
    }
  }, [email_id, folders_state.folders, user?.id, user?.email, preferences.low_network_mode, preferences.conversation_grouping]);

  return {
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
    auto_advance,
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
  };
}
