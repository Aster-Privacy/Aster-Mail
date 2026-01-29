import type { DecryptedEnvelope, UnsubscribeInfo } from "@/types/email";
import type { DecryptedThreadMessage } from "@/types/thread";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  EllipsisHorizontalIcon,
  PrinterIcon,
  FolderIcon,
  NoSymbolIcon,
  MapPinIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { KeyboardShortcutBadge } from "@/components/keyboard_shortcut_badge";
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
import { get_mail_item, type MailItem } from "@/services/api/mail";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import {
  MAIL_EVENTS,
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
  type ThreadReplySentEventDetail,
} from "@/hooks/mail_events";
import { show_action_toast } from "@/components/action_toast";
import { show_toast } from "@/components/simple_toast";
import { EncryptionInfoDropdown } from "@/components/encryption_info_dropdown";
import {
  try_decrypt_ratchet_body,
  try_decrypt_pgp_body,
} from "@/utils/email_crypto";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { extract_email_details } from "@/services/extraction/extractor";
import { PurchaseDetailsBanner } from "@/components/email/purchase_details_banner";
import { ShippingDetailsBanner } from "@/components/email/shipping_details_banner";
import {
  format_snooze_remaining,
  format_snooze_target,
} from "@/utils/date_format";
import { is_astermail_sender, get_email_username } from "@/lib/utils";
import { use_date_format } from "@/hooks/use_date_format";
import { ThreadMessagesList } from "@/components/thread_message_block";
import { print_email } from "@/utils/print_email";
import {
  fetch_and_decrypt_thread_messages,
  get_latest_expanded_id,
} from "@/services/thread_service";
import { InlineReplySection } from "@/components/inline_reply_section";

interface EmailPopupViewerProps {
  email_id: string | null;
  on_close: () => void;
  on_reply?: (data: {
    recipient_name: string;
    recipient_email: string;
    recipient_avatar: string;
    original_subject: string;
    original_body: string;
    original_timestamp: string;
    thread_token?: string;
    original_email_id?: string;
  }) => void;
  on_forward?: (data: {
    sender_name: string;
    sender_email: string;
    sender_avatar: string;
    email_subject: string;
    email_body: string;
    email_timestamp: string;
  }) => void;
  on_compose?: (email: string) => void;
  on_navigate_prev?: () => void;
  on_navigate_next?: () => void;
  can_go_prev?: boolean;
  can_go_next?: boolean;
  current_index?: number;
  total_count?: number;
  snoozed_until?: string;
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
  body: string;
  unsubscribe_info?: UnsubscribeInfo;
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
}

async function decrypt_mail_envelope(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as DecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      return result;
    }

    zero_uint8_array(passphrase_bytes);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const key_hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vault.identity_key + "astermail-envelope-v1"),
    );
    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(envelope_nonce) },
      crypto_key,
      base64_to_array(encrypted_envelope),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}

type PopupSize = "default" | "expanded" | "fullscreen";

const POPUP_MARGIN = 16;
const FULLSCREEN_MARGIN = 64;

