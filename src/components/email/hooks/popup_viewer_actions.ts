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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  DecryptedEmail,
  EmailPopupViewerProps,
} from "@/components/email/hooks/popup_viewer_types";

import { useCallback } from "react";

import { is_system_email, is_astermail_sender } from "@/lib/utils";
import { extract_reply_to } from "@/utils/reply_to";
import { build_reply_recipient } from "@/components/email/build_reply_recipient";
import { build_reply_from_address } from "@/components/email/build_reply_from_address";
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
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";
import { persist_unsubscribe } from "@/hooks/use_unsubscribed_senders";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { report_spam_sender, remove_spam_sender } from "@/services/api/mail";
import { set_forward_mail_id } from "@/services/forward_store";

export interface PopupActionsDeps {
  email_id: string | null;
  email: DecryptedEmail | null;
  mail_item: MailItem | null;
  is_read: boolean;
  is_pinned: boolean;
  is_archive_loading: boolean;
  is_spam_loading: boolean;
  is_trash_loading: boolean;
  is_pin_loading: boolean;
  thread_messages: DecryptedThreadMessage[];
  current_thread_token: string | null;
  set_is_read: (v: boolean) => void;
  set_is_pinned: (v: boolean) => void;
  set_is_archive_loading: (v: boolean) => void;
  set_is_spam_loading: (v: boolean) => void;
  set_is_trash_loading: (v: boolean) => void;
  set_is_pin_loading: (v: boolean) => void;
  set_mail_item: React.Dispatch<React.SetStateAction<MailItem | null>>;
  set_thread_messages: React.Dispatch<
    React.SetStateAction<DecryptedThreadMessage[]>
  >;
  on_close: () => void;
  on_reply?: EmailPopupViewerProps["on_reply"];
  on_forward?: EmailPopupViewerProps["on_forward"];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  preferences_default_reply_behavior: string;
}

