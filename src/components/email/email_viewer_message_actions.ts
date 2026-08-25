//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type { ReplyData } from "@/components/email/email_viewer_types";
import type { EmailViewerActionsDeps } from "./email_viewer_actions";

import { useCallback } from "react";

import { is_system_email } from "@/lib/utils";
import {
  update_item_metadata,
  bulk_update_metadata_by_ids,
} from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  emit_mail_changed,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import { print_email } from "@/utils/print_email";
import { adjust_stats_unread } from "@/hooks/use_mail_stats";
import { conversation_has_unread_sibling } from "@/hooks/unread_read_delta";
import { report_spam_sender, remove_spam_sender } from "@/services/api/mail";
import { reindex_ids } from "@/services/category_index";
import { set_forward_mail_id } from "@/services/forward_store";
import { ignore_error } from "@/lib/ignore_error";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

export function use_message_actions(
  deps: EmailViewerActionsDeps,
  build_reply_data: (
    msg: DecryptedThreadMessage,
    is_reply_all: boolean,
  ) => ReplyData,
) {
  const handle_per_message_reply = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (!deps.on_reply || is_system_email(msg.sender_email)) return;
      const is_reply_all =
        deps.preferences_default_reply_behavior === "reply_all";

      deps.on_reply(build_reply_data(msg, is_reply_all));
    },
    [deps.on_reply, deps.preferences_default_reply_behavior, build_reply_data],
  );

  const handle_per_message_reply_all = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (!deps.on_reply || is_system_email(msg.sender_email)) return;
      deps.on_reply(build_reply_data(msg, true));
    },
    [deps.on_reply, build_reply_data],
  );

  const handle_per_message_forward = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (!deps.on_forward) return;
      set_forward_mail_id(msg.id);
      deps.on_forward({
        sender_name: msg.sender_name,
        sender_email: msg.sender_email,
        sender_avatar: "",
        email_subject: msg.subject,
        email_body: msg.body,
        email_timestamp: new Date(msg.timestamp).toLocaleString(app_locale(), {
          timeZone: get_display_time_zone(),
        }),
        original_mail_id: msg.id,
      });
    },
    [deps.on_forward],
  );

  const handle_per_message_archive = useCallback(
    async (msg: DecryptedThreadMessage) => {
      const result = await batch_archive({ ids: [msg.id], tier: "hot" });

      if (result.data?.success) {
        await bulk_update_metadata_by_ids([msg.id], { is_archived: true });
        emit_mail_items_removed({ ids: [msg.id] });
        emit_mail_changed();
        show_action_toast({
          message: deps.t("common.message_archived"),
          action_type: "archive",
          email_ids: [msg.id],
          on_undo: async () => {
            const undo_result = await batch_unarchive({ ids: [msg.id] });

            if (undo_result.error || !undo_result.data?.success) {
              reindex_ids([msg.id]);
              throw new Error("undo unarchive failed");
            }
            await bulk_update_metadata_by_ids([msg.id], {
              is_archived: false,
            });
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          },
        });
      } else {
        show_toast(deps.t("common.failed_to_archive_emails"), "error");
      }
    },
    [deps.t],
  );

  const handle_per_message_trash = useCallback(
    async (msg: DecryptedThreadMessage) => {
      const result = await update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_trashed: true },
      );

      if (result.success) {
        emit_mail_items_removed({ ids: [msg.id] });
        emit_mail_changed();
        show_action_toast({
          message: deps.t("common.message_moved_to_trash"),
          action_type: "trash",
          email_ids: [msg.id],
          on_undo: async () => {
            const undo_result = await update_item_metadata(
              msg.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
              },
              { is_trashed: false },
            );

            if (!undo_result.success) throw new Error("undo trash failed");
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          },
        });
      } else {
        show_toast(deps.t("common.failed_to_move_email"), "error");
      }
    },
    [deps.t],
  );

  const handle_per_message_print = useCallback(
    (msg: DecryptedThreadMessage) => {
      print_email(
        {
          subject: msg.subject,
          sender: msg.display_sender_name || msg.sender_name,
          sender_email: msg.display_sender_email || msg.sender_email,
          to: msg.to_recipients || [],
          cc: msg.cc_recipients,
          timestamp: new Date(msg.timestamp).toLocaleString(app_locale(), {
            timeZone: get_display_time_zone(),
          }),
          body: msg.html_content || msg.body,
        },
        deps.t,
      );
    },
    [deps.t],
  );

  const handle_per_message_view_source = useCallback(
    (msg: DecryptedThreadMessage) => {
      deps.set_view_source_message(msg);
    },
    [],
  );

  const handle_per_message_report_phishing = useCallback(
    async (msg: DecryptedThreadMessage) => {
      const result = await update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_spam: true, is_trashed: false },
      );

      if (result.success) {
        emit_mail_items_removed({ ids: [msg.id] });
        if (msg.sender_email) {
          report_spam_sender(msg.sender_email).catch((caught) =>
            ignore_error(
              "components/email/email_viewer_message_actions:use_message_actions",
              caught,
            ),
          );
        }
        emit_mail_changed();
        show_toast(deps.t("common.reported_as_phishing"), "success");
        deps.on_dismiss();
      } else {
        show_toast(deps.t("common.failed_to_mark_as_spam"), "error");
      }
    },
    [deps.on_dismiss, deps.t],
  );

  const handle_per_message_not_spam = useCallback(
    async (msg: DecryptedThreadMessage) => {
      const result = await update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_spam: false },
      );

      if (result.success) {
        if (msg.sender_email) {
          remove_spam_sender(msg.sender_email).catch((caught) =>
            ignore_error(
              "components/email/email_viewer_message_actions:use_message_actions",
              caught,
            ),
          );
        }
        emit_mail_changed();
        show_toast(deps.t("common.marked_as_not_spam"), "success");
        deps.on_dismiss();
      } else {
        show_toast(deps.t("common.failed_to_update_emails"), "error");
      }
    },
    [deps.on_dismiss, deps.t],
  );

  const handle_toggle_message_read = useCallback(
    (message_id: string, next_read?: boolean) => {
      const msg = deps.thread_messages.find((m) => m.id === message_id);

      if (!msg) return;

      const new_read = next_read ?? !msg.is_read;
      const is_received = msg.item_type === "received";

      const other_unread_in_thread = deps.thread_messages.some(
        (m) => m.id !== message_id && !m.is_read && m.item_type === "received",
      );
      const main_is_unread_received =
        deps.mail_item?.item_type === "received" &&
        !deps.is_read &&
        deps.mail_item?.id !== message_id;
      const should_adjust =
        is_received &&
        !conversation_has_unread_sibling({
          thread_token: deps.mail_item?.thread_token,
          acted_id: message_id,
          sibling_unread: other_unread_in_thread || main_is_unread_received,
        });

      deps.set_thread_messages((prev) =>
        prev.map((m) =>
          m.id === message_id ? { ...m, is_read: new_read } : m,
        ),
      );

      if (should_adjust) {
        adjust_stats_unread(new_read ? -1 : 1);
      }

      if (!new_read) {
        deps.on_dismiss();
      }

      update_item_metadata(
        message_id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_read: new_read },
      ).then((result) => {
        if (!result.success) {
          deps.set_thread_messages((prev) =>
            prev.map((m) =>
              m.id === message_id ? { ...m, is_read: !new_read } : m,
            ),
          );
          if (should_adjust) {
            adjust_stats_unread(new_read ? 1 : -1);
          }
          show_toast(deps.t("common.failed_to_update_emails"), "error");
        } else {
          if (result.encrypted) {
            deps.set_thread_messages((prev) =>
              prev.map((m) =>
                m.id === message_id
                  ? {
                      ...m,
                      encrypted_metadata: result.encrypted!.encrypted_metadata,
                      metadata_nonce: result.encrypted!.metadata_nonce,
                    }
                  : m,
              ),
            );
          }
          emit_mail_item_updated({
            id: message_id,
            is_read: new_read,
            encrypted_metadata: result.encrypted?.encrypted_metadata,
            metadata_nonce: result.encrypted?.metadata_nonce,
          });
        }
      });
    },
    [
      deps.thread_messages,
      deps.on_dismiss,
      deps.mail_item,
      deps.is_read,
      deps.t,
    ],
  );

  return {
    handle_per_message_reply,
    handle_per_message_reply_all,
    handle_per_message_forward,
    handle_per_message_archive,
    handle_per_message_trash,
    handle_per_message_print,
    handle_per_message_view_source,
    handle_per_message_report_phishing,
    handle_per_message_not_spam,
    handle_toggle_message_read,
  };
}