export function EmailPopupViewer({
  email_id,
  on_close,
  on_reply: _on_reply,
  on_forward,
  on_compose,
  on_navigate_prev: _on_navigate_prev,
  on_navigate_next: _on_navigate_next,
  can_go_prev: _can_go_prev = false,
  can_go_next: _can_go_next = false,
  current_index: _current_index,
  total_count: _total_count,
  snoozed_until,
}: EmailPopupViewerProps) {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const { format_email_detail, format_email_popup } = use_date_format();
  const [email, set_email] = useState<DecryptedEmail | null>(null);
  const [mail_item, set_mail_item] = useState<MailItem | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [is_read, set_is_read] = useState(true);
  const [is_pinned, set_is_pinned] = useState(false);
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_spam_loading, set_is_spam_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_pin_loading, set_is_pin_loading] = useState(false);
  const [popup_size, set_popup_size] = useState<PopupSize>("default");
  const [position, set_position] = useState({ x: 0, y: 0 });
  const [is_dragging, set_is_dragging] = useState(false);
  const [show_inline_reply, set_show_inline_reply] = useState(false);
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const [current_thread_token, set_current_thread_token] = useState<
    string | null
  >(null);
  const drag_start_ref = useRef({ x: 0, y: 0, pos_x: 0, pos_y: 0 });
  const popup_ref = useRef<HTMLDivElement>(null);
  const inline_reply_ref = useRef<HTMLDivElement>(null);
  const timestamp_date = useRef<Date | null>(null);
  const mark_as_read_timeout = useRef<number | null>(null);

  const is_fullscreen = popup_size === "fullscreen";

  const dimensions = useMemo(() => {
    if (is_fullscreen) {
      return {
        width: window.innerWidth - FULLSCREEN_MARGIN * 2,
        height: window.innerHeight - FULLSCREEN_MARGIN * 2,
      };
    }

    return {
      width: 680,
      height: popup_size === "expanded" ? 860 : 720,
    };
  }, [popup_size, is_fullscreen]);

  const unsubscribe_info = useMemo(() => {
    if (!email) return null;
    if (email.unsubscribe_info) return email.unsubscribe_info;

    return detect_unsubscribe_info(undefined, email.body);
  }, [email]);

  const extraction_result = useMemo(() => {
    if (!email) return null;

    return extract_email_details(
      email.subject,
      email.body,
      undefined,
      email.sender_email,
      email.sender,
    );
  }, [email]);

  useEffect(() => {
    set_position({
      x: window.innerWidth - dimensions.width - POPUP_MARGIN,
      y: window.innerHeight - dimensions.height - POPUP_MARGIN,
    });
  }, []);

  useEffect(() => {
    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [on_close]);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      if (is_fullscreen) return;
      if ((e.target as HTMLElement).closest("button")) return;
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      set_is_dragging(true);
      drag_start_ref.current = {
        x: e.clientX,
        y: e.clientY,
        pos_x: position.x,
        pos_y: position.y,
      };
    },
    [position, is_fullscreen],
  );

  useEffect(() => {
    if (!is_dragging) return;

    const handle_mouse_move = (e: MouseEvent) => {
      const dx = e.clientX - drag_start_ref.current.x;
      const dy = e.clientY - drag_start_ref.current.y;

      set_position({
        x: drag_start_ref.current.pos_x + dx,
        y: drag_start_ref.current.pos_y + dy,
      });
    };

    const handle_mouse_up = () => {
      set_is_dragging(false);
    };

    document.addEventListener("mousemove", handle_mouse_move);
    document.addEventListener("mouseup", handle_mouse_up);

    return () => {
      document.removeEventListener("mousemove", handle_mouse_move);
      document.removeEventListener("mouseup", handle_mouse_up);
    };
  }, [is_dragging]);

  const toggle_size = useCallback(() => {
    if (is_fullscreen) return;

    const new_size = popup_size === "default" ? "expanded" : "default";
    const new_height = new_size === "expanded" ? 820 : 640;

    set_popup_size(new_size);
    set_position((prev) => ({
      x: prev.x,
      y: Math.max(POPUP_MARGIN, window.innerHeight - new_height - POPUP_MARGIN),
    }));
  }, [popup_size, is_fullscreen]);

  const [is_exiting_fullscreen, set_is_exiting_fullscreen] = useState(false);

  const handle_fullscreen = useCallback(() => {
    if (is_fullscreen) {
      set_is_exiting_fullscreen(true);
      setTimeout(() => {
        set_popup_size("default");
        set_position({
          x: window.innerWidth - 520 - POPUP_MARGIN,
          y: window.innerHeight - 640 - POPUP_MARGIN,
        });
        set_is_exiting_fullscreen(false);
      }, 150);
    } else {
      set_popup_size("fullscreen");
    }
  }, [is_fullscreen]);

  const fetch_email = useCallback(async () => {
    if (!email_id) {
      set_error("No email ID provided");

      return;
    }

    set_email(null);
    set_mail_item(null);
    set_error(null);
    set_thread_messages([]);
    set_current_thread_token(null);

    const response = await get_mail_item(email_id);

    if (response.error) {
      set_error(response.error);

      return;
    }

    if (response.data) {
      set_mail_item(response.data);
      set_is_read(response.data.metadata?.is_read ?? false);
      set_is_pinned(response.data.metadata?.is_pinned ?? false);

      const envelope = await decrypt_mail_envelope(
        response.data.encrypted_envelope,
        response.data.envelope_nonce,
      );

      if (envelope) {
        timestamp_date.current = new Date(
          envelope.sent_at || response.data.created_at,
        );

        let body_text = user?.email
          ? await try_decrypt_ratchet_body(
              envelope.body_text,
              user.email,
              envelope.from.email,
            )
          : envelope.body_text;

        body_text = await try_decrypt_pgp_body(body_text);

        const decrypted: DecryptedEmail = {
          id: response.data.id,
          sender: envelope.from.name || get_email_username(envelope.from.email),
          sender_email: envelope.from.email,
          subject: envelope.subject || "(No subject)",
          preview: body_text.substring(0, 200),
          timestamp: format_email_detail(timestamp_date.current),
          is_read: response.data.metadata?.is_read ?? false,
          is_starred: response.data.metadata?.is_starred ?? false,
          body: body_text,
          to: envelope.to || [],
          cc: envelope.cc || [],
          bcc: envelope.bcc || [],
        };

        set_email(decrypted);

        set_current_thread_token(response.data.thread_token || null);

        const single_message: DecryptedThreadMessage = {
          id: response.data.id,
          item_type: response.data.item_type as "received" | "sent" | "draft",
          sender_name:
            envelope.from.name ||
            get_email_username(envelope.from.email) ||
            "Unknown",
          sender_email: envelope.from.email || "",
          subject: envelope.subject || "(No subject)",
          body: body_text || "",
          timestamp: response.data.message_ts || response.data.created_at,
          is_read: response.data.metadata?.is_read ?? false,
          is_starred: response.data.metadata?.is_starred ?? false,
          is_deleted: false,
          is_external: response.data.is_external,
          encrypted_metadata: response.data.encrypted_metadata,
          metadata_nonce: response.data.metadata_nonce,
        };

        if (response.data.thread_token) {
          const thread_result = await fetch_and_decrypt_thread_messages(
            response.data.thread_token,
            user?.email,
          );

          if (thread_result.messages.length > 0) {
            set_thread_messages(thread_result.messages);
          } else {
            set_thread_messages([single_message]);
          }
        } else {
          set_thread_messages([single_message]);
        }

        const item_data = response.data;

        if (
          !(item_data.metadata?.is_read ?? false) &&
          preferences.mark_as_read_delay !== "never"
        ) {
          const current_email_id = email_id;
          const mark_read = async () => {
            if (current_email_id !== email_id) return;

            const result = await update_item_metadata(
              current_email_id,
              {
                encrypted_metadata: item_data.encrypted_metadata,
                metadata_nonce: item_data.metadata_nonce,
                metadata_version: item_data.metadata_version,
              },
              { is_read: true },
            );

            if (result.success && current_email_id === email_id) {
              set_is_read(true);
              emit_mail_item_updated({ id: current_email_id, is_read: true });
            }
          };

          if (preferences.mark_as_read_delay === "immediate") {
            void mark_read();
          } else {
            const delay_ms =
              preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

            mark_as_read_timeout.current = window.setTimeout(
              mark_read,
              delay_ms,
            );
          }
        }
      }
    }
  }, [email_id, format_email_detail, preferences.mark_as_read_delay]);

  useEffect(() => {
    if (mark_as_read_timeout.current) {
      clearTimeout(mark_as_read_timeout.current);
      mark_as_read_timeout.current = null;
    }

    if (email_id) {
      fetch_email();
      set_show_inline_reply(false);
    }

    return () => {
      if (mark_as_read_timeout.current) {
        clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [email_id, fetch_email]);

  useEffect(() => {
    if (!email_id) return;

    const handle_mail_item_updated = (event: Event) => {
      const detail = (event as CustomEvent<MailItemUpdatedEventDetail>).detail;

      if (detail.id !== email_id) return;

      if (detail.is_read !== undefined) {
        set_is_read(detail.is_read);
      }
      if (detail.is_pinned !== undefined) {
        set_is_pinned(detail.is_pinned);
      }
    };

    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEM_UPDATED,
      handle_mail_item_updated,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_mail_item_updated,
      );
    };
  }, [email_id]);

  useEffect(() => {
    const handle_email_sent = () => {
      setTimeout(() => {
        fetch_email();
      }, 500);
    };

    window.addEventListener("astermail:email-sent", handle_email_sent);

    return () => {
      window.removeEventListener("astermail:email-sent", handle_email_sent);
    };
  }, [fetch_email]);

  useEffect(() => {
    const handle_thread_reply = async (event: Event) => {
      const custom_event = event as CustomEvent<ThreadReplySentEventDetail>;
      const detail = custom_event.detail;

      const matches_thread =
        current_thread_token && detail.thread_token === current_thread_token;
      const matches_email =
        detail.original_email_id && detail.original_email_id === email_id;

      if (!matches_thread && !matches_email) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const thread_result = await fetch_and_decrypt_thread_messages(
        detail.thread_token,
        user?.email,
      );

      if (thread_result.messages.length > 0) {
        set_thread_messages(thread_result.messages);

        if (!current_thread_token) {
          set_current_thread_token(detail.thread_token);
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
  }, [current_thread_token, email_id]);

  const handle_read_toggle = useCallback(async () => {
    if (!email_id || !mail_item) return;

    const new_state = !is_read;

    set_is_read(new_state);

    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
        metadata_version: mail_item.metadata_version,
      },
      { is_read: new_state },
    );

    if (!result.success) {
      set_is_read(!new_state);
    } else {
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
      emit_mail_item_updated({ id: email_id, is_read: new_state });
    }
  }, [email_id, is_read, mail_item]);

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
      on_close();
    }
  }, [email_id, is_trash_loading, on_close, mail_item]);

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

  const handle_reply = useCallback(() => {
    set_show_inline_reply(true);
    setTimeout(() => {
      inline_reply_ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 150);
  }, []);

  const handle_forward = useCallback(() => {
    if (!email || !on_forward) return;
    on_forward({
      sender_name: email.sender,
      sender_email: email.sender_email,
      sender_avatar: is_astermail_sender(email.sender, email.sender_email)
        ? "/mail_logo.png"
        : "",
      email_subject: email.subject,
      email_body: email.body,
      email_timestamp: email.timestamp,
    });
  }, [email, on_forward]);

  const handle_inline_reply_sent = useCallback(
    (new_message: DecryptedThreadMessage) => {
      set_thread_messages((prev) => [...prev, new_message]);
      set_show_inline_reply(false);
    },
    [],
  );

  useEffect(() => {
    const handle_keyboard_reply = () => handle_reply();
    const handle_keyboard_forward = () => handle_forward();

    const handle_keyboard_archive = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id) handle_archive();
    };

    const handle_keyboard_delete = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id) handle_trash();
    };

    const handle_keyboard_spam = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id) handle_spam();
    };

    const handle_keyboard_mark_read = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id && !is_read) handle_read_toggle();
    };

    const handle_keyboard_mark_unread = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;

      if (detail.id === email_id && is_read) handle_read_toggle();
    };

    window.addEventListener("astermail:keyboard-reply", handle_keyboard_reply);
    window.addEventListener(
      "astermail:keyboard-forward",
      handle_keyboard_forward,
    );
    window.addEventListener(
      "astermail:keyboard-archive",
      handle_keyboard_archive,
    );
    window.addEventListener(
      "astermail:keyboard-delete",
      handle_keyboard_delete,
    );
    window.addEventListener("astermail:keyboard-spam", handle_keyboard_spam);
    window.addEventListener(
      "astermail:keyboard-mark-read",
      handle_keyboard_mark_read,
    );
    window.addEventListener(
      "astermail:keyboard-mark-unread",
      handle_keyboard_mark_unread,
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
      window.removeEventListener(
        "astermail:keyboard-archive",
        handle_keyboard_archive,
      );
      window.removeEventListener(
        "astermail:keyboard-delete",
        handle_keyboard_delete,
      );
      window.removeEventListener(
        "astermail:keyboard-spam",
        handle_keyboard_spam,
      );
      window.removeEventListener(
        "astermail:keyboard-mark-read",
        handle_keyboard_mark_read,
      );
      window.removeEventListener(
        "astermail:keyboard-mark-unread",
        handle_keyboard_mark_unread,
      );
    };
  }, [
    handle_reply,
    handle_forward,
    handle_archive,
    handle_trash,
    handle_spam,
    handle_read_toggle,
    email_id,
    is_read,
  ]);

  const handle_print = useCallback(() => {
    if (!email) return;

    print_email({
      subject: email.subject,
      sender: email.sender,
      sender_email: email.sender_email,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      timestamp: email.timestamp,
      body: email.body,
    });
  }, [email]);

  const handle_unsubscribe = useCallback(() => {
    if (!unsubscribe_info) return;

    if (unsubscribe_info.unsubscribe_link) {
      window.open(
        unsubscribe_info.unsubscribe_link,
        "_blank",
        "noopener,noreferrer",
      );
    } else if (unsubscribe_info.unsubscribe_mailto) {
      window.location.href = `mailto:${unsubscribe_info.unsubscribe_mailto}?subject=Unsubscribe`;
    }
  }, [unsubscribe_info]);

  if (!email_id) return null;

  const popup_left = is_fullscreen
    ? FULLSCREEN_MARGIN
    : Math.max(0, Math.min(window.innerWidth - dimensions.width, position.x));

  const popup_top = is_fullscreen
    ? FULLSCREEN_MARGIN
    : Math.max(0, Math.min(window.innerHeight - dimensions.height, position.y));

  const popup_content = (
    <motion.div
      ref={popup_ref}
      animate={{ opacity: 1 }}
      className="fixed z-50 flex flex-col shadow-2xl"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      style={{
        left: popup_left,
        top: popup_top,
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: "var(--modal-bg)",
        cursor: is_fullscreen
          ? "default"
          : is_dragging
            ? "grabbing"
            : "default",
        borderRadius: is_fullscreen ? "16px" : "12px",
        border: "1px solid var(--border-primary)",
        willChange: "opacity",
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-1 px-3 py-2 flex-shrink-0 select-none"
        role="presentation"
        style={{
          borderBottom: "1px solid var(--border-primary)",
          cursor: is_fullscreen ? "default" : is_dragging ? "grabbing" : "grab",
          borderTopLeftRadius: is_fullscreen ? "16px" : "12px",
          borderTopRightRadius: is_fullscreen ? "16px" : "12px",
        }}
        onMouseDown={handle_drag_start}
      >
        <Button
          data-no-drag
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          size="icon"
          variant="ghost"
          onClick={on_close}
        >
          <XMarkIcon className="w-4 h-4" />
        </Button>

        {!is_fullscreen && (
          <Button
            data-no-drag
            className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            size="icon"
            variant="ghost"
            onClick={toggle_size}
          >
            {popup_size === "default" ? (
              <ArrowsPointingOutIcon className="w-4 h-4" />
            ) : (
              <ArrowsPointingInIcon className="w-4 h-4" />
            )}
          </Button>
        )}

        <Button
          data-no-drag
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          size="icon"
          variant="ghost"
          onClick={handle_fullscreen}
        >
          {is_fullscreen ? (
            <ArrowsPointingInIcon className="w-4 h-4" />
          ) : (
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          )}
        </Button>

        <div className="flex-1" />

        <Button
          data-no-drag
          className={`h-7 w-7 ${is_pinned ? "text-blue-500" : "text-[var(--text-muted)] hover:text-blue-500"}`}
          disabled={is_pin_loading}
          size="icon"
          variant="ghost"
          onClick={handle_pin_toggle}
        >
          <MapPinIcon className={`w-4 h-4 ${is_pinned ? "-rotate-45" : ""}`} />
        </Button>

        <Button
          data-no-drag
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          disabled={is_archive_loading}
          size="icon"
          variant="ghost"
          onClick={handle_archive}
        >
          <ArchiveBoxIcon className="w-4 h-4" />
        </Button>

        <Button
          data-no-drag
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          disabled={is_spam_loading}
          size="icon"
          variant="ghost"
          onClick={handle_spam}
        >
          <NoSymbolIcon className="w-4 h-4" />
        </Button>

        <Button
          data-no-drag
          className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
              data-no-drag
              className="h-7 w-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              size="icon"
              variant="ghost"
            >
              <EllipsisHorizontalIcon className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
            {unsubscribe_info?.has_unsubscribe && (
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

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <XMarkIcon className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-sm text-[var(--text-secondary)] text-center">
              {error}
            </p>
            <Button size="sm" variant="outline" onClick={on_close}>
              Close
            </Button>
          </div>
        ) : email ? (
          <>
            {unsubscribe_info?.has_unsubscribe && (
              <div
                className="mx-4 mt-4 px-3 py-2.5 rounded-lg flex items-center gap-3"
                style={{
                  backgroundColor: "rgba(139, 92, 246, 0.08)",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                }}
              >
                <EnvelopeIcon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "rgb(139, 92, 246)" }}
                />
                <span className="text-xs text-[var(--text-secondary)] flex-1">
                  This sender allows unsubscribing
                </span>
                <Button
                  className="h-6 px-2 text-xs"
                  size="sm"
                  variant="ghost"
                  onClick={handle_unsubscribe}
                >
                  Unsubscribe
                </Button>
              </div>
            )}

            {snoozed_until && (
              <div
                className="mx-4 mt-4 px-3 py-2.5 rounded-lg flex items-center gap-3"
                style={{
                  backgroundColor: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                }}
              >
                <ClockIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                    Snoozed until{" "}
                    {format_snooze_target(new Date(snoozed_until))}
                  </p>
                  <p className="text-xs text-indigo-500/70 dark:text-indigo-400/70 mt-0.5">
                    {format_snooze_remaining(new Date(snoozed_until))}
                  </p>
                </div>
              </div>
            )}

            {extraction_result?.has_purchase_details &&
              extraction_result.purchase && (
                <PurchaseDetailsBanner
                  className="mx-4 mt-4"
                  details={extraction_result.purchase}
                />
              )}

            {extraction_result?.has_shipping_details &&
              extraction_result.shipping && (
                <ShippingDetailsBanner
                  className="mx-4 mt-4"
                  details={extraction_result.shipping}
                />
              )}

            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <EncryptionInfoDropdown
                  has_pq_protection={!!mail_item?.ephemeral_pq_key}
                  is_external={!!mail_item?.is_external}
                  size={18}
                />
                <h1
                  className="text-lg font-semibold leading-snug flex-1 break-words min-w-0"
                  style={{ color: "var(--text-primary)" }}
                >
                  {email.subject}
                </h1>
                <span
                  className="text-sm flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {email.timestamp}
                </span>
                {is_fullscreen && (
                  <button
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
                    onClick={on_close}
                  >
                    <XMarkIcon
                      className="w-5 h-5"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>
                )}
              </div>

              <div className="flex items-start gap-3">
                {is_astermail_sender(email.sender, email.sender_email) ? (
                  <img
                    alt="Aster Mail"
                    className="h-10 w-10 rounded-full flex-shrink-0 object-cover"
                    draggable={false}
                    src="/mail_logo.png"
                  />
                ) : (
                  <ProfileAvatar
                    clickable
                    use_domain_logo
                    email={email.sender_email}
                    name={email.sender}
                    on_compose={on_compose}
                    size="md"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-medium text-sm"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {email.sender}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors text-left"
                        >
                          to me ▼
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-80 p-3 text-xs space-y-2"
                        side="bottom"
                        style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-primary)" }}
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
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  email.sender_email,
                                );
                                show_toast("Email copied", "success");
                              }}
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
                            {timestamp_date.current
                              ? format_email_popup(timestamp_date.current)
                              : email.timestamp}
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

              <div className="mt-4">
                <ThreadMessagesList
                  hide_counter
                  current_user_email={user?.email || ""}
                  default_expanded_id={get_latest_expanded_id(thread_messages)}
                  messages={thread_messages}
                  on_toggle_message_read={(message_id) => {
                    const msg = thread_messages.find(
                      (m) => m.id === message_id,
                    );

                    if (!msg) return;

                    const new_read = !msg.is_read;

                    set_thread_messages((prev) =>
                      prev.map((m) =>
                        m.id === message_id ? { ...m, is_read: new_read } : m,
                      ),
                    );
                    emit_mail_item_updated({
                      id: message_id,
                      is_read: new_read,
                    });

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
                            m.id === message_id
                              ? { ...m, is_read: !new_read }
                              : m,
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
                  on_close={() => set_show_inline_reply(false)}
                  on_reply_sent={handle_inline_reply_sent}
                  sender_email={email.sender_email}
                  sender_name={email.sender}
                  subject={email.subject}
                  thread_token={current_thread_token || undefined}
                  timestamp={email.timestamp}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[var(--text-muted)]">
                Decrypting...
              </span>
            </div>
          </div>
        )}
      </div>

      {email && !show_inline_reply && (
        <div
          className="flex-shrink-0 flex items-center gap-2 p-3"
          style={{
            borderTop: "1px solid var(--border-primary)",
            borderBottomLeftRadius: is_fullscreen ? "16px" : "12px",
            borderBottomRightRadius: is_fullscreen ? "16px" : "12px",
            background: "var(--modal-bg)",
          }}
        >
          <button
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-sm font-medium text-white transition-all duration-150"
            style={{
              background:
                "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
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
        </div>
      )}
    </motion.div>
  );

  if (is_fullscreen) {
    return (
      <>
        <motion.div
          animate={{ opacity: is_exiting_fullscreen ? 0 : 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            role="button"
            tabIndex={0}
            onClick={on_close}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                on_close();
              }
            }}
          />
          {popup_content}
        </motion.div>
      </>
    );
  }

  return popup_content;
}
