import type { UnsubscribeInfo } from "@/types/email";
import type { DecryptedThreadMessage } from "@/types/thread";

import { useState, useEffect, useRef, useCallback } from "react";
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
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

import { InlineReplySection } from "@/components/email/inline_reply_section";
import { ThreadDraftBadge } from "@/components/email/thread_draft_badge";
import { SendingMessageBlock } from "@/components/email/sending_message_block";
import { show_toast } from "@/components/toast/simple_toast";
import { show_action_toast } from "@/components/toast/action_toast";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { KeyboardShortcutBadge } from "@/components/common/keyboard_shortcut_badge";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
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
import {
  try_decrypt_ratchet_body,
  try_decrypt_pgp_body,
} from "@/utils/email_crypto";
import { is_astermail_sender, get_email_username } from "@/lib/utils";
import { use_date_format } from "@/hooks/use_date_format";
import { use_preferences } from "@/contexts/preferences_context";
import { EmailProfileTrigger } from "@/components/email/email_profile_trigger";
import { ThreadMessagesList } from "@/components/email/thread_message_block";
import { fetch_and_decrypt_thread_messages } from "@/services/thread_service";
import {
  get_draft_by_thread,
  type DraftWithContent,
  type DraftContent,
} from "@/services/api/multi_drafts";

export interface FullReplyData {
  recipient_name: string;
  recipient_email: string;
  recipient_avatar: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  thread_token?: string;
  original_email_id?: string;
}

export interface FullForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
}

