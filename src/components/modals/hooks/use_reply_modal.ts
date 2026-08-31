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

import { useEffect, useCallback, useMemo, useRef } from "react";

import {
  UseReplyModalProps,
  normalize_html_newlines,
} from "./reply_modal_types";
import { use_reply_modal_state } from "./use_reply_modal_state";

import { undo_send_manager } from "@/hooks/use_undo_send";
import { send_reply, type OriginalEmail } from "@/services/mail_actions";
import { build_reply_subject } from "@/lib/reply_subject";
import {
  MAX_RECIPIENTS_PER_FIELD,
  MAX_RECIPIENTS_PER_SEND,
  recipient_limit_violation,
} from "@/lib/recipient_limits";
import {
  assemble_reply_with_placement,
  resolve_signature_placement,
} from "@/lib/signature_placement";
import { use_signatures } from "@/contexts/signatures_context";
import {
  is_reply_from_mismatch,
  resolve_own_recipient_address,
} from "@/components/email/build_reply_from_address";
import { get_undo_send_delay_ms } from "@/services/send_queue";
import {
  build_send_fingerprint,
  can_acquire_send_lock,
  forget_send,
  is_duplicate_send,
  is_repeat_send,
  record_send,
} from "@/components/compose/send_lock";
import { auto_save_recipients_to_contacts } from "@/services/contacts_auto_save";
import { show_toast } from "@/components/toast/simple_toast";
import { show_action_toast } from "@/components/toast/action_toast";
import { format_bytes } from "@/lib/utils";
import {
  emit_email_sent,
  emit_thread_reply_cancelled,
  emit_thread_reply_optimistic,
  emit_thread_reply_sent,
} from "@/hooks/mail_events";
import {
  create_scheduled_email,
  type ScheduledEmailContent,
} from "@/services/api/scheduled";
import { emit_scheduled_changed } from "@/hooks/mail_events";
import { delete_draft } from "@/services/api/multi_drafts";
import {
  type Attachment,
  generate_attachment_id,
  EVENT_DISPATCH_DELAY_MS,
} from "@/components/compose/compose_shared";
import {
  MAX_ATTACHMENTS_PER_SEND,
  ensure_attachment_limits,
  get_max_attachment_size,
  get_max_total_attachments_size,
} from "@/services/attachment_limits";
import {
  describe_oversized_file,
  describe_too_many_attachments,
  describe_would_exceed_total,
  prompt_attachment_upgrade,
} from "@/services/attachment_rejection";
import { send_via_external_account } from "@/services/api/external_accounts";
import { prepare_external_attachments } from "@/services/crypto/attachment_crypto";
import { escape_html as escape_plain_text } from "@/hooks/editor_utils";
import { ignore_error } from "@/lib/ignore_error";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { user_facing_error } from "@/utils/user_facing_error";

