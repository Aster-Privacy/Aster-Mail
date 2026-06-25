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
import type { DraftWithContent } from "@/services/api/multi_drafts";
import type {
  DecryptedEmail,
  ReplyData,
  ForwardData,
} from "@/components/email/email_viewer_types";

import { useCallback } from "react";

import { is_system_email } from "@/lib/utils";
import { extract_reply_to } from "@/utils/reply_to";
import { build_reply_recipient } from "@/components/email/build_reply_recipient";
import {
  build_reply_from_address,
  resolve_received_on_alias,
} from "@/components/email/build_reply_from_address";
import { get_cached_aliases } from "@/components/settings/hooks/use_aliases";
import {
  get_cached_alias_for_routing_token,
  get_cached_ghost_for_routing_token,
} from "@/hooks/use_sender_aliases";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { show_action_toast } from "@/components/toast/action_toast";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { show_toast } from "@/components/toast/simple_toast";
import {
  emit_mail_item_updated,
  emit_mail_items_removed,
} from "@/hooks/mail_events";
import { print_email } from "@/utils/print_email";
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";
import { persist_unsubscribe } from "@/hooks/use_unsubscribed_senders";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import {
  adjust_stats_spam,
  adjust_stats_unread,
} from "@/hooks/use_mail_stats";
import {
  compute_archive_deltas,
  compute_trash_deltas,
  apply_stat_deltas,
  revert_stat_deltas,
} from "@/hooks/use_stat_helpers";
import { report_spam_sender, remove_spam_sender } from "@/services/api/mail";
import { set_forward_mail_id } from "@/services/forward_store";
import { add_alias_pin } from "@/services/api/alias_pins";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";

export interface EmailViewerActionsDeps {
  email_id: string;
  email: DecryptedEmail | null;
  mail_item: MailItem | null;
  is_read: boolean;
  is_pinned: boolean;
  is_archive_loading: boolean;
  is_spam_loading: boolean;
  is_trash_loading: boolean;
  is_pin_loading: boolean;
  is_external: boolean;
  thread_messages: DecryptedThreadMessage[];
  current_user_email: string;
  thread_ghost_email: string | undefined;
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
  set_thread_draft: (v: DraftWithContent | null) => void;
  set_view_source_message: (v: DecryptedThreadMessage | null) => void;
  on_dismiss: () => void;
  on_reply?: (data: ReplyData) => void;
  on_forward?: (data: ForwardData) => void;
  on_edit_draft?: (draft: DraftWithContent) => void;
  is_sender_pinning_locked?: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  format_email_detail: (date: Date) => string;
  preferences_default_reply_behavior: string;
}

