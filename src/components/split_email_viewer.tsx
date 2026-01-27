import type { UnsubscribeInfo } from "@/types/email";
import type { DecryptedThreadMessage } from "@/types/thread";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { InlineReplySection } from "@/components/inline_reply_section";
import {
  XMarkIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArchiveBoxIcon,
  TrashIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  EllipsisHorizontalIcon,
  PrinterIcon,
  FolderIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

import { show_toast } from "@/components/simple_toast";
import { show_action_toast } from "@/components/action_toast";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LockIcon } from "@/components/icons";
import { KeyboardShortcutBadge } from "@/components/keyboard_shortcut_badge";
import { EncryptionInfoModal } from "@/components/encryption_info_modal";
import { get_mail_item, type MailItem } from "@/services/api/mail";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { print_email } from "@/utils/print_email";
import {
  emit_mail_item_updated,
  MAIL_EVENTS,
  type ThreadReplySentEventDetail,
} from "@/hooks/mail_events";
import { get_passphrase_bytes } from "@/services/crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { try_decrypt_ratchet_body } from "@/utils/email_crypto";
import { is_astermail_sender, get_email_username } from "@/lib/utils";
import { use_date_format } from "@/hooks/use_date_format";
import { use_preferences } from "@/contexts/preferences_context";
import { EmailProfileTrigger } from "@/components/email_profile_trigger";
import { ThreadMessagesList } from "@/components/thread_message_block";
import { fetch_and_decrypt_thread_messages } from "@/services/thread_service";

export interface SplitReplyData {
  recipient_name: string;
  recipient_email: string;
  recipient_avatar: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  thread_token?: string;
  original_email_id?: string;
}

export interface SplitForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
}

interface SplitEmailViewerProps {
  email_id: string;
  on_close: () => void;
  snoozed_until?: string;
  on_forward?: (data: SplitForwardData) => void;
}

interface LocalDecryptedEnvelope {
  subject: string;
  body_text: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
}

interface EmailRecipient {
  name: string;
  email: string;
}

interface DecryptedEmail {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  preview: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  body: string;
  unsubscribe_info?: UnsubscribeInfo;
  thread_token?: string;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
}

async function decrypt_mail_envelope(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<LocalDecryptedEnvelope | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as LocalDecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<LocalDecryptedEnvelope>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      return result;
    }

    const result = await decrypt_envelope_with_bytes<LocalDecryptedEnvelope>(
      encrypted_envelope,
      passphrase_bytes,
    );

    zero_uint8_array(passphrase_bytes);

    return result;
  } catch {
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}

function format_snooze_time(snooze_date: Date): string {
  const now = new Date();
  const diff_ms = snooze_date.getTime() - now.getTime();

  if (diff_ms <= 0) {
    return "Snooze expired";
  }

  const diff_minutes = Math.floor(diff_ms / (1000 * 60));
  const diff_hours = Math.floor(diff_ms / (1000 * 60 * 60));
  const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24));

  if (diff_minutes < 60) {
    return `${diff_minutes} minute${diff_minutes !== 1 ? "s" : ""} remaining`;
  } else if (diff_hours < 24) {
    return `${diff_hours} hour${diff_hours !== 1 ? "s" : ""} remaining`;
  } else if (diff_days < 7) {
    return `${diff_days} day${diff_days !== 1 ? "s" : ""} remaining`;
  } else {
    const weeks = Math.floor(diff_days / 7);

    return `${weeks} week${weeks !== 1 ? "s" : ""} remaining`;
  }
}

function format_snooze_target(snooze_date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);

  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const snooze_day = new Date(snooze_date);

  snooze_day.setHours(0, 0, 0, 0);

  const today = new Date(now);

  today.setHours(0, 0, 0, 0);

  const time_str = snooze_date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (snooze_day.getTime() === today.getTime()) {
    return `Today at ${time_str}`;
  } else if (snooze_day.getTime() === tomorrow.getTime()) {
    return `Tomorrow at ${time_str}`;
  } else {
    const date_str = snooze_date.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    return `${date_str} at ${time_str}`;
  }
}

