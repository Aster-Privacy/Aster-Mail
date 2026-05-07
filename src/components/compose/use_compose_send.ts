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
import type { DecryptedContact } from "@/types/contacts";
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useState, useRef, useCallback } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { create_contact_encrypted } from "@/services/api/contacts";
import { get_or_create_thread_token } from "@/services/thread_service";
import { is_internal_email } from "@/services/api/keys";
import { draft_manager } from "@/services/crypto/encrypted_drafts";
import {
  create_scheduled_email,
  type ScheduledEmailContent,
} from "@/services/api/scheduled";
import { emit_scheduled_changed } from "@/hooks/mail_events";
import { show_toast } from "@/components/toast/simple_toast";
import {
  get_network_status,
  is_native_platform,
} from "@/native/capacitor_bridge";
import { enqueue_action } from "@/native/offline_queue";
import { array_to_base64 } from "@/services/crypto/envelope";
import {
  type Attachment,
  type RecipientsState,
  type EditDraftData,
  EVENT_DISPATCH_DELAY_MS,
} from "@/components/compose/compose_shared";
import {
  execute_internal_send,
  execute_external_email_send,
  execute_external_account_email_send,
  type SendActionContext,
} from "@/components/compose/compose_send_actions";

export interface UseComposeSendOptions {
  recipients: RecipientsState;
  subject: string;
  message: string;
  attachments: Attachment[];
  contacts: DecryptedContact[];
  selected_sender: SenderOption | null;
  has_external_recipients: boolean;
  expires_at: Date | null;
  expiry_password: string | null;
  scheduled_time: Date | null;
  edit_draft?: EditDraftData | null;
  session_storage_key: string;
  enable_offline_queue?: boolean;
  on_close: () => void;
  on_draft_cleared?: () => void;
  reset_form: () => void;
  clear_all_errors: () => void;
  set_is_scheduling: (val: boolean) => void;
  is_sending_ref: React.MutableRefObject<boolean>;
  save_timer_ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  draft_context_id_ref: React.MutableRefObject<string | null>;
}

export interface UseComposeSendReturn {
  send_error: string | null;
  restore_error: string | null;
  queued_email_id: string | null;
  set_queued_email_id: (val: string | null) => void;
  handle_send: () => Promise<void>;
  handle_scheduled_send: () => Promise<void>;
  pgp_enabled: boolean;
  toggle_pgp: () => void;
}