interface FullEmailViewerProps {
  email_id: string;
  on_back: () => void;
  snoozed_until?: string;
  on_forward?: (data: FullForwardData) => void;
  on_edit_draft?: (draft: DraftWithContent) => void;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_index?: number;
  total_count?: number;
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

export function FullEmailViewer({
  email_id,
  on_back,
  snoozed_until,
  on_forward,
  on_edit_draft,
  on_navigate_prev: _on_navigate_prev,
  on_navigate_next: _on_navigate_next,
  can_go_prev: _can_go_prev = false,
  can_go_next: _can_go_next = false,
  current_index: _current_index,
  total_count: _total_count,
}: FullEmailViewerProps): React.ReactElement {
  void _on_navigate_prev;
  void _on_navigate_next;
  void _can_go_prev;
  void _can_go_next;
  void _current_index;
  void _total_count;

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
  const [current_user_name, set_current_user_name] = useState<string>("");
  const [is_external, set_is_external] = useState(false);
  const [has_pq_protection, set_has_pq_protection] = useState(false);
  const [show_inline_reply, set_show_inline_reply] = useState(false);
  const [thread_draft, set_thread_draft] = useState<DraftWithContent | null>(
    null,
  );
  const [sending_message, set_sending_message] =
    useState<DecryptedThreadMessage | null>(null);
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
      sender_avatar: "/mail_logo.webp",
      email_subject: email.subject,
      email_body: email.body,
      email_timestamp: email.timestamp,
    });
  }, [email, on_forward]);

  const handle_edit_thread_draft = useCallback(
    (draft: DraftWithContent) => {
      if (on_edit_draft) {
        on_edit_draft(draft);
      }
    },
    [on_edit_draft],
  );

  const handle_thread_draft_deleted = useCallback(() => {
    set_thread_draft(null);
  }, []);

  const handle_sending_start = useCallback(
    (message: DecryptedThreadMessage) => {
      set_sending_message(message);
      set_thread_draft(null);
    },
    [],
  );

  const handle_sending_end = useCallback(() => {
    set_sending_message(null);
  }, []);

  const handle_draft_saved = useCallback(
    (draft: { id: string; version: number; content: DraftContent }) => {
      if (!email?.thread_token) return;

      const now = new Date().toISOString();
      const expires_at = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      set_thread_draft({
        id: draft.id,
        version: draft.version,
        draft_type: "reply",
        reply_to_id: email.id,
        thread_token: email.thread_token,
        content: draft.content,
        created_at: now,
        updated_at: now,
        expires_at,
      });
    },
    [email?.id, email?.thread_token],
  );

  const handle_read_toggle = useCallback(async () => {
    if (!email_id || !mail_item) return;
    const current_mail_item = mail_item;
    const new_state = !is_read;

    set_is_read(new_state);
    set_mail_item((prev) =>
      prev
        ? {
            ...prev,
            metadata: prev.metadata
              ? { ...prev.metadata, is_read: new_state }
              : undefined,
          }
        : prev,
    );

    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: current_mail_item.encrypted_metadata,
        metadata_nonce: current_mail_item.metadata_nonce,
        metadata_version: current_mail_item.metadata_version,
      },
      { is_read: new_state },
    );

    if (!result.success) {
      set_is_read(!new_state);
      set_mail_item((prev) =>
        prev
          ? {
              ...prev,
              metadata: prev.metadata
                ? { ...prev.metadata, is_read: !new_state }
                : undefined,
            }
          : prev,
      );
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
        metadata_version: mail_item.metadata_version,
      },
      { is_pinned: new_state },
    );

    set_is_pin_loading(false);
    if (!result.success) {
      set_is_pinned(previous_state);
    } else {
      set_mail_item((prev) =>
        prev
          ? {
              ...prev,
              metadata: prev.metadata
                ? { ...prev.metadata, is_pinned: new_state }
                : undefined,
            }
          : prev,
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
      on_back();
    }
  }, [email_id, is_archive_loading, on_back]);

  const handle_spam = useCallback(async () => {
    if (!email_id || is_spam_loading || !mail_item) return;
    set_is_spam_loading(true);
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
        metadata_version: mail_item.metadata_version,
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
            },
            { is_spam: false },
          );
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      on_back();
    }
  }, [email_id, is_spam_loading, on_back, mail_item]);

  const handle_trash = useCallback(async () => {
    if (!email_id || is_trash_loading || !mail_item) return;
    set_is_trash_loading(true);
    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
        metadata_version: mail_item.metadata_version,
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
            },
            { is_trashed: false },
          );
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      on_back();
    }
  }, [email_id, is_trash_loading, on_back, mail_item]);

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
    const handle_keyboard_back = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        on_back();
      }
    };

    window.addEventListener("astermail:keyboard-reply", handle_keyboard_reply);
    window.addEventListener(
      "astermail:keyboard-forward",
      handle_keyboard_forward,
    );
    window.addEventListener("keydown", handle_keyboard_back);

    return () => {
      window.removeEventListener(
        "astermail:keyboard-reply",
        handle_keyboard_reply,
      );
      window.removeEventListener(
        "astermail:keyboard-forward",
        handle_keyboard_forward,
      );
      window.removeEventListener("keydown", handle_keyboard_back);
    };
  }, [handle_reply, handle_forward, on_back]);

  useEffect(() => {
    let cancelled = false;

    async function load_email() {
      set_is_loading(true);
      set_error(null);
      set_thread_messages([]);
      set_show_inline_reply(false);
      set_thread_draft(null);
      set_sending_message(null);

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

      let user_name: string | undefined;

      try {
        const { get_current_account } = await import(
          "@/services/account_manager"
        );
        const account = await get_current_account();

        if (account) {
          user_email = account.user.email;
          user_name = account.user.display_name || account.user.email;
          set_current_user_email(account.user.email);
          set_current_user_name(user_name);
        }
      } catch {
        void 0;
      }

      let body_text = user_email
        ? await try_decrypt_ratchet_body(
            envelope.body_text || "",
            user_email,
            envelope.from.email,
          )
        : envelope.body_text || "";

      body_text = await try_decrypt_pgp_body(body_text);

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
        is_read: item.metadata?.is_read ?? false,
        is_starred: item.metadata?.is_starred ?? false,
        is_archived: item.metadata?.is_archived ?? false,
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
      set_is_read(item.metadata?.is_read ?? false);
      set_is_pinned(item.metadata?.is_pinned ?? false);

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
        is_read: item.metadata?.is_read ?? false,
        is_starred: item.metadata?.is_starred ?? false,
        is_deleted: false,
        is_external: item.is_external,
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

      if (item.thread_token && !cancelled) {
        const { get_vault_from_memory } = await import(
          "@/services/crypto/memory_key_store"
        );
        const current_vault = get_vault_from_memory();

        if (current_vault) {
          const draft_result = await get_draft_by_thread(
            item.thread_token,
            current_vault,
          );

          if (!cancelled && draft_result.data) {
            set_thread_draft(draft_result.data);
          }
        }
      }

      if (
        !(item.metadata?.is_read ?? false) &&
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
            },
            { is_read: true },
          );

          if (result.success && !cancelled) {
            set_is_read(true);
            if (result.encrypted) {
              set_mail_item((prev) =>
                prev
                  ? {
                      ...prev,
                      encrypted_metadata: result.encrypted!.encrypted_metadata,
                      metadata_nonce: result.encrypted!.metadata_nonce,
                      metadata: prev.metadata
                        ? { ...prev.metadata, is_read: true }
                        : undefined,
                    }
                  : prev,
              );
            }
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
        className="flex flex-col h-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div
          className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3 border-b flex-shrink-0 overflow-hidden"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <button
            className="flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-lg text-sm font-medium transition-all hover:bg-[var(--bg-hover)] flex-shrink-0"
            style={{ color: "var(--text-secondary)" }}
            onClick={on_back}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex-1 min-w-0 flex items-center gap-3 overflow-hidden">
            <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
            <Skeleton className="h-4 flex-1 max-w-[180px]" />
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
          </div>
        </div>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full overflow-hidden">
          <Skeleton className="h-7 mb-6 w-full max-w-[66%]" />
          <div className="flex items-start gap-3 sm:gap-4 mb-6 min-w-0">
            <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-4 w-full max-w-[120px]" />
              <Skeleton className="h-3 w-full max-w-[90px]" />
            </div>
            <Skeleton className="h-3 w-24 flex-shrink-0 hidden sm:block" />
          </div>
          <div className="space-y-3 pt-4">
            <Skeleton className="w-full h-4" />
            <Skeleton className="w-full h-4" />
            <Skeleton className="h-4 w-full max-w-[75%]" />
            <Skeleton className="w-full h-4" />
            <Skeleton className="h-4 w-full max-w-[50%]" />
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
          className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <button
            className="flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-lg text-sm font-medium transition-all hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-secondary)" }}
            onClick={on_back}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back</span>
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
            <button
              className="mt-4 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
              onClick={on_back}
            >
              Back to Inbox
            </button>
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
        className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <button
          className="flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-lg text-sm font-medium transition-all hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-secondary)" }}
          onClick={on_back}
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-3">
          <EncryptionInfoDropdown
            has_pq_protection={has_pq_protection}
            is_external={is_external}
            size={16}
          />
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {email.subject}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            className={`h-8 w-8 ${is_pinned ? "text-blue-500 bg-blue-500/10" : "text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10"}`}
            disabled={is_pin_loading}
            size="icon"
            variant="ghost"
            onClick={handle_pin_toggle}
          >
            <MapPinIcon
              className={`w-4 h-4 ${is_pinned ? "-rotate-45" : ""}`}
            />
          </Button>

          <Button
            className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            disabled={is_archive_loading}
            size="icon"
            variant="ghost"
            onClick={handle_archive}
          >
            <ArchiveBoxIcon className="w-4 h-4" />
          </Button>

          <Button
            className="h-8 w-8 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10"
            disabled={is_trash_loading}
            size="icon"
            variant="ghost"
            onClick={handle_trash}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                size="icon"
                variant="ghost"
              >
                <EllipsisHorizontalIcon className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
              <DropdownMenuItem onClick={handle_spam}>
                <NoSymbolIcon className="w-4 h-4 mr-2" />
                Report spam
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
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          <h1
            className="text-xl sm:text-2xl font-semibold mb-6 break-words"
            style={{ color: "var(--text-primary)" }}
          >
            {email.subject}
          </h1>

          <div className="flex items-start gap-3 sm:gap-4 mb-6">
            {is_astermail_sender(email.sender, email.sender_email) ? (
              <img
                alt="Aster Mail"
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0 object-cover"
                draggable={false}
                src="/mail_logo.webp"
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="text-xs hover:text-[var(--text-secondary)] transition-colors text-left"
                      style={{ color: "var(--text-muted)" }}
                    >
                      to me ▼
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-80 p-3 text-xs space-y-2"
                    side="bottom"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      borderColor: "var(--border-primary)",
                    }}
                  >
                    <div className="flex">
                      <span
                        className="w-14 flex-shrink-0 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        From:
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {email.sender ? `${email.sender} ` : ""}
                        <button
                          className="hover:underline"
                          style={{ color: "var(--text-muted)" }}
                          onClick={() =>
                            copy_to_clipboard(email.sender_email, "Email")
                          }
                        >
                          &lt;{email.sender_email}&gt;
                        </button>
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
                        className="flex-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {email.to.length > 0
                          ? email.to
                              .map((r) => r.name || r.email || "Unknown")
                              .join(", ")
                          : "me"}
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
                          className="flex-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {email.cc
                            .map((r) => r.name || r.email || "Unknown")
                            .join(", ")}
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
                          className="flex-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {email.bcc
                            .map((r) => r.name || r.email || "Unknown")
                            .join(", ")}
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
                  </PopoverContent>
                </Popover>
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

            {thread_draft && !show_inline_reply && !sending_message && (
              <ThreadDraftBadge
                current_user_email={current_user_email}
                current_user_name={current_user_name}
                draft={thread_draft}
                on_deleted={handle_thread_draft_deleted}
                on_edit={handle_edit_thread_draft}
              />
            )}

            {sending_message && !show_inline_reply && (
              <div className="mt-4">
                <SendingMessageBlock
                  current_user_name={current_user_name}
                  message={sending_message}
                />
              </div>
            )}

            <InlineReplySection
              ref={inline_reply_ref}
              body={email.body}
              email_id={email.id}
              is_visible={show_inline_reply}
              on_close={() => set_show_inline_reply(false)}
              on_draft_saved={handle_draft_saved}
              on_reply_sent={handle_inline_reply_sent}
              on_sending_end={handle_sending_end}
              on_sending_start={handle_sending_start}
              sender_email={email.sender_email}
              sender_name={email.sender}
              subject={email.subject}
              thread_token={email.thread_token}
              timestamp={email.timestamp}
            />
          </div>
        </div>
      </div>

      {!show_inline_reply && (
        <div
          className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3 border-t"
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
    </div>
  );
}
