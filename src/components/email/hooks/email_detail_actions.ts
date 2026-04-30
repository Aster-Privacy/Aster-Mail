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
import type { MailItem } from "@/services/api/mail";
import type {
  ReplyModalData,
  DecryptedEmail,
} from "@/components/email/hooks/email_detail_types";
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback } from "react";

import { get_email_username, is_system_email } from "@/lib/utils";
import {
  permanent_delete_mail_item,
  report_spam_sender,
  remove_spam_sender,
} from "@/services/api/mail";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import { print_email } from "@/utils/print_email";
import {
  adjust_unread_count,
  adjust_trash_count,
} from "@/hooks/use_mail_counts";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { remove_email_from_view_cache } from "@/hooks/email_list_cache";
import { set_forward_mail_id } from "@/services/forward_store";

export interface EmailDetailActionsDeps {
  email_id: string | undefined;
  mail_item: MailItem | null;
  email: DecryptedEmail | null;
  thread_messages: DecryptedThreadMessage[];
  thread_ghost_email: string | undefined;
  is_archive_loading: boolean;
  is_trash_loading: boolean;
  set_is_archive_loading: (v: boolean) => void;
  set_is_archive_confirm_open: (v: boolean) => void;
  set_is_trash_loading: (v: boolean) => void;
  set_is_trash_confirm_open: (v: boolean) => void;
  set_thread_messages: React.Dispatch<
    React.SetStateAction<DecryptedThreadMessage[]>
  >;
  set_reply_modal_data: (v: ReplyModalData | null) => void;
  set_is_reply_modal_open: (v: boolean) => void;
  set_is_forward_modal_open: (v: boolean) => void;
  set_forward_target: (v: DecryptedThreadMessage | null) => void;
  set_view_source_message: (v: DecryptedThreadMessage | null) => void;
  get_next_email_destination: () => string;
  navigate: (path: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  preferences_default_reply_behavior: string;
}

export function use_email_detail_actions(deps: EmailDetailActionsDeps) {
  const build_reply_modal_data = useCallback(
    (msg: DecryptedThreadMessage, is_reply_all: boolean): ReplyModalData => {
      const is_own_message = msg.item_type === "sent";
      const first_to = msg.to_recipients?.[0];
      const reply_name =
        is_own_message && first_to
          ? first_to.name ||
            get_email_username(first_to.email) ||
            first_to.email
          : msg.sender_name;
      const reply_email =
        is_own_message && first_to ? first_to.email : msg.sender_email;

      const reply_from =
        msg.to_recipients?.map((r) => r.email).find(Boolean) ?? undefined;

      const data: ReplyModalData = {
        recipient_name: reply_name,
        recipient_email: reply_email,
        original_subject: msg.subject,
        original_body: msg.body,
        original_timestamp: new Date(msg.timestamp).toLocaleString(),
        thread_token: deps.mail_item?.thread_token,
        original_email_id: msg.id,
        is_external: msg.is_external,
        thread_ghost_email: deps.thread_ghost_email,
        reply_from_address: reply_from,
      };

      if (is_reply_all) {
        data.reply_all = true;
        data.original_to = msg.to_recipients?.map((r) => r.email) ?? [];
        data.original_cc =
          msg.cc_recipients
            ?.map((r) => r.email)
            .filter((e): e is string => !!e) ?? [];
      }

      return data;
    },
    [deps.mail_item?.thread_token, deps.thread_ghost_email],
  );

  const handle_archive = useCallback(async () => {
    if (!deps.email_id || deps.is_archive_loading) return;

    deps.set_is_archive_loading(true);
    deps.set_is_archive_confirm_open(false);

    const result = await batch_archive({ ids: [deps.email_id], tier: "hot" });

    deps.set_is_archive_loading(false);

    if (result.data?.success) {
      emit_mail_items_removed({ ids: [deps.email_id] });
      show_action_toast({
        message: deps.t("common.conversation_archived"),
        action_type: "archive",
        email_ids: [deps.email_id],
        on_undo: async () => {
          await batch_unarchive({ ids: [deps.email_id!] });
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
      deps.navigate(deps.get_next_email_destination());
    }
  }, [
    deps.email_id,
    deps.is_archive_loading,
    deps.get_next_email_destination,
    deps.navigate,
  ]);

  const handle_trash = useCallback(async () => {
    if (!deps.email_id || deps.is_trash_loading || !deps.mail_item) return;

    deps.set_is_trash_loading(true);
    deps.set_is_trash_confirm_open(false);

    if (deps.mail_item.is_trashed) {
      const result = await permanent_delete_mail_item(deps.email_id);

      deps.set_is_trash_loading(false);

      if (!result.error) {
        adjust_trash_count(-1);
        invalidate_mail_stats();
        remove_email_from_view_cache(deps.email_id);
        emit_mail_items_removed({ ids: [deps.email_id] });
        show_action_toast({
          message: deps.t("common.email_permanently_deleted"),
          action_type: "trash",
          email_ids: [deps.email_id],
        });
        deps.navigate(deps.get_next_email_destination());
      }
    } else {
      const result = await update_item_metadata(
        deps.email_id,
        {
          encrypted_metadata: deps.mail_item.encrypted_metadata,
          metadata_nonce: deps.mail_item.metadata_nonce,
          metadata_version: deps.mail_item.metadata_version,
        },
        { is_trashed: true },
      );

      deps.set_is_trash_loading(false);

      if (result.success) {
        remove_email_from_view_cache(deps.email_id);
        emit_mail_items_removed({ ids: [deps.email_id] });
        show_action_toast({
          message: deps.t("common.conversation_moved_to_trash"),
          action_type: "trash",
          email_ids: [deps.email_id],
          on_undo: async () => {
            await update_item_metadata(
              deps.email_id!,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
              },
              { is_trashed: false },
            );
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
        deps.navigate(deps.get_next_email_destination());
      }
    }
  }, [
    deps.email_id,
    deps.is_trash_loading,
    deps.get_next_email_destination,
    deps.navigate,
    deps.mail_item,
    deps.t,
  ]);

  const handle_per_message_reply = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (is_system_email(msg.sender_email)) return;
      const is_reply_all =
        deps.preferences_default_reply_behavior === "reply_all";

      deps.set_reply_modal_data(build_reply_modal_data(msg, is_reply_all));
      deps.set_is_reply_modal_open(true);
    },
    [deps.preferences_default_reply_behavior, build_reply_modal_data],
  );

  const handle_per_message_reply_all = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (is_system_email(msg.sender_email)) return;
      deps.set_reply_modal_data(build_reply_modal_data(msg, true));
      deps.set_is_reply_modal_open(true);
    },
    [build_reply_modal_data],
  );

  const handle_per_message_forward = useCallback(
    (msg: DecryptedThreadMessage) => {
      set_forward_mail_id(msg.id);
      deps.set_forward_target(msg);
      deps.set_is_forward_modal_open(true);
    },
    [],
  );

  const handle_per_message_archive = useCallback(
    async (msg: DecryptedThreadMessage) => {
      const result = await batch_archive({ ids: [msg.id], tier: "hot" });

      if (result.data?.success) {
        emit_mail_items_removed({ ids: [msg.id] });
        show_action_toast({
          message: deps.t("common.message_archived"),
          action_type: "archive",
          email_ids: [msg.id],
          on_undo: async () => {
            await batch_unarchive({ ids: [msg.id] });
            window.dispatchEvent(
              new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
            );
          },
        });
      }
    },
    [],
  );

  const handle_per_message_trash = useCallback(
    async (msg: DecryptedThreadMessage) => {
      if (deps.mail_item?.is_trashed) {
        const result = await permanent_delete_mail_item(msg.id);

        if (!result.error) {
          remove_email_from_view_cache(msg.id);
          emit_mail_items_removed({ ids: [msg.id] });
          show_action_toast({
            message: deps.t("common.email_permanently_deleted"),
            action_type: "trash",
            email_ids: [msg.id],
          });
        }
      } else {
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
          show_action_toast({
            message: deps.t("common.conversation_moved_to_trash"),
            action_type: "trash",
            email_ids: [msg.id],
            on_undo: async () => {
              await update_item_metadata(
                msg.id,
                {
                  encrypted_metadata: result.encrypted?.encrypted_metadata,
                  metadata_nonce: result.encrypted?.metadata_nonce,
                },
                { is_trashed: false },
              );
              window.dispatchEvent(
                new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH),
              );
            },
          });
        }
      }
    },
    [deps.mail_item?.is_trashed, deps.t],
  );