export function use_compose_send({
  recipients,
  subject,
  message,
  attachments,
  contacts,
  selected_sender,
  has_external_recipients,
  expires_at,
  expiry_password,
  scheduled_time,
  edit_draft,
  session_storage_key,
  enable_offline_queue = false,
  on_close,
  on_draft_cleared,
  reset_form,
  clear_all_errors,
  set_is_scheduling,
  is_sending_ref,
  save_timer_ref,
  draft_context_id_ref,
}: UseComposeSendOptions): UseComposeSendReturn {
  const { t } = use_i18n();
  const { vault, user } = use_auth();
  const { preferences } = use_preferences();

  const [queued_email_id, set_queued_email_id] = useState<string | null>(null);
  const [send_error] = useState<string | null>(null);
  const [restore_error] = useState<string | null>(null);
  const [pgp_enabled, set_pgp_enabled] = useState(false);
  const toggle_pgp = useCallback(() => set_pgp_enabled((v) => !v), []);
  const last_send_time_ref = useRef<number>(0);

  const build_send_context = useCallback(
    (): SendActionContext => ({
      undo_send_enabled: preferences.undo_send_enabled,
      undo_send_seconds: preferences.undo_send_seconds,
      undo_send_period: preferences.undo_send_period,
      message,
      session_storage_key,
      edit_draft,
      on_close,
      on_draft_cleared,
      reset_form,
      set_queued_email_id,
      t,
    }),
    [
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
      message,
      session_storage_key,
      edit_draft,
      on_close,
      on_draft_cleared,
      reset_form,
      t,
    ],
  );

  const handle_send = useCallback(async () => {
    if (is_sending_ref.current) return;
    if (recipients.to.length === 0 || !user) return;

    const stripped_body = message
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (!stripped_body) {
      show_toast(t("common.empty_body_error"), "error");

      return;
    }

    if (subject.length > 998) {
      show_toast(t("common.subject_too_long"), "error");

      return;
    }

    const now = Date.now();

    if (now - last_send_time_ref.current < 2000) return;

    is_sending_ref.current = true;
    last_send_time_ref.current = now;

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    clear_all_errors();

    if (enable_offline_queue && is_native_platform()) {
      const network_status = await get_network_status();

      if (!network_status.connected) {
        try {
          const offline_attachments =
            attachments.length > 0
              ? attachments.map((a) => ({
                  name: a.name,
                  data: array_to_base64(new Uint8Array(a.data)),
                  type: a.mime_type,
                }))
              : undefined;

          await enqueue_action("send_email", {
            to: recipients.to,
            cc: recipients.cc.length > 0 ? recipients.cc : undefined,
            bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
            subject,
            body: message,
            attachments: offline_attachments,
          });

          show_toast(t("common.offline_email_queued"), "info");

          if (draft_context_id_ref.current) {
            await draft_manager.await_pending_save(
              draft_context_id_ref.current,
            );
            await draft_manager.delete_draft(draft_context_id_ref.current);
            draft_manager.clear_context(draft_context_id_ref.current);
            draft_context_id_ref.current = null;
          }

          reset_form();
          on_close();

          if (edit_draft && on_draft_cleared) {
            on_draft_cleared();
          }
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          show_toast(t("common.failed_to_queue_offline"), "error");
        } finally {
          is_sending_ref.current = false;
        }

        return;
      }
    }

    try {
      if (draft_context_id_ref.current) {
        await draft_manager.await_pending_save(draft_context_id_ref.current);
        await draft_manager.delete_draft(draft_context_id_ref.current);
        draft_manager.clear_context(draft_context_id_ref.current);
        draft_context_id_ref.current = null;
      }

      let thread_id: string | undefined;

      if (edit_draft?.draft_type === "reply" && edit_draft.reply_to_id) {
        const resolved_token = await get_or_create_thread_token(
          edit_draft.reply_to_id,
          edit_draft.thread_token,
        );

        if (resolved_token) {
          thread_id = resolved_token;
        }
      }

      const email_data = {
        to: recipients.to,
        cc: recipients.cc.length > 0 ? recipients.cc : undefined,
        bcc: recipients.bcc.length > 0 ? recipients.bcc : undefined,
        subject,
        body: message,
        thread_id,
        sender_email:
          selected_sender?.type !== "primary"
            ? selected_sender?.email
            : undefined,
        sender_alias_hash:
          selected_sender?.type !== "primary"
            ? selected_sender?.address_hash
            : undefined,
        sender_display_name: selected_sender?.display_name,
        expires_at: expires_at?.toISOString(),
        expiry_password:
          has_external_recipients && expiry_password
            ? expiry_password
            : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const all_recipients = [
        ...recipients.to,
        ...recipients.cc,
        ...recipients.bcc,
      ];

      if (
        preferences.auto_save_recent_recipients &&
        all_recipients.length > 0
      ) {
        const existing_emails = new Set(
          contacts.map((c) => c.emails?.[0]?.toLowerCase()).filter(Boolean),
        );

        for (const email of all_recipients) {
          if (!existing_emails.has(email.toLowerCase())) {
            const parts = email.split("@")[0].split(".");

            create_contact_encrypted({
              first_name: parts[0] || "",
              last_name: parts.slice(1).join(" ") || "",
              emails: [email],
              is_favorite: false,
            }).catch((e) => {
              if (import.meta.env.DEV) console.error(e);
            });
          }
        }
      }

      const ctx = build_send_context();

      if (selected_sender?.type === "external") {
        execute_external_account_email_send(ctx, email_data);

        return;
      }

      const has_external = all_recipients.some((r) => !is_internal_email(r));
      const has_internal = all_recipients.some((r) => is_internal_email(r));

      if (has_external && has_internal) {
        show_toast(t("common.cannot_mix_recipients"), "error");

        return;
      }

      if (has_external) {
        execute_external_email_send(ctx, email_data, pgp_enabled);

        return;
      }

      execute_internal_send(ctx, email_data);
    } catch (error) {
      show_toast(
        error instanceof Error
          ? error.message
          : t("common.failed_to_send_email"),
        "error",
      );
    } finally {
      is_sending_ref.current = false;
    }
  }, [
    recipients,
    subject,
    message,
    user,
    clear_all_errors,
    build_send_context,
    reset_form,
    on_close,
    edit_draft,
    on_draft_cleared,
    expires_at,
    expiry_password,
    has_external_recipients,
    enable_offline_queue,
    selected_sender,
    attachments,
    preferences.auto_save_recent_recipients,
    pgp_enabled,
    t,
  ]);

  const handle_scheduled_send = useCallback(async () => {
    if (recipients.to.length === 0 || !user || !vault || !scheduled_time)
      return;

    is_sending_ref.current = true;
    set_is_scheduling(true);

    if (save_timer_ref.current) {
      clearTimeout(save_timer_ref.current);
      save_timer_ref.current = null;
    }

    clear_all_errors();

    const content: ScheduledEmailContent = {
      to_recipients: recipients.to,
      cc_recipients: recipients.cc,
      bcc_recipients: recipients.bcc,
      subject,
      body: message,
      scheduled_at: scheduled_time.toISOString(),
    };

    try {
      const response = await create_scheduled_email(vault, content);

      if (response.error) {
        show_toast(response.error, "error");
        set_is_scheduling(false);
        is_sending_ref.current = false;

        return;
      }

      if (draft_context_id_ref.current) {
        await draft_manager.await_pending_save(draft_context_id_ref.current);
        await draft_manager.delete_draft(draft_context_id_ref.current);
        draft_manager.clear_context(draft_context_id_ref.current);
        draft_context_id_ref.current = null;
      }

      reset_form();
      on_close();

      if (edit_draft && on_draft_cleared) {
        on_draft_cleared();
      }

      setTimeout(() => {
        emit_scheduled_changed({ action: "created" });
      }, EVENT_DISPATCH_DELAY_MS);
    } catch (error) {
      show_toast(
        error instanceof Error
          ? error.message
          : t("common.failed_to_schedule_email"),
        "error",
      );
    } finally {
      set_is_scheduling(false);
      is_sending_ref.current = false;
    }
  }, [
    recipients,
    subject,
    message,
    scheduled_time,
    vault,
    user,
    clear_all_errors,
    reset_form,
    on_close,
    edit_draft,
    on_draft_cleared,
    t,
  ]);

  return {
    send_error,
    restore_error,
    queued_email_id,
    set_queued_email_id,
    handle_send,
    handle_scheduled_send,
    pgp_enabled,
    toggle_pgp,
  };
}