export function SplitEmailViewer({
  email_id,
  on_close,
  snoozed_until,
  on_forward,
}: SplitEmailViewerProps): React.ReactElement {
  const { format_email_detail } = use_date_format();
  const { preferences } = use_preferences();
  const [email, set_email] = useState<DecryptedEmail | null>(null);
  const [mail_item, set_mail_item] = useState<MailItem | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [is_read, set_is_read] = useState(false);
  const [is_pinned, set_is_pinned] = useState(false);
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_spam_loading, set_is_spam_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_pin_loading, set_is_pin_loading] = useState(false);
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const [current_user_email, set_current_user_email] = useState<string>("");
  const [show_details, set_show_details] = useState(false);
  const [is_external, set_is_external] = useState(false);
  const [has_pq_protection, set_has_pq_protection] = useState(false);
  const [show_encryption_info, set_show_encryption_info] = useState(false);
  const [show_inline_reply, set_show_inline_reply] = useState(false);
  const mark_as_read_timeout = useRef<number | null>(null);
  const inline_reply_ref = useRef<HTMLDivElement>(null);

  const copy_to_clipboard = useCallback(async (text: string, label: string) => {
    const clear_clipboard_after_timeout = () => {
      setTimeout(async () => {
        try {
          const current_text = await navigator.clipboard.readText();

          if (current_text === text) {
            await navigator.clipboard.writeText("");
          }
        } catch {
          void 0;
        }
      }, 60000);
    };

    try {
      await navigator.clipboard.writeText(text);
      show_toast(`${label} copied`, "success");
      clear_clipboard_after_timeout();
    } catch {
      const textarea = document.createElement("textarea");

      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      show_toast(`${label} copied`, "success");
      clear_clipboard_after_timeout();
    }
  }, []);

  const handle_reply = useCallback(() => {
    if (!email) return;
    set_show_inline_reply(true);
    setTimeout(() => {
      inline_reply_ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 150);
  }, [email]);

  const handle_inline_reply_sent = useCallback(
    (new_message: DecryptedThreadMessage) => {
      set_thread_messages((prev) => [...prev, new_message]);
      set_show_inline_reply(false);
    },
    [],
  );

  const handle_forward = useCallback(() => {
    if (!email || !on_forward) return;
    on_forward({
      sender_name: email.sender,
      sender_email: email.sender_email,
      sender_avatar: "/mail_logo.png",
      email_subject: email.subject,
      email_body: email.body,
      email_timestamp: email.timestamp,
    });
  }, [email, on_forward]);

  const handle_read_toggle = useCallback(async () => {
    if (!email_id || !mail_item) return;
    const current_mail_item = mail_item;
    const new_state = !is_read;

    set_is_read(new_state);
    set_mail_item((prev) => (prev ? { ...prev, is_read: new_state } : prev));

    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: current_mail_item.encrypted_metadata,
        metadata_nonce: current_mail_item.metadata_nonce,
        is_read: current_mail_item.is_read,
        is_starred: current_mail_item.is_starred,
        is_pinned: current_mail_item.is_pinned,
        is_trashed: current_mail_item.is_trashed,
        is_archived: current_mail_item.is_archived,
        is_spam: current_mail_item.is_spam,
      },
      { is_read: new_state },
    );

    if (!result.success) {
      set_is_read(!new_state);
      set_mail_item((prev) => (prev ? { ...prev, is_read: !new_state } : prev));
    } else {
      emit_mail_item_updated({ id: email_id, is_read: new_state });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
    }
  }, [email_id, is_read, mail_item]);

  const handle_pin_toggle = useCallback(async () => {
    if (!email_id || is_pin_loading || !mail_item) return;
    const previous_state = is_pinned;
    const new_state = !is_pinned;

    set_is_pinned(new_state);
    set_is_pin_loading(true);
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
        is_read: mail_item.is_read,
        is_starred: mail_item.is_starred,
        is_pinned: mail_item.is_pinned,
        is_trashed: mail_item.is_trashed,
        is_archived: mail_item.is_archived,
        is_spam: mail_item.is_spam,
      },
      { is_pinned: new_state },
    );

    set_is_pin_loading(false);
    if (!result.success) {
      set_is_pinned(previous_state);
    } else {
      set_mail_item((prev) =>
        prev ? { ...prev, is_pinned: new_state } : prev,
      );
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: new_state ? "Pinned to top" : "Unpinned",
        action_type: "pin",
        email_ids: [email_id],
      });
    }
  }, [email_id, is_pin_loading, is_pinned, mail_item]);

  const handle_archive = useCallback(async () => {
    if (!email_id || is_archive_loading) return;
    set_is_archive_loading(true);
    const result = await batch_archive({ ids: [email_id], tier: "hot" });

    set_is_archive_loading(false);
    if (result.data?.success) {
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: "Conversation archived",
        action_type: "archive",
        email_ids: [email_id],
        on_undo: async () => {
          await batch_unarchive({ ids: [email_id] });
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      on_close();
    }
  }, [email_id, is_archive_loading, on_close]);

  const handle_spam = useCallback(async () => {
    if (!email_id || is_spam_loading || !mail_item) return;
    set_is_spam_loading(true);
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
        is_read: mail_item.is_read,
        is_starred: mail_item.is_starred,
        is_pinned: mail_item.is_pinned,
        is_trashed: mail_item.is_trashed,
        is_archived: mail_item.is_archived,
        is_spam: mail_item.is_spam,
      },
      { is_spam: true },
    );

    set_is_spam_loading(false);
    if (result.success) {
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: "Marked as spam",
        action_type: "spam",
        email_ids: [email_id],
        on_undo: async () => {
          await update_item_metadata(
            email_id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
              is_read: mail_item.is_read,
              is_starred: mail_item.is_starred,
              is_pinned: mail_item.is_pinned,
              is_trashed: mail_item.is_trashed,
              is_archived: mail_item.is_archived,
              is_spam: true,
            },
            { is_spam: false },
          );
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      on_close();
    }
  }, [email_id, is_spam_loading, on_close, mail_item]);

  const handle_trash = useCallback(async () => {
    if (!email_id || is_trash_loading || !mail_item) return;
    set_is_trash_loading(true);
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
        is_read: mail_item.is_read,
        is_starred: mail_item.is_starred,
        is_pinned: mail_item.is_pinned,
        is_trashed: mail_item.is_trashed,
        is_archived: mail_item.is_archived,
        is_spam: mail_item.is_spam,
      },
      { is_trashed: true },
    );

    set_is_trash_loading(false);
    if (result.success) {
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: "Moved to trash",
        action_type: "trash",
        email_ids: [email_id],
        on_undo: async () => {
          await update_item_metadata(
            email_id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
              is_read: mail_item.is_read,
              is_starred: mail_item.is_starred,
              is_pinned: mail_item.is_pinned,
              is_trashed: true,
              is_archived: mail_item.is_archived,
              is_spam: mail_item.is_spam,
            },
            { is_trashed: false },
          );
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      on_close();
    }
  }, [email_id, is_trash_loading, on_close, mail_item]);

  const handle_print = useCallback(() => {
    if (!email) return;
    print_email({
      subject: email.subject,
      sender: email.sender,
      sender_email: email.sender_email,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      timestamp: format_email_detail(new Date(email.timestamp)),
      body: email.body,
    });
  }, [email, format_email_detail]);

  const handle_unsubscribe = useCallback(() => {
    if (!email?.unsubscribe_info) return;
    if (email.unsubscribe_info.unsubscribe_link) {
      window.open(
        email.unsubscribe_info.unsubscribe_link,
        "_blank",
        "noopener,noreferrer",
      );
    } else if (email.unsubscribe_info.unsubscribe_mailto) {
      window.location.href = `mailto:${email.unsubscribe_info.unsubscribe_mailto}?subject=Unsubscribe`;
    }
  }, [email]);

  useEffect(() => {
    const handle_keyboard_reply = () => handle_reply();
    const handle_keyboard_forward = () => handle_forward();

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
  }, [handle_reply, handle_forward]);

  useEffect(() => {
    let cancelled = false;

    async function load_email() {
      set_is_loading(true);
      set_error(null);
      set_thread_messages([]);
      set_show_inline_reply(false);

      const result = await get_mail_item(email_id);

      if (cancelled) return;

      if (result.error || !result.data) {
        set_error("Failed to load email");
        set_is_loading(false);

        return;
      }

      const item = result.data;

      if (!item.encrypted_envelope || item.envelope_nonce == null) {
        set_error("Email data is missing");
        set_is_loading(false);

        return;
      }

      const envelope = await decrypt_mail_envelope(
        item.encrypted_envelope,
        item.envelope_nonce,
      );

      if (cancelled) return;

      if (!envelope) {
        set_error("Failed to decrypt email");
        set_is_loading(false);

        return;
      }

      let user_email: string | undefined;

      try {
        const { get_current_account } = await import(
          "@/services/account_manager"
        );
        const account = await get_current_account();

        if (account) {
          user_email = account.user.email;
          set_current_user_email(account.user.email);
        }
      } catch {
        void 0;
      }

      const body_text = user_email
        ? await try_decrypt_ratchet_body(
            envelope.body_text || "",
            user_email,
            envelope.from.email,
          )
        : envelope.body_text || "";

      const unsubscribe = detect_unsubscribe_info("", body_text);

      set_email({
        id: item.id,
        sender:
          envelope.from.name ||
          get_email_username(envelope.from.email) ||
          "Unknown",
        sender_email: envelope.from.email || "",
        subject: envelope.subject || "(No subject)",
        preview: body_text.substring(0, 200),
        timestamp: item.created_at,
        is_read: item.is_read ?? false,
        is_starred: item.is_starred ?? false,
        is_archived: item.is_archived ?? false,
        body: body_text,
        unsubscribe_info: unsubscribe,
        thread_token: item.thread_token,
        to: envelope.to || [],
        cc: envelope.cc || [],
        bcc: envelope.bcc || [],
      });
      set_is_external(item.is_external);
      set_has_pq_protection(!!item.ephemeral_pq_key);
      set_mail_item(item);
      set_is_read(item.is_read ?? false);
      set_is_pinned(item.is_pinned ?? false);

      const single_message: DecryptedThreadMessage = {
        id: item.id,
        item_type: item.item_type as "received" | "sent" | "draft",
        sender_name:
          envelope.from.name ||
          get_email_username(envelope.from.email) ||
          "Unknown",
        sender_email: envelope.from.email || "",
        subject: envelope.subject || "(No subject)",
        body: body_text,
        timestamp: item.message_ts || item.created_at,
        is_read: item.is_read ?? false,
        is_starred: item.is_starred ?? false,
        is_deleted: false,
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
      };

      if (item.thread_token) {
        const thread_result = await fetch_and_decrypt_thread_messages(
          item.thread_token,
          user_email,
        );

        if (!cancelled && thread_result.messages.length > 0) {
          set_thread_messages(thread_result.messages);
        } else if (!cancelled) {
          set_thread_messages([single_message]);
        }
      } else if (!cancelled) {
        set_thread_messages([single_message]);
      }

      set_is_loading(false);

      if (
        !(item.is_read ?? false) &&
        preferences.mark_as_read_delay !== "never"
      ) {
        const mark_read = async () => {
          if (cancelled) return;
          const result = await update_item_metadata(
            item.id,
            {
              encrypted_metadata: item.encrypted_metadata,
              metadata_nonce: item.metadata_nonce,
              metadata_version: item.metadata_version,
              is_read: item.is_read,
            },
            { is_read: true },
          );

          if (result.success) {
            emit_mail_item_updated({ id: item.id, is_read: true });
          }
        };

        if (preferences.mark_as_read_delay === "immediate") {
          void mark_read();
        } else {
          const delay_ms =
            preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

          mark_as_read_timeout.current = window.setTimeout(mark_read, delay_ms);
        }
      }
    }

    if (mark_as_read_timeout.current) {
      clearTimeout(mark_as_read_timeout.current);
      mark_as_read_timeout.current = null;
    }

    load_email();

    return () => {
      cancelled = true;
      if (mark_as_read_timeout.current) {
        clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [email_id, preferences.mark_as_read_delay]);

  useEffect(() => {
    const handle_thread_reply = async (event: Event) => {
      const custom_event = event as CustomEvent<ThreadReplySentEventDetail>;
      const detail = custom_event.detail;

      const matches_thread =
        email?.thread_token && detail.thread_token === email.thread_token;
      const matches_email =
        detail.original_email_id && detail.original_email_id === email_id;

      if (!matches_thread && !matches_email) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const thread_result = await fetch_and_decrypt_thread_messages(
        detail.thread_token,
        current_user_email || undefined,
      );

      if (thread_result.messages.length > 0) {
        set_thread_messages(thread_result.messages);

        if (!email?.thread_token && email) {
          set_email({ ...email, thread_token: detail.thread_token });
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
  }, [email?.thread_token, email_id, email]);

  if (is_loading) {
    return (
      <div
        className="flex flex-col h-full"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <Skeleton className="w-32 h-5" />
          <button
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={on_close}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 p-6">
          <div className="space-y-4">
            <Skeleton className="w-3/4 h-6" />
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="w-32 h-4" />
                <Skeleton className="w-48 h-3" />
              </div>
            </div>
            <div className="space-y-2 pt-4">
              <Skeleton className="w-full h-4" />
              <Skeleton className="w-full h-4" />
              <Skeleton className="w-2/3 h-4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !email) {
    return (
      <div
        className="flex flex-col h-full"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Error
          </span>
          <button
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={on_close}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <NoSymbolIcon
              className="w-12 h-12 mx-auto mb-3"
              style={{ color: "var(--text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {error || "Failed to load email"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="flex items-center gap-1 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={`h-7 w-7 ${is_pinned ? "text-blue-500" : "text-[var(--text-muted)] hover:text-blue-500"}`}
                disabled={is_pin_loading}
                size="icon"
                variant="ghost"
                onClick={handle_pin_toggle}
              >
                <MapPinIcon
                  className={`w-4 h-4 ${is_pinned ? "-rotate-45" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {is_pinned ? "Unpin" : "Pin"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                disabled={is_archive_loading}
                size="icon"
                variant="ghost"
                onClick={handle_archive}
              >
                <ArchiveBoxIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Archive</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                disabled={is_spam_loading}
                size="icon"
                variant="ghost"
                onClick={handle_spam}
              >
                <NoSymbolIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Report spam</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                disabled={is_trash_loading}
                size="icon"
                variant="ghost"
                onClick={handle_trash}
              >
                <TrashIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Delete</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    size="icon"
                    variant="ghost"
                  >
                    <EllipsisHorizontalIcon className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">More</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={handle_read_toggle}>
                {is_read ? (
                  <>
                    <EnvelopeIcon className="w-4 h-4 mr-2" />
                    Mark as unread
                  </>
                ) : (
                  <>
                    <EnvelopeOpenIcon className="w-4 h-4 mr-2" />
                    Mark as read
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handle_pin_toggle}>
                <MapPinIcon
                  className={`w-4 h-4 mr-2 ${is_pinned ? "-rotate-45 text-blue-500" : ""}`}
                />
                {is_pinned ? "Unpin" : "Pin to top"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <FolderIcon className="w-4 h-4 mr-2" />
                Move to folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handle_print}>
                <PrinterIcon className="w-4 h-4 mr-2" />
                Print
              </DropdownMenuItem>
              {email.unsubscribe_info?.has_unsubscribe && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handle_unsubscribe}>
                    <XMarkIcon className="w-4 h-4 mr-2" />
                    Unsubscribe
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>

        <div className="flex-1" />

        <button
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)] flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
          onClick={on_close}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              className="text-blue-500 hover:text-blue-600 transition-colors flex-shrink-0"
              onClick={() => set_show_encryption_info(true)}
            >
              <LockIcon size={18} />
            </button>
            <span
              className="text-lg sm:text-xl font-semibold break-words min-w-0 flex-1 text-left"
              style={{ color: "var(--text-primary)" }}
            >
              {email.subject}
            </span>
          </div>

          <div className="flex items-start gap-2 sm:gap-3 mb-6">
            {is_astermail_sender(email.sender, email.sender_email) ? (
              <img
                alt="Aster Mail"
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0 object-cover"
                draggable={false}
                src="/mail_logo.png"
              />
            ) : (
              <ProfileAvatar
                clickable
                use_domain_logo
                email={email.sender_email}
                name={email.sender}
                size="lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex items-center min-w-0 flex-shrink">
                  <EmailProfileTrigger
                    className="font-medium text-sm truncate"
                    email={email.sender_email}
                    name={email.sender}
                  >
                    <span style={{ color: "var(--text-primary)" }}>
                      {email.sender}
                    </span>
                  </EmailProfileTrigger>
                  <button
                    className="text-xs ml-2 whitespace-nowrap hidden sm:inline hover:underline transition-all"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() =>
                      copy_to_clipboard(email.sender_email, "Email")
                    }
                  >
                    &lt;{email.sender_email}&gt;
                  </button>
                </div>
                <span
                  className="text-xs flex-shrink-0 whitespace-nowrap"
                  style={{ color: "var(--text-muted)" }}
                >
                  {format_email_detail(new Date(email.timestamp))}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  className="text-xs hover:text-[var(--text-secondary)] transition-colors text-left"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => set_show_details(!show_details)}
                >
                  to me {show_details ? "▲" : "▼"}
                </button>
                {thread_messages.length > 1 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {thread_messages.length} messages
                  </span>
                )}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {show_details && (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="mt-2 mb-4 p-3 rounded-lg text-xs space-y-2"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <div className="flex">
                    <span
                      className="w-14 flex-shrink-0 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      From:
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {email.sender_email ? (
                        <>
                          <EmailProfileTrigger
                            email={email.sender_email}
                            name={email.sender}
                          >
                            {email.sender || email.sender_email}
                          </EmailProfileTrigger>{" "}
                          <button
                            className="hover:underline"
                            style={{ color: "var(--text-muted)" }}
                            onClick={() =>
                              copy_to_clipboard(email.sender_email, "Email")
                            }
                          >
                            &lt;{email.sender_email}&gt;
                          </button>
                        </>
                      ) : (
                        <span>{email.sender || "Unknown"}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex">
                    <span
                      className="w-14 flex-shrink-0 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      To:
                    </span>
                    <span
                      className="flex-1 flex flex-wrap gap-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {email.to.length > 0 ? (
                        email.to.map((recipient, idx) => (
                          <span key={idx}>
                            {recipient.email ? (
                              <EmailProfileTrigger
                                email={recipient.email}
                                name={recipient.name}
                              >
                                {recipient.name || recipient.email}
                              </EmailProfileTrigger>
                            ) : (
                              <span>{recipient.name || "Unknown"}</span>
                            )}
                            {idx < email.to.length - 1 && ", "}
                          </span>
                        ))
                      ) : (
                        <span>me</span>
                      )}
                    </span>
                  </div>
                  {email.cc.length > 0 && (
                    <div className="flex">
                      <span
                        className="w-14 flex-shrink-0 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Cc:
                      </span>
                      <span
                        className="flex-1 flex flex-wrap gap-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {email.cc.map((recipient, idx) => (
                          <span key={idx}>
                            <EmailProfileTrigger
                              email={recipient.email}
                              name={recipient.name}
                            >
                              {recipient.name || recipient.email}
                            </EmailProfileTrigger>
                            {idx < email.cc.length - 1 && ", "}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {email.bcc.length > 0 && (
                    <div className="flex">
                      <span
                        className="w-14 flex-shrink-0 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Bcc:
                      </span>
                      <span
                        className="flex-1 flex flex-wrap gap-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {email.bcc.map((recipient, idx) => (
                          <span key={idx}>
                            <EmailProfileTrigger
                              email={recipient.email}
                              name={recipient.name}
                            >
                              {recipient.name || recipient.email}
                            </EmailProfileTrigger>
                            {idx < email.bcc.length - 1 && ", "}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  <div className="flex">
                    <span
                      className="w-14 flex-shrink-0 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Date:
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {format_email_detail(new Date(email.timestamp))}
                    </span>
                  </div>
                  <div className="flex">
                    <span
                      className="w-14 flex-shrink-0 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Subject:
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {email.subject}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {email.unsubscribe_info?.has_unsubscribe && (
            <div
              className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                This sender follows email best practices
              </span>
              {email.unsubscribe_info.unsubscribe_link && (
                <button
                  className="text-xs font-medium ml-auto"
                  style={{ color: "var(--accent-color)" }}
                  onClick={() => {
                    if (email.unsubscribe_info?.unsubscribe_link) {
                      window.open(
                        email.unsubscribe_info.unsubscribe_link,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }
                  }}
                >
                  Unsubscribe
                </button>
              )}
            </div>
          )}

          {snoozed_until && (
            <div
              className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-lg border"
              style={{
                backgroundColor: "rgba(99, 102, 241, 0.08)",
                borderColor: "rgba(99, 102, 241, 0.2)",
              }}
            >
              <ClockIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Snoozed until {format_snooze_target(new Date(snoozed_until))}
                </p>
                <p className="text-xs text-indigo-500/70 dark:text-indigo-400/70 mt-0.5">
                  {format_snooze_time(new Date(snoozed_until))}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <ThreadMessagesList
              hide_counter
              current_user_email={current_user_email}
              default_expanded_id={email.id}
              messages={thread_messages}
              on_toggle_message_read={(message_id) => {
                const msg = thread_messages.find((m) => m.id === message_id);

                if (!msg) return;

                const new_read = !msg.is_read;

                set_thread_messages((prev) =>
                  prev.map((m) =>
                    m.id === message_id ? { ...m, is_read: new_read } : m,
                  ),
                );
                emit_mail_item_updated({ id: message_id, is_read: new_read });

                update_item_metadata(
                  message_id,
                  {
                    encrypted_metadata: msg.encrypted_metadata,
                    metadata_nonce: msg.metadata_nonce,
                    is_read: msg.is_read,
                  },
                  { is_read: new_read },
                ).then((result) => {
                  if (!result.success) {
                    set_thread_messages((prev) =>
                      prev.map((m) =>
                        m.id === message_id ? { ...m, is_read: !new_read } : m,
                      ),
                    );
                    emit_mail_item_updated({
                      id: message_id,
                      is_read: !new_read,
                    });
                  }
                });
              }}
              subject={email.subject}
            />

            <InlineReplySection
              ref={inline_reply_ref}
              body={email.body}
              email_id={email.id}
              is_visible={show_inline_reply}
              sender_email={email.sender_email}
              sender_name={email.sender}
              subject={email.subject}
              thread_token={email.thread_token}
              timestamp={email.timestamp}
              on_close={() => set_show_inline_reply(false)}
              on_reply_sent={handle_inline_reply_sent}
            />
          </div>
        </div>
      </div>

      {!show_inline_reply && (
        <div
          className="flex items-center gap-3 px-4 py-3 border-t"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-primary)",
          }}
        >
          <button
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              background:
                "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
              color: "#ffffff",
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
            onClick={handle_reply}
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            <span>Reply</span>
            <KeyboardShortcutBadge
              className="bg-white/20 border-white/30 text-white/80 shadow-none"
              shortcut="r"
            />
          </button>
          {on_forward && (
            <button
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                boxShadow:
                  "0 1px 2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px var(--border-primary)",
              }}
              onClick={handle_forward}
            >
              <ArrowUturnRightIcon className="w-4 h-4" />
              <span>Forward</span>
              <KeyboardShortcutBadge shortcut="f" />
            </button>
          )}
        </div>
      )}
      <EncryptionInfoModal
        has_pq_protection={has_pq_protection}
        is_external={is_external}
        is_open={show_encryption_info}
        on_close={() => set_show_encryption_info(false)}
      />
    </div>
  );
}