  const handle_per_message_print = useCallback(
    (msg: DecryptedThreadMessage) => {
      print_email({
        subject: msg.subject,
        sender: msg.sender_name,
        sender_email: msg.sender_email,
        to: msg.to_recipients || [],
        timestamp: new Date(msg.timestamp).toLocaleString(),
        body: msg.html_content || msg.body,
      });
    },
    [],
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
        { is_spam: true },
      );

      if (result.success) {
        if (msg.sender_email) {
          report_spam_sender(msg.sender_email).catch(() => {});
        }
        emit_mail_items_removed({ ids: [msg.id] });
        show_toast(deps.t("common.reported_as_phishing"), "success");
        deps.navigate(deps.get_next_email_destination());
      }
    },
    [deps.navigate, deps.get_next_email_destination, deps.t],
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
          remove_spam_sender(msg.sender_email).catch(() => {});
        }
        emit_mail_items_removed({ ids: [msg.id] });
        show_toast(deps.t("common.marked_as_not_spam"), "success");
        deps.navigate(deps.get_next_email_destination());
      }
    },
    [deps.navigate, deps.get_next_email_destination, deps.t],
  );

  const handle_toggle_message_read = useCallback(
    (message_id: string) => {
      const msg = deps.thread_messages.find((m) => m.id === message_id);

      if (!msg) return;

      const new_read = !msg.is_read;
      const is_received = msg.item_type === "received";

      const other_unread_in_thread =
        is_received &&
        deps.thread_messages.some(
          (m) =>
            m.id !== message_id && !m.is_read && m.item_type === "received",
        );
      const main_is_unread_received =
        is_received &&
        deps.mail_item?.item_type === "received" &&
        deps.mail_item?.metadata?.is_read === false &&
        deps.mail_item?.id !== message_id;
      const should_adjust =
        is_received && !other_unread_in_thread && !main_is_unread_received;

      deps.set_thread_messages((prev) =>
        prev.map((m) =>
          m.id === message_id ? { ...m, is_read: new_read } : m,
        ),
      );

      if (should_adjust) {
        adjust_unread_count(new_read ? -1 : 1);
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
            adjust_unread_count(new_read ? 1 : -1);
          }
        } else if (result.encrypted) {
          emit_mail_item_updated({
            id: message_id,
            is_read: new_read,
            encrypted_metadata: result.encrypted.encrypted_metadata,
            metadata_nonce: result.encrypted.metadata_nonce,
          });
        }
      });
    },
    [deps.thread_messages],
  );

  const handle_copy_text = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        show_toast(deps.t("common.copied_item", { label }), "success");
      })
      .catch(() => {});
  };

  return {
    build_reply_modal_data,
    handle_archive,
    handle_trash,
    handle_copy_text,
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