export function use_popup_viewer_actions(deps: PopupActionsDeps) {
  const handle_read_toggle = useCallback(async () => {
    if (!deps.email_id || !deps.mail_item) return;

    const new_state = !deps.is_read;
    const is_received = deps.mail_item.item_type === "received";

    deps.set_is_read(new_state);

    const thread_has_other_unread =
      is_received &&
      deps.thread_messages.some(
        (m) =>
          m.id !== deps.email_id && !m.is_read && m.item_type === "received",
      );
    const should_adjust_unread = is_received && !thread_has_other_unread;

    if (should_adjust_unread) {
      adjust_unread_count(new_state ? -1 : 1);
    }

    const result = await update_item_metadata(
      deps.email_id,
      {
        encrypted_metadata: deps.mail_item.encrypted_metadata,
        metadata_nonce: deps.mail_item.metadata_nonce,
        metadata_version: deps.mail_item.metadata_version,
      },
      { is_read: new_state },
    );

    if (!result.success) {
      deps.set_is_read(!new_state);
      if (should_adjust_unread) {
        adjust_unread_count(new_state ? 1 : -1);
      }
    } else {
      deps.set_mail_item((prev) =>
        prev
          ? {
              ...prev,
              encrypted_metadata:
                result.encrypted?.encrypted_metadata ?? prev.encrypted_metadata,
              metadata_nonce:
                result.encrypted?.metadata_nonce ?? prev.metadata_nonce,
              metadata: prev.metadata
                ? { ...prev.metadata, is_read: new_state }
                : undefined,
            }
          : prev,
      );
      emit_mail_item_updated({
        id: deps.email_id,
        is_read: new_state,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
    }
  }, [deps.email_id, deps.is_read, deps.mail_item]);

  const handle_archive = useCallback(async () => {
    if (!deps.email_id || deps.is_archive_loading) return;

    deps.set_is_archive_loading(true);

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
      deps.on_close();
    }
  }, [deps.email_id, deps.is_archive_loading, deps.on_close, deps.t]);

  const handle_spam = useCallback(async () => {
    if (!deps.email_id || deps.is_spam_loading || !deps.mail_item) return;

    deps.set_is_spam_loading(true);

    const prev_is_trashed = deps.mail_item.is_trashed ?? false;
    const result = await update_item_metadata(
      deps.email_id,
      {
        encrypted_metadata: deps.mail_item.encrypted_metadata,
        metadata_nonce: deps.mail_item.metadata_nonce,
        metadata_version: deps.mail_item.metadata_version,
      },
      { is_spam: true, is_trashed: false },
    );

    deps.set_is_spam_loading(false);

    if (result.success) {
      const sender = deps.email?.sender_email;

      if (sender) {
        report_spam_sender(sender).catch(() => {});
      }
      emit_mail_items_removed({ ids: [deps.email_id] });
      show_action_toast({
        message: deps.t("common.conversation_marked_as_spam"),
        action_type: "spam",
        email_ids: [deps.email_id],
        on_undo: async () => {
          await update_item_metadata(
            deps.email_id!,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_spam: false, is_trashed: prev_is_trashed },
          );
          if (sender) {
            remove_spam_sender(sender).catch(() => {});
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
      deps.on_close();
    }
  }, [
    deps.email_id,
    deps.email?.sender_email,
    deps.is_spam_loading,
    deps.on_close,
    deps.mail_item,
    deps.t,
  ]);

  const handle_trash = useCallback(async () => {
    if (!deps.email_id || deps.is_trash_loading || !deps.mail_item) return;

    deps.set_is_trash_loading(true);

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
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));
        },
      });
      deps.on_close();
    }
  }, [
    deps.email_id,
    deps.is_trash_loading,
    deps.on_close,
    deps.mail_item,
    deps.t,
  ]);

  const handle_pin_toggle = useCallback(async () => {
    if (!deps.email_id || deps.is_pin_loading || !deps.mail_item) return;

    const previous_state = deps.is_pinned;
    const new_state = !deps.is_pinned;

    deps.set_is_pinned(new_state);
    deps.set_is_pin_loading(true);

    const result = await update_item_metadata(
      deps.email_id,
      {
        encrypted_metadata: deps.mail_item.encrypted_metadata,
        metadata_nonce: deps.mail_item.metadata_nonce,
        metadata_version: deps.mail_item.metadata_version,
      },
      { is_pinned: new_state },
    );

    deps.set_is_pin_loading(false);

    if (!result.success) {
      deps.set_is_pinned(previous_state);
    } else {
      deps.set_mail_item((prev) =>
        prev
          ? {
              ...prev,
              encrypted_metadata:
                result.encrypted?.encrypted_metadata ?? prev.encrypted_metadata,
              metadata_nonce:
                result.encrypted?.metadata_nonce ?? prev.metadata_nonce,
              metadata: prev.metadata
                ? { ...prev.metadata, is_pinned: new_state }
                : undefined,
            }
          : prev,
      );
      emit_mail_item_updated({
        id: deps.email_id,
        is_pinned: new_state,
        encrypted_metadata: result.encrypted?.encrypted_metadata,
        metadata_nonce: result.encrypted?.metadata_nonce,
      });
      show_action_toast({
        message: new_state
          ? deps.t("common.pinned_to_top")
          : deps.t("common.unpinned_toast"),
        action_type: "pin",
        email_ids: [deps.email_id],
      });
    }
  }, [
    deps.email_id,
    deps.is_pin_loading,
    deps.is_pinned,
    deps.mail_item,
    deps.t,
  ]);

  const handle_reply = useCallback(() => {
    if (!deps.email || !deps.on_reply) return;
    const is_reply_all =
      deps.preferences_default_reply_behavior === "reply_all";
    const is_own_message = deps.mail_item?.item_type === "sent";
    const { recipient_name, recipient_email } = build_reply_recipient(
      {
        sender_name: deps.email.sender,
        sender_email: deps.email.sender_email,
        first_to: deps.email.to?.[0],
        reply_to: deps.email.reply_to,
      },
      is_own_message,
    );

    const to_emails = deps.email.to?.map((r) => r.email) ?? [];
    const cc_emails = deps.email.cc?.map((r) => r.email) ?? [];
    const reply_from_address = build_reply_from_address(
      { sender_email: deps.email.sender_email },
      is_own_message,
    );

    const data: Parameters<NonNullable<typeof deps.on_reply>>[0] = {
      recipient_name,
      recipient_email,
      recipient_avatar: is_astermail_sender(
        deps.email.sender,
        deps.email.sender_email,
      )
        ? "/mail_logo.webp"
        : "",
      original_subject: deps.email.subject,
      original_body: deps.email.body,
      original_timestamp: deps.email.timestamp,
      thread_token: deps.current_thread_token || undefined,
      original_email_id: deps.email.id,
      is_external: !!deps.mail_item?.is_external,
      original_to: to_emails,
      reply_from_address,
    };

    if (is_reply_all) {
      data.reply_all = true;
      data.original_cc = cc_emails;
    }

    deps.on_reply(data);
  }, [
    deps.email,
    deps.on_reply,
    deps.current_thread_token,
    deps.preferences_default_reply_behavior,
    deps.mail_item,
  ]);

  const handle_forward = useCallback(() => {
    if (!deps.email || !deps.on_forward) return;
    set_forward_mail_id(deps.email.id);
    deps.on_forward({
      sender_name: deps.email.sender,
      sender_email: deps.email.sender_email,
      sender_avatar: is_astermail_sender(
        deps.email.sender,
        deps.email.sender_email,
      )
        ? "/mail_logo.webp"
        : "",
      email_subject: deps.email.subject,
      email_body: deps.email.body,
      email_timestamp: deps.email.timestamp,
      is_external: !!deps.mail_item?.is_external,
      original_mail_id: deps.email.id,
    });
  }, [deps.email, deps.on_forward, deps.mail_item]);

  const handle_print = useCallback(() => {
    if (!deps.email) return;

    print_email({
      subject: deps.email.subject,
      sender: deps.email.sender,
      sender_email: deps.email.sender_email,
      to: deps.email.to,
      cc: deps.email.cc,
      bcc: deps.email.bcc,
      timestamp: deps.email.timestamp,
      body: deps.email.html_content || deps.email.body,
    });
  }, [deps.email]);

  const handle_unsubscribe = useCallback(
    async (
      unsubscribe_info: {
        unsubscribe_link?: string;
        unsubscribe_mailto?: string;
        has_unsubscribe?: boolean;
        method?: string;
        list_unsubscribe_header?: string;
        list_unsubscribe_post?: string;
      } | null,
    ): Promise<void> => {
      if (!unsubscribe_info) return;

      try {
        const result = await execute_unsubscribe(unsubscribe_info as never);
        if (result === "api") {
          show_action_toast({
            message: deps.t("mail.successfully_unsubscribed"),
            action_type: "not_spam",
            email_ids: [],
          });
          if (deps.email) {
            persist_unsubscribe(deps.email.sender_email, deps.email.sender || "", {
              unsubscribe_link: unsubscribe_info.unsubscribe_link,
              list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
            }, "auto");
          }
        } else {
          const url = unsubscribe_info.unsubscribe_link || unsubscribe_info.unsubscribe_mailto;
          show_action_toast({
            message: deps.t("mail.unsubscribe_manual_required"),
            action_type: "not_spam",
            email_ids: [],
            duration_ms: 15000,
            action_label: deps.t("mail.open_unsubscribe_page"),
            on_undo: async () => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            },
          });
          if (deps.email) {
            persist_unsubscribe(deps.email.sender_email, deps.email.sender || "", {
              unsubscribe_link: unsubscribe_info.unsubscribe_link,
              list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
            }, "manual");
          }
        }
      } catch {
        show_action_toast({
          message: deps.t("mail.unsubscribe_failed"),
          action_type: "not_spam",
          email_ids: [],
        });
      }
    },
    [deps.t, deps.email],
  );

  const build_popup_reply_data = useCallback(
    (msg: DecryptedThreadMessage, is_reply_all: boolean) => {
      const is_own_message = msg.item_type === "sent";
      const parsed_reply_to = extract_reply_to(msg.raw_headers);
      const { recipient_name, recipient_email } = build_reply_recipient(
        {
          sender_name: msg.sender_name,
          sender_email: msg.sender_email,
          first_to: msg.to_recipients?.[0],
          reply_to: parsed_reply_to
            ? { name: parsed_reply_to.name ?? "", email: parsed_reply_to.email }
            : undefined,
        },
        is_own_message,
      );

      const to_emails = msg.to_recipients?.map((r) => r.email) ?? [];
      const cc_emails = msg.cc_recipients?.map((r) => r.email) ?? [];
      const reply_from_address = build_reply_from_address(
        { sender_email: msg.sender_email },
        is_own_message,
      );

      const data: Parameters<NonNullable<typeof deps.on_reply>>[0] = {
        recipient_name,
        recipient_email,
        recipient_avatar: "",
        original_subject: msg.subject,
        original_body: msg.body,
        original_timestamp: new Date(msg.timestamp).toLocaleString(),
        thread_token: deps.current_thread_token || undefined,
        original_email_id: msg.id,
        is_external: msg.is_external,
        original_to: to_emails,
        reply_from_address,
      };

      if (is_reply_all) {
        data.reply_all = true;
        data.original_cc = cc_emails;
      }

      return data;
    },
    [deps.current_thread_token],
  );

  const handle_per_message_reply = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (!deps.on_reply || is_system_email(msg.sender_email)) return;
      const is_reply_all =
        deps.preferences_default_reply_behavior === "reply_all";

      deps.on_reply(build_popup_reply_data(msg, is_reply_all));
    },
    [
      deps.on_reply,
      deps.preferences_default_reply_behavior,
      build_popup_reply_data,
    ],
  );

  const handle_per_message_reply_all = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (!deps.on_reply || is_system_email(msg.sender_email)) return;
      deps.on_reply(build_popup_reply_data(msg, true));
    },
    [deps.on_reply, build_popup_reply_data],
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
        email_timestamp: new Date(msg.timestamp).toLocaleString(),
        is_external: msg.is_external,
        original_mail_id: msg.id,
      });
    },
    [deps.on_forward],
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
        show_action_toast({
          message: deps.t("common.message_moved_to_trash"),
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
    },
    [deps.t],
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

  const handle_per_message_report_phishing = useCallback(
    async (msg: DecryptedThreadMessage) => {
      emit_mail_items_removed({ ids: [msg.id] });
      const result = await update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_spam: true, is_trashed: false },
      );

      if (result.success) {
        if (msg.sender_email) {
          report_spam_sender(msg.sender_email).catch(() => {});
        }
        show_toast(deps.t("common.reported_as_phishing"), "success");
        deps.on_close();
      }
    },
    [deps.on_close, deps.t],
  );

  const handle_per_message_not_spam = useCallback(
    async (msg: DecryptedThreadMessage) => {
      emit_mail_items_removed({ ids: [msg.id] });
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
        show_toast(deps.t("common.marked_as_not_spam"), "success");
        deps.on_close();
      }
    },
    [deps.on_close, deps.t],
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
        !deps.is_read &&
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
          emit_mail_item_updated({
            id: message_id,
            is_read: new_read,
            encrypted_metadata: result.encrypted!.encrypted_metadata,
            metadata_nonce: result.encrypted!.metadata_nonce,
          });
        }
      });
    },
    [deps.thread_messages],
  );

  return {
    handle_read_toggle,
    handle_archive,
    handle_spam,
    handle_trash,
    handle_pin_toggle,
    handle_reply,
    handle_forward,
    handle_print,
    handle_unsubscribe,
    handle_per_message_reply,
    handle_per_message_reply_all,
    handle_per_message_forward,
    handle_per_message_archive,
    handle_per_message_trash,
    handle_per_message_print,
    handle_per_message_report_phishing,
    handle_per_message_not_spam,
    handle_toggle_message_read,
  };
}