export function use_reply_modal(props: UseReplyModalProps) {
  const {
    is_open,
    on_close,
    recipient_name,
    recipient_email,
    original_subject,
    original_body,
    original_timestamp,
    original_cc,
    original_to,
    reply_all,
    thread_token,
    original_email_id,
    is_external,
    reply_from_address,
    original_rfc_message_id,
  } = props;
  const {
    t,
    reduce_motion,
    user,
    vault,
    preferences,
    sender_options,
    selected_sender,
    set_selected_sender,
    ghost_mode,
    preferred_sender_id,
    recipients,
    dispatch_recipients,
    inputs,
    set_inputs,
    show_cc,
    set_show_cc,
    contacts,
    reply_message,
    set_reply_message,
    is_sending,
    set_is_sending,
    error_message,
    set_error_message,
    is_minimized,
    set_is_minimized,
    is_expanded,
    set_is_expanded,
    attachments,
    set_attachments,
    attachment_error,
    set_attachment_error,
    show_quoted,
    set_show_quoted,
    include_quoted,
    set_include_quoted,
    draft_id,
    set_draft_id,
    set_draft_version,
    expires_at,
    set_expires_at,
    expiry_password,
    set_expiry_password,
    scheduled_time,
    set_scheduled_time,
    is_scheduling,
    set_is_scheduling,
    draft_status,
    last_saved_time,
    show_delete_confirm,
    set_show_delete_confirm,
    is_plain_text_mode,
    set_is_plain_text_mode,
    show_from_mismatch,
    set_show_from_mismatch,
    send_after_sender_switch,
    set_send_after_sender_switch,
    from_mismatch_ack_ref,
    pending_send_kind_ref,
    handle_send_ref,
    handle_scheduled_send_ref,
    message_editor_ref,
    file_input_ref,
    attachments_scroll_ref,
    pending_thread_token_ref,
    optimistic_id_ref,
    save_draft_timeout,
    last_saved_text,
    is_sending_ref,
    send_lock_started_at_ref,
    last_send_time_ref,
    files_drop_ref,
    editor,
    active_formats,
    handle_drag_start,
    get_position_style,
    is_mac,
    handle_set_preferred,
    own_addresses,
    commit_pending_recipient_inputs,
    is_mobile,
    build_quoted_content,
    exec_format_command,
  } = use_reply_modal_state(props);

  const { signatures } = use_signatures();
  const placement_inputs_ref = useRef({
    signatures,
    signature_placement: preferences.signature_placement,
  });

  placement_inputs_ref.current = {
    signatures,
    signature_placement: preferences.signature_placement,
  };

  const resolve_placement = useCallback((signature_id: string | null) => {
    const { signatures: current, signature_placement } =
      placement_inputs_ref.current;

    return resolve_signature_placement(
      current.find((s) => s.id === signature_id)?.placement,
      signature_placement,
    );
  }, []);

  const toggle_plain_text_mode = useCallback(() => {
    set_is_plain_text_mode((prev) => !prev);
  }, []);

  const handle_template_select = useCallback(
    (content: string) => {
      const substituted = content
        .replace(
          /\[Date\]/g,
          new Date().toLocaleDateString(app_locale(), {
            timeZone: get_display_time_zone(),
          }),
        )
        .replace(/\[Name\]/g, recipient_name ?? "");

      editor.insert_text(substituted);
    },
    [editor, recipient_name],
  );

  const received_on_address = useMemo(() => {
    const explicit = reply_from_address?.trim();

    if (explicit) return explicit;

    return resolve_own_recipient_address(
      [...(original_to ?? []), ...(original_cc ?? [])],
      sender_options.filter((s) => s.is_enabled).map((s) => s.email ?? ""),
    );
  }, [reply_from_address, original_to, original_cc, sender_options]);

  const reply_from_mismatch = useCallback((): boolean => {
    if (from_mismatch_ack_ref.current) return false;

    return is_reply_from_mismatch(received_on_address, selected_sender?.email);
  }, [received_on_address, selected_sender]);

  const handle_send = useCallback(async () => {
    const now = Date.now();

    if (
      !can_acquire_send_lock(
        {
          held: is_sending_ref.current,
          started_at: send_lock_started_at_ref.current,
        },
        now,
      )
    )
      return;

    if (!reply_message.trim()) {
      set_error_message(t("common.empty_body_error"));

      return;
    }

    if (reply_from_mismatch()) {
      pending_send_kind_ref.current = "send";
      set_show_from_mismatch(true);

      return;
    }
    from_mismatch_ack_ref.current = false;

    if (is_repeat_send(last_send_time_ref.current, now)) return;

    if (save_draft_timeout.current) {
      clearTimeout(save_draft_timeout.current);
      save_draft_timeout.current = null;
    }

    const send_recipients = commit_pending_recipient_inputs();

    if (send_recipients.to.length === 0) {
      set_error_message(t("errors.no_recipients"));

      return;
    }

    const recipient_violation = recipient_limit_violation(
      send_recipients.to,
      send_recipients.cc,
      [],
    );

    if (recipient_violation) {
      set_error_message(
        recipient_violation === "field"
          ? t("common.too_many_recipients_in_field", {
              max: MAX_RECIPIENTS_PER_FIELD,
            })
          : t("common.too_many_recipients_in_message", {
              max: MAX_RECIPIENTS_PER_SEND,
            }),
      );

      return;
    }

    const send_fingerprint = build_send_fingerprint(
      [...send_recipients.to, ...send_recipients.cc],
      original_subject,
      reply_message,
    );

    if (is_duplicate_send(send_fingerprint, now)) {
      set_error_message(t("common.duplicate_send_blocked"));

      return;
    }

    is_sending_ref.current = true;
    send_lock_started_at_ref.current = now;
    last_send_time_ref.current = now;
    record_send(send_fingerprint, now);
    set_error_message(null);
    set_is_sending(true);

    if (preferences.auto_save_recent_recipients) {
      void auto_save_recipients_to_contacts(
        [...send_recipients.to, ...send_recipients.cc],
        { own_addresses },
      );
    }

    const original: OriginalEmail = {
      sender_email: recipient_email,
      sender_name: recipient_name,
      subject: original_subject,
      body: original_body,
      timestamp: original_timestamp,
      cc: original_cc,
      to: original_to,
    };

    const quoted_content = include_quoted ? build_quoted_content() : "";
    const trimmed_reply = reply_message.trim();
    const reply_body = is_plain_text_mode
      ? escape_plain_text(trimmed_reply).replace(/\n/g, "<br>")
      : normalize_html_newlines(trimmed_reply);
    const message_with_signature = assemble_reply_with_placement(
      reply_body,
      quoted_content,
      resolve_placement,
    );

    if (selected_sender?.type === "external" && selected_sender.address_hash) {
      const subject = build_reply_subject(
        original_subject,
        t("mail.reply_subject_prefix"),
      );
      const external_attachments =
        attachments.length > 0
          ? prepare_external_attachments(attachments)
          : undefined;
      const ext_result = await send_via_external_account(
        selected_sender.address_hash,
        send_recipients.to,
        send_recipients.cc,
        [],
        subject,
        message_with_signature,
        external_attachments,
      ).catch((error: unknown) => ({
        error:
          error instanceof Error
            ? error.message
            : t("common.failed_to_send_reply"),
      }));

      if (ext_result.error) {
        is_sending_ref.current = false;
        send_lock_started_at_ref.current = 0;
        last_send_time_ref.current = 0;
        forget_send(send_fingerprint);
        set_error_message(ext_result.error);
        set_is_sending(false);

        return;
      }

      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
      show_toast(t("common.email_sent_via_external"), "success");
      emit_email_sent();

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        await delete_draft(captured_draft_id).catch((caught) =>
          ignore_error(
            "components/modals/hooks/use_reply_modal:use_reply_modal",
            caught,
          ),
        );
      }

      on_close();

      return;
    }

    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );
    const delay_seconds = delay_ms / 1000;

    const sender_email_value =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.email
        : undefined;
    const sender_alias_hash_value =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.address_hash
        : undefined;
    const sender_display_name_value =
      selected_sender && selected_sender.type !== "primary"
        ? selected_sender.display_name
        : undefined;

    const result = await send_reply(
      {
        original,
        message: message_with_signature,
        reply_all,
        to_recipients: send_recipients.to,
        cc_recipients: send_recipients.cc,
        own_addresses,
        thread_token,
        original_email_id,
        expires_at: expires_at?.toISOString(),
        sender_email: sender_email_value,
        sender_alias_hash: sender_alias_hash_value,
        sender_display_name: sender_display_name_value,
        in_reply_to: original_rfc_message_id,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      {
        on_complete: () => {
          is_sending_ref.current = false;
          send_lock_started_at_ref.current = 0;
          set_is_sending(false);
          emit_email_sent();
          show_action_toast({
            message: t("common.email_sent"),
            action_type: "read",
            email_ids: [],
            duration_ms: 5000,
            on_view_message: () => {
              window.dispatchEvent(
                new CustomEvent("astermail:navigate-to-sent"),
              );
            },
          });

          if (pending_thread_token_ref.current) {
            emit_thread_reply_sent({
              thread_token: pending_thread_token_ref.current,
              original_email_id,
              optimistic_id: optimistic_id_ref.current ?? undefined,
            });
            pending_thread_token_ref.current = null;
          }
          optimistic_id_ref.current = null;
        },
        on_cancel: () => {
          is_sending_ref.current = false;
          send_lock_started_at_ref.current = 0;
          set_is_sending(false);
          last_send_time_ref.current = 0;
          forget_send(send_fingerprint);
          if (optimistic_id_ref.current && pending_thread_token_ref.current) {
            emit_thread_reply_cancelled({
              optimistic_id: optimistic_id_ref.current,
              thread_token: pending_thread_token_ref.current,
            });
          }
          optimistic_id_ref.current = null;
          pending_thread_token_ref.current = null;
        },
        on_error: (error) => {
          is_sending_ref.current = false;
          send_lock_started_at_ref.current = 0;
          if (optimistic_id_ref.current && pending_thread_token_ref.current) {
            emit_thread_reply_cancelled({
              optimistic_id: optimistic_id_ref.current,
              thread_token: pending_thread_token_ref.current,
            });
          }
          optimistic_id_ref.current = null;
          set_error_message(error);
          show_toast(error || t("common.failed_to_send_reply"), "error", 10000);
          set_is_sending(false);
          last_send_time_ref.current = 0;
          forget_send(send_fingerprint);
          pending_thread_token_ref.current = null;
        },
      },
      delay_ms,
    ).catch((error: unknown) => ({
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : t("common.failed_to_send_reply"),
      queued_id: undefined,
      thread_token: undefined,
      is_server_queued: undefined,
    }));

    if (result.success && result.queued_id) {
      pending_thread_token_ref.current = result.thread_token || null;

      const reply_thread_token = result.thread_token || thread_token;

      if (reply_thread_token) {
        const opt_id = crypto.randomUUID();

        optimistic_id_ref.current = opt_id;

        const sender_name =
          selected_sender?.display_name ||
          user?.display_name ||
          user?.username ||
          "";
        const sender_email_addr =
          selected_sender && selected_sender.type !== "primary"
            ? selected_sender.email
            : user?.email || "";

        emit_thread_reply_optimistic({
          thread_token: reply_thread_token,
          original_email_id,
          optimistic_id: opt_id,
          sender_name,
          sender_email: sender_email_addr,
          subject: build_reply_subject(
            original_subject,
            t("mail.reply_subject_prefix"),
          ),
          body: message_with_signature,
          display_body: reply_body,
          to_recipients: send_recipients.to.map((email) => ({
            name: email === recipient_email ? recipient_name : "",
            email,
          })),
          cc_recipients: send_recipients.cc.map((email) => ({
            name: "",
            email,
          })),
        });
      }

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        delete_draft(captured_draft_id).catch((caught) =>
          ignore_error(
            "components/modals/hooks/use_reply_modal:use_reply_modal",
            caught,
          ),
        );
      }

      if (delay_seconds > 0) {
        undo_send_manager.add({
          id: result.queued_id,
          to: send_recipients.to,
          subject: build_reply_subject(
            original_subject,
            t("mail.reply_subject_prefix"),
          ),
          body: message_with_signature,
          sender_email: sender_email_value,
          scheduled_time: Date.now() + delay_ms,
          total_seconds: delay_seconds,
          is_server_queued: result.is_server_queued,
          server_queue_id: result.is_server_queued
            ? result.queued_id
            : undefined,
          optimistic_id: optimistic_id_ref.current || undefined,
          thread_token: reply_thread_token || undefined,
        });
      }

      on_close();
    } else if (!result.success) {
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
      set_error_message(result.error || t("common.failed_to_send_reply"));
      set_is_sending(false);
      last_send_time_ref.current = 0;
      forget_send(send_fingerprint);
    }
  }, [
    t,
    reply_message,
    is_sending,
    recipient_email,
    recipient_name,
    original_subject,
    original_body,
    original_timestamp,
    original_cc,
    original_to,
    reply_all,
    own_addresses,
    commit_pending_recipient_inputs,
    thread_token,
    original_email_id,
    selected_sender,
    preferences.undo_send_period,
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,
    preferences.auto_save_recent_recipients,

    on_close,
    draft_id,
    expires_at,
    build_quoted_content,
    include_quoted,
    user,
    is_plain_text_mode,
    attachments,
    reply_from_mismatch,
  ]);

  const handle_scheduled_send = useCallback(async () => {
    if (!reply_message.trim() || !user || !vault || !scheduled_time) return;

    if (attachments.length > 0) {
      set_error_message(t("common.scheduled_no_attachments"));

      return;
    }

    if (reply_from_mismatch()) {
      pending_send_kind_ref.current = "scheduled";
      set_show_from_mismatch(true);

      return;
    }
    from_mismatch_ack_ref.current = false;

    const send_recipients = commit_pending_recipient_inputs();

    if (send_recipients.to.length === 0) {
      set_error_message(t("errors.no_recipients"));

      return;
    }

    const recipient_violation = recipient_limit_violation(
      send_recipients.to,
      send_recipients.cc,
      [],
    );

    if (recipient_violation) {
      set_error_message(
        recipient_violation === "field"
          ? t("common.too_many_recipients_in_field", {
              max: MAX_RECIPIENTS_PER_FIELD,
            })
          : t("common.too_many_recipients_in_message", {
              max: MAX_RECIPIENTS_PER_SEND,
            }),
      );

      return;
    }

    if (save_draft_timeout.current) {
      clearTimeout(save_draft_timeout.current);
      save_draft_timeout.current = null;
    }

    is_sending_ref.current = true;
    set_is_scheduling(true);
    set_error_message(null);

    const quoted_content = include_quoted ? build_quoted_content() : "";
    const sched_trimmed = reply_message.trim();
    const sched_reply_body = is_plain_text_mode
      ? escape_plain_text(sched_trimmed).replace(/\n/g, "<br>")
      : normalize_html_newlines(sched_trimmed);
    const message_with_signature = assemble_reply_with_placement(
      sched_reply_body,
      quoted_content,
      resolve_placement,
    );

    const content: ScheduledEmailContent = {
      to_recipients: send_recipients.to,
      cc_recipients: send_recipients.cc,
      bcc_recipients: [],
      subject: build_reply_subject(
        original_subject,
        t("mail.reply_subject_prefix"),
      ),
      body: message_with_signature,
      scheduled_at: scheduled_time.toISOString(),
    };

    try {
      const response = await create_scheduled_email(vault, content);

      if (response.error) {
        set_error_message(response.error);
        set_is_scheduling(false);
        is_sending_ref.current = false;
        send_lock_started_at_ref.current = 0;

        return;
      }

      if (draft_id) {
        const captured_draft_id = draft_id;

        set_draft_id(null);
        set_draft_version(1);
        last_saved_text.current = "";
        await delete_draft(captured_draft_id).catch((caught) =>
          ignore_error(
            "components/modals/hooks/use_reply_modal:use_reply_modal",
            caught,
          ),
        );
      }

      on_close();

      setTimeout(() => {
        emit_scheduled_changed({ action: "created" });
      }, EVENT_DISPATCH_DELAY_MS);
    } catch (error) {
      set_error_message(
        user_facing_error(error, t("common.failed_to_schedule")),
      );
    } finally {
      set_is_scheduling(false);
      is_sending_ref.current = false;
      send_lock_started_at_ref.current = 0;
    }
  }, [
    t,
    reply_message,
    user,
    vault,
    scheduled_time,
    commit_pending_recipient_inputs,
    original_subject,

    build_quoted_content,
    include_quoted,
    on_close,
    draft_id,
    is_plain_text_mode,
    attachments,
    reply_from_mismatch,
  ]);

  handle_send_ref.current = handle_send;
  handle_scheduled_send_ref.current = handle_scheduled_send;

  const run_pending_send = useCallback(() => {
    const kind = pending_send_kind_ref.current;

    pending_send_kind_ref.current = null;
    if (kind === "scheduled") {
      handle_scheduled_send_ref.current();
    } else {
      handle_send_ref.current();
    }
  }, []);

  const from_mismatch_sender_match = useMemo(() => {
    const normalized = received_on_address?.trim().toLowerCase();

    if (!normalized) return null;

    return (
      sender_options.find(
        (s) => s.is_enabled && s.email?.trim().toLowerCase() === normalized,
      ) ?? null
    );
  }, [received_on_address, sender_options]);

  const handle_from_mismatch_cancel = useCallback(() => {
    pending_send_kind_ref.current = null;
    set_show_from_mismatch(false);
  }, []);

  const handle_from_mismatch_send_anyway = useCallback(() => {
    from_mismatch_ack_ref.current = true;
    set_show_from_mismatch(false);
    run_pending_send();
  }, [run_pending_send]);

  const handle_from_mismatch_use_received = useCallback(() => {
    set_show_from_mismatch(false);
    if (!from_mismatch_sender_match) {
      pending_send_kind_ref.current = null;

      return;
    }
    from_mismatch_ack_ref.current = true;
    set_selected_sender(from_mismatch_sender_match);
    set_send_after_sender_switch(true);
  }, [from_mismatch_sender_match]);

  useEffect(() => {
    if (!send_after_sender_switch) return;
    const received = received_on_address?.trim().toLowerCase();

    if (received && selected_sender?.email?.trim().toLowerCase() === received) {
      set_send_after_sender_switch(false);
      run_pending_send();
    }
  }, [
    send_after_sender_switch,
    selected_sender,
    received_on_address,
    run_pending_send,
  ]);

  useEffect(() => {
    if (!is_open) {
      set_show_from_mismatch(false);
      set_send_after_sender_switch(false);
      from_mismatch_ack_ref.current = false;
      pending_send_kind_ref.current = null;
    }
  }, [is_open]);

  const handle_close = useCallback(() => {
    on_close();
  }, [on_close]);

  const handle_delete_draft = useCallback(async () => {
    if (draft_id) {
      const result = await delete_draft(draft_id);

      if (result.error) {
        set_show_delete_confirm(false);
        show_toast(t("common.failed_to_delete_draft"), "error");

        return;
      }

      set_draft_id(null);
      set_draft_version(1);
      last_saved_text.current = "";
    }

    if (message_editor_ref.current) {
      message_editor_ref.current.innerHTML = "";
    }
    set_reply_message("");
    set_attachments([]);
    set_show_delete_confirm(false);
    on_close();
  }, [
    t,
    draft_id,
    on_close,
    message_editor_ref,
    set_reply_message,
    set_attachments,
    set_draft_id,
    set_draft_version,
    last_saved_text,
    set_show_delete_confirm,
  ]);

  const get_total_attachments_size = useCallback(() => {
    return attachments.reduce((total, att) => total + att.size_bytes, 0);
  }, [attachments]);

  const handle_file_select = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) return;

      set_attachment_error(null);
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (
          attachments.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          set_attachment_error(describe_too_many_attachments(t));
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name, file.size);

          set_attachment_error(rejection.message);

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(
              rejection.message,
              rejection.upgrade_plan_code,
            );
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          set_attachment_error(describe_would_exceed_total(t, file.name));
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(
            t("common.file_already_attached", { name: file.name }),
          );
          continue;
        }

        try {
          const data = await file.arrayBuffer();

          new_attachments.push({
            id: generate_attachment_id(),
            name: file.name,
            size: format_bytes(file.size),
            size_bytes: file.size,
            mime_type,
            data,
          });
          running_total += file.size;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(
            t("common.failed_to_read_named_file", { name: file.name }),
          );
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }

      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    },
    [attachments, get_total_attachments_size, t],
  );

  const handle_files_drop = useCallback(
    async (files: File[]) => {
      set_attachment_error(null);
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (const file of files) {
        if (
          attachments.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          set_attachment_error(describe_too_many_attachments(t));
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name, file.size);

          set_attachment_error(rejection.message);

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(
              rejection.message,
              rejection.upgrade_plan_code,
            );
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          set_attachment_error(describe_would_exceed_total(t, file.name));
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(
            t("common.file_already_attached", { name: file.name }),
          );
          continue;
        }

        try {
          const data = await file.arrayBuffer();

          new_attachments.push({
            id: generate_attachment_id(),
            name: file.name,
            size: format_bytes(file.size),
            size_bytes: file.size,
            mime_type,
            data,
          });
          running_total += file.size;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(
            t("common.failed_to_read_named_file", { name: file.name }),
          );
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }
    },
    [attachments, get_total_attachments_size, t],
  );

  files_drop_ref.current = handle_files_drop;

  const remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const is_valid = reply_message.trim().length > 0;
  const can_send = is_valid && !is_sending;

  return {
    t,
    reduce_motion,
    sender_options,
    selected_sender,
    set_selected_sender,
    ghost_mode,
    recipients,
    dispatch_recipients,
    inputs,
    set_inputs,
    show_cc,
    set_show_cc,
    contacts,
    reply_message,
    is_sending,
    error_message,
    set_error_message,
    is_minimized,
    set_is_minimized,
    is_expanded,
    set_is_expanded,
    attachments,
    attachment_error,
    set_attachment_error,
    show_quoted,
    set_show_quoted,
    include_quoted,
    set_include_quoted,
    draft_id,
    expires_at,
    set_expires_at,
    expiry_password,
    set_expiry_password,
    scheduled_time,
    set_scheduled_time,
    is_scheduling,
    draft_status,
    last_saved_time,
    show_delete_confirm,
    set_show_delete_confirm,
    is_plain_text_mode,
    message_editor_ref,
    file_input_ref,
    attachments_scroll_ref,
    editor,
    active_formats,
    handle_drag_start,
    get_position_style,
    is_mac,
    is_mobile,
    build_quoted_content,
    exec_format_command,
    toggle_plain_text_mode,
    handle_template_select,
    handle_send,
    handle_scheduled_send,
    handle_close,
    handle_delete_draft,
    handle_file_select,
    handle_files_drop,
    remove_attachment,
    trigger_file_select,
    is_valid,
    can_send,
    is_external,
    recipient_email,
    original_subject,
    original_body,
    preferred_sender_id,
    handle_set_preferred,
    from_mismatch: {
      open: show_from_mismatch,
      received: received_on_address ?? "",
      selected: selected_sender?.email ?? "",
      can_use_received: !!from_mismatch_sender_match,
      on_cancel: handle_from_mismatch_cancel,
      on_send_anyway: handle_from_mismatch_send_anyway,
      on_use_received: handle_from_mismatch_use_received,
    },
  };
}