export function use_email_viewer_actions(deps: EmailViewerActionsDeps) {
  const copy_to_clipboard = useCallback(async (text: string, label: string) => {
    const clear_clipboard_after_timeout = () => {
      setTimeout(async () => {
        try {
          const current_text = await navigator.clipboard.readText();

          if (current_text === text) {
            await navigator.clipboard.writeText("");
          }
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
        }
      }, 60000);
    };

    try {
      await navigator.clipboard.writeText(text);
      show_toast(deps.t("common.item_copied", { label }), "success");
      clear_clipboard_after_timeout();
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      const textarea = document.createElement("textarea");

      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      show_toast(deps.t("common.item_copied", { label }), "success");
      clear_clipboard_after_timeout();
    }
  }, []);

  const handle_reply = useCallback(() => {
    if (
      !deps.email ||
      !deps.on_reply ||
      is_system_email(deps.email.sender_email)
    )
      return;
    const is_reply_all =
      deps.preferences_default_reply_behavior === "reply_all";
    const is_own_message =
      deps.mail_item?.item_type === "sent" ||
      (!!deps.current_user_email &&
        deps.email.sender_email.toLowerCase() ===
          deps.current_user_email.toLowerCase());
    const is_forwarded =
      !is_own_message && !!deps.email.display_sender_email;
    const { recipient_name, recipient_email } = build_reply_recipient(
      {
        sender_name: deps.email.sender,
        sender_email: deps.email.sender_email,
        first_to: deps.email.to?.[0],
        reply_to: deps.email.reply_to,
        reply_alias: is_forwarded
          ? { name: deps.email.sender, email: deps.email.sender_email }
          : undefined,
        own_addresses: deps.current_user_email
          ? [deps.current_user_email]
          : undefined,
      },
      is_own_message,
    );

    const to_emails = deps.email.to?.map((r) => r.email) ?? [];
    const cc_emails = deps.email.cc?.map((r) => r.email) ?? [];
    const reply_from_address = build_reply_from_address(
      {
        sender_email: deps.email.sender_email,
        received_on_alias:
          resolve_received_on_alias(
            deps.mail_item?.routing_token,
            get_cached_aliases(),
          ) ??
          get_cached_alias_for_routing_token(deps.mail_item?.routing_token) ??
          get_cached_ghost_for_routing_token(deps.mail_item?.routing_token),
      },
      is_own_message,
    );

    const rfc_message_id = deps.email.raw_headers?.find(
      (h) => h.name.toLowerCase() === "message-id",
    )?.value;

    const data: ReplyData = {
      recipient_name,
      recipient_email,
      recipient_avatar: "",
      ...(is_forwarded
        ? {
            quote_sender_name:
              deps.email.display_sender_name || deps.email.sender,
            quote_sender_email: deps.email.display_sender_email,
          }
        : {}),
      original_subject: deps.email.subject,
      original_body: deps.email.body,
      original_timestamp: deps.email.timestamp,
      thread_token: deps.email.thread_token,
      original_email_id: deps.email.id,
      is_external: deps.is_external,
      original_to: to_emails,
      reply_from_address,
      original_rfc_message_id: rfc_message_id,
    };

    if (is_reply_all) {
      data.reply_all = true;
      data.original_cc = cc_emails;
    }

    deps.on_reply(data);
  }, [
    deps.email,
    deps.on_reply,
    deps.preferences_default_reply_behavior,
    deps.is_external,
    deps.mail_item,
    deps.current_user_email,
  ]);

  const handle_forward = useCallback(() => {
    if (!deps.email || !deps.on_forward) return;
    set_forward_mail_id(deps.email.id);
    deps.on_forward({
      sender_name: deps.email.sender,
      sender_email: deps.email.sender_email,
      sender_avatar: "/mail_logo.webp",
      email_subject: deps.email.subject,
      email_body: deps.email.body,
      email_timestamp: deps.email.timestamp,
      original_mail_id: deps.email.id,
    });
  }, [deps.email, deps.on_forward]);

  const handle_edit_thread_draft = useCallback(
    (draft: DraftWithContent) => {
      if (deps.on_edit_draft) {
        deps.on_edit_draft(draft);
      }
    },
    [deps.on_edit_draft],
  );

  const handle_thread_draft_deleted = useCallback(() => {
    deps.set_thread_draft(null);
  }, []);

  const handle_read_toggle = useCallback(async () => {
    if (!deps.email_id || !deps.mail_item) return;
    const current_mail_item = deps.mail_item;
    const new_state = !deps.is_read;
    const is_received = current_mail_item.item_type === "received";

    deps.set_is_read(new_state);
    deps.set_mail_item((prev) =>
      prev
        ? {
            ...prev,
            metadata: prev.metadata
              ? { ...prev.metadata, is_read: new_state }
              : undefined,
          }
        : prev,
    );

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

    if (!new_state) {
      deps.on_dismiss();
    }

    const result = await update_item_metadata(
      deps.email_id,
      {
        encrypted_metadata: current_mail_item.encrypted_metadata,
        metadata_nonce: current_mail_item.metadata_nonce,
        metadata_version: current_mail_item.metadata_version,
      },
      { is_read: new_state },
    );

    if (!result.success) {
      deps.set_is_read(!new_state);
      deps.set_mail_item((prev) =>
        prev
          ? {
              ...prev,
              metadata: prev.metadata
                ? { ...prev.metadata, is_read: !new_state }
                : undefined,
            }
          : prev,
      );
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
  }, [deps.email_id, deps.is_read, deps.mail_item, deps.on_dismiss]);

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

  const handle_archive = useCallback(async () => {
    if (!deps.email_id || deps.is_archive_loading) return;
    deps.set_is_archive_loading(true);

    const deltas = deps.mail_item
      ? compute_archive_deltas({
          item_type: deps.mail_item.item_type,
          is_read: deps.is_read,
        })
      : null;
    if (deltas) apply_stat_deltas(deltas);

    const result = await batch_archive({ ids: [deps.email_id], tier: "hot" });

    deps.set_is_archive_loading(false);
    if (result.data?.success) {
      emit_mail_items_removed({ ids: [deps.email_id] });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: deps.t("common.conversation_archived"),
        action_type: "archive",
        email_ids: [deps.email_id],
        on_undo: async () => {
          if (deltas) revert_stat_deltas(deltas);
          await batch_unarchive({ ids: [deps.email_id] });
          window.dispatchEvent(new CustomEvent("astermail:mail-soft-refresh"));
        },
      });
      deps.on_dismiss();
    } else if (deltas) {
      revert_stat_deltas(deltas);
    }
  }, [deps.email_id, deps.is_archive_loading, deps.on_dismiss, deps.t, deps.mail_item, deps.is_read]);

  const handle_spam = useCallback(async () => {
    if (!deps.email_id || deps.is_spam_loading || !deps.mail_item) return;
    deps.set_is_spam_loading(true);
    const prev_is_trashed = deps.mail_item.is_trashed ?? false;
    const is_received = deps.mail_item.item_type === "received";
    const is_unread = !deps.is_read;

    if (is_received) {
      adjust_stats_spam(1);
      if (is_unread) adjust_stats_unread(-1);
    }

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
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: deps.t("common.conversation_marked_as_spam_toast"),
        action_type: "spam",
        email_ids: [deps.email_id],
        on_undo: async () => {
          if (is_received) {
            adjust_stats_spam(-1);
            if (is_unread) adjust_stats_unread(1);
          }
          await update_item_metadata(
            deps.email_id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_spam: false, is_trashed: prev_is_trashed },
          );
          if (sender) {
            remove_spam_sender(sender).catch(() => {});
          }
          window.dispatchEvent(new CustomEvent("astermail:mail-soft-refresh"));
        },
      });
      deps.on_dismiss();
    } else {
      if (is_received) {
        adjust_stats_spam(-1);
        if (is_unread) adjust_stats_unread(1);
      }
    }
  }, [
    deps.email_id,
    deps.email?.sender_email,
    deps.is_spam_loading,
    deps.on_dismiss,
    deps.mail_item,
    deps.is_read,
    deps.t,
  ]);

  const handle_not_spam = useCallback(async () => {
    if (!deps.email_id || deps.is_spam_loading || !deps.mail_item) return;
    deps.set_is_spam_loading(true);
    const result = await update_item_metadata(
      deps.email_id,
      {
        encrypted_metadata: deps.mail_item.encrypted_metadata,
        metadata_nonce: deps.mail_item.metadata_nonce,
        metadata_version: deps.mail_item.metadata_version,
      },
      { is_spam: false },
    );

    deps.set_is_spam_loading(false);
    if (result.success) {
      const sender = deps.email?.sender_email;

      if (sender) {
        remove_spam_sender(sender).catch(() => {});
      }
      emit_mail_items_removed({ ids: [deps.email_id] });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_toast(deps.t("common.marked_as_not_spam"), "success");
      deps.on_dismiss();
    }
  }, [
    deps.email_id,
    deps.email?.sender_email,
    deps.is_spam_loading,
    deps.on_dismiss,
    deps.mail_item,
    deps.t,
  ]);

  const handle_trash = useCallback(async () => {
    if (!deps.email_id || deps.is_trash_loading || !deps.mail_item) return;
    deps.set_is_trash_loading(true);

    const deltas = compute_trash_deltas({
      item_type: deps.mail_item.item_type,
      is_read: deps.is_read,
    });
    apply_stat_deltas(deltas);

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
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: deps.t("common.conversation_moved_to_trash_toast"),
        action_type: "trash",
        email_ids: [deps.email_id],
        on_undo: async () => {
          revert_stat_deltas(deltas);
          await update_item_metadata(
            deps.email_id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_trashed: false },
          );
          window.dispatchEvent(new CustomEvent("astermail:mail-soft-refresh"));
        },
      });
      deps.on_dismiss();
    } else {
      revert_stat_deltas(deltas);
    }
  }, [
    deps.email_id,
    deps.is_trash_loading,
    deps.on_dismiss,
    deps.mail_item,
    deps.is_read,
    deps.t,
  ]);

  const handle_print = useCallback(() => {
    if (!deps.email) return;
    print_email({
      subject: deps.email.subject,
      sender: deps.email.display_sender_name || deps.email.sender,
      sender_email: deps.email.display_sender_email || deps.email.sender_email,
      to: deps.email.to,
      cc: deps.email.cc,
      bcc: deps.email.bcc,
      timestamp: deps.format_email_detail(new Date(deps.email.timestamp)),
      body: deps.email.html_content || deps.email.body,
    });
  }, [deps.email, deps.format_email_detail]);

  const handle_unsubscribe = useCallback(async () => {
    if (!deps.email?.unsubscribe_info) return;
    const info = deps.email.unsubscribe_info;

    try {
      const result = await execute_unsubscribe(info);
      if (result === "api") {
        show_action_toast({
          message: deps.t("mail.successfully_unsubscribed"),
          action_type: "not_spam",
          email_ids: [],
        });
        persist_unsubscribe(deps.email.sender_email, deps.email.sender || "", {
          unsubscribe_link: info.unsubscribe_link,
          list_unsubscribe_header: info.list_unsubscribe_header,
        }, "auto");
      } else {
        const url = info.unsubscribe_link || info.unsubscribe_mailto;
        const lockdown = is_any_lockdown_active();
        show_action_toast({
          message: deps.t("mail.unsubscribe_manual_required"),
          action_type: "not_spam",
          email_ids: [],
          duration_ms: 15000,
          ...(!lockdown && {
            action_label: deps.t("mail.open_unsubscribe_page"),
            on_undo: async () => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            },
          }),
        });
        persist_unsubscribe(deps.email.sender_email, deps.email.sender || "", {
          unsubscribe_link: info.unsubscribe_link,
          list_unsubscribe_header: info.list_unsubscribe_header,
        }, "manual");
      }
    } catch {
      show_action_toast({
        message: deps.t("mail.unsubscribe_failed"),
        action_type: "not_spam",
        email_ids: [],
      });
    }
  }, [deps.email, deps.t]);

  const build_reply_data = useCallback(
    (msg: DecryptedThreadMessage, is_reply_all: boolean): ReplyData => {
      const is_own_message = msg.item_type === "sent";
      const is_forwarded = !is_own_message && !!msg.display_sender_email;
      const parsed_reply_to = extract_reply_to(msg.raw_headers);
      const { recipient_name, recipient_email } = build_reply_recipient(
        {
          sender_name: msg.sender_name,
          sender_email: msg.sender_email,
          first_to: msg.to_recipients?.[0],
          reply_to: parsed_reply_to
            ? { name: parsed_reply_to.name ?? "", email: parsed_reply_to.email }
            : undefined,
          reply_alias: is_forwarded
            ? { name: msg.sender_name, email: msg.sender_email }
            : undefined,
          own_addresses: deps.current_user_email
            ? [deps.current_user_email]
            : undefined,
        },
        is_own_message,
      );

      const to_emails = msg.to_recipients?.map((r) => r.email) ?? [];
      const cc_emails = msg.cc_recipients?.map((r) => r.email) ?? [];
      const reply_from_address = build_reply_from_address(
        {
          sender_email: msg.sender_email,
          received_on_alias:
            resolve_received_on_alias(
              deps.mail_item?.routing_token,
              get_cached_aliases(),
            ) ??
            get_cached_alias_for_routing_token(deps.mail_item?.routing_token),
        },
        is_own_message,
      );

      const msg_rfc_message_id = msg.raw_headers?.find(
        (h) => h.name.toLowerCase() === "message-id",
      )?.value;

      const base: ReplyData = {
        recipient_name,
        recipient_email,
        recipient_avatar: "",
        ...(is_forwarded
          ? {
              quote_sender_name: msg.display_sender_name || msg.sender_name,
              quote_sender_email: msg.display_sender_email,
            }
          : {}),
        original_subject: msg.subject,
        original_body: msg.body,
        original_timestamp: new Date(msg.timestamp).toLocaleString(),
        thread_token: deps.email?.thread_token,
        original_email_id: msg.id,
        is_external: msg.is_external || deps.is_external,
        thread_ghost_email: deps.thread_ghost_email,
        original_to: to_emails,
        reply_from_address,
        original_rfc_message_id: msg_rfc_message_id,
      };

      if (is_reply_all) {
        base.reply_all = true;
        base.original_cc = cc_emails;
      }

      return base;
    },
    [deps.email?.thread_token, deps.is_external, deps.thread_ghost_email],
  );

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
        email_timestamp: new Date(msg.timestamp).toLocaleString(),
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
        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        show_action_toast({
          message: deps.t("common.message_archived"),
          action_type: "archive",
          email_ids: [msg.id],
          on_undo: async () => {
            await batch_unarchive({ ids: [msg.id] });
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
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
        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
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
              new CustomEvent("astermail:mail-soft-refresh"),
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
        sender: msg.display_sender_name || msg.sender_name,
        sender_email: msg.display_sender_email || msg.sender_email,
        to: [],
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
        { is_spam: true, is_trashed: false },
      );

      if (result.success) {
        emit_mail_items_removed({ ids: [msg.id] });
        if (msg.sender_email) {
          report_spam_sender(msg.sender_email).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        show_toast(deps.t("common.reported_as_phishing"), "success");
        deps.on_dismiss();
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
          remove_spam_sender(msg.sender_email).catch(() => {});
        }
        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        show_toast(deps.t("common.marked_as_not_spam"), "success");
        deps.on_dismiss();
      }
    },
    [deps.on_dismiss, deps.t],
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
    [deps.thread_messages, deps.on_dismiss, deps.mail_item, deps.is_read],
  );

  const is_own_message =
    deps.mail_item?.item_type === "sent" ||
    (!!deps.current_user_email &&
      !!deps.email?.sender_email &&
      deps.email.sender_email.toLowerCase() ===
        deps.current_user_email.toLowerCase());

  const handle_block_sender_on_alias = useCallback(async () => {
    const routing_token = deps.mail_item?.routing_token;
    const sender = deps.email?.sender_email;

    if (!routing_token || !sender || is_own_message) return;

    if (deps.is_sender_pinning_locked) {
      prompt_upgrade(deps.t("settings.feature_requires_upgrade"));
      return;
    }

    const aliases = get_cached_aliases();
    const matched = aliases.find((a) => a.alias_address_hash === routing_token);

    if (!matched) return;

    const response = await add_alias_pin(matched.id, sender, true);

    if (response.error) {
      show_toast(deps.t("mail.block_sender_on_alias_failed"), "error");
    } else {
      show_toast(
        deps.t("mail.block_sender_on_alias_success", {
          sender,
          alias: matched.full_address,
        }),
        "success",
      );
    }
  }, [
    deps.mail_item?.routing_token,
    deps.email?.sender_email,
    deps.is_sender_pinning_locked,
    deps.t,
    is_own_message,
  ]);

  return {
    copy_to_clipboard,
    handle_reply,
    handle_forward,
    handle_edit_thread_draft,
    handle_thread_draft_deleted,
    handle_read_toggle,
    handle_pin_toggle,
    handle_archive,
    handle_spam,
    handle_not_spam,
    handle_trash,
    handle_print,
    handle_unsubscribe,
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
    handle_block_sender_on_alias,
    show_block_sender_on_alias:
      !!deps.mail_item?.routing_token && !is_own_message,
  };
}
