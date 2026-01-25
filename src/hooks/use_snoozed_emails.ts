import type { InboxEmail, DecryptedEnvelope } from "@/types/email";

import { useState, useCallback, useEffect, useRef } from "react";

import { MAIL_EVENTS, emit_snoozed_changed } from "./mail_events";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { is_astermail_sender, get_email_username } from "@/lib/utils";
import { list_mail_items, type MailItem } from "@/services/api/mail";
import {
  list_snoozed_emails,
  unsnooze_by_mail_item,
  type SnoozedItem,
} from "@/services/api/snooze";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { decrypt_envelope_with_bytes } from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";

const CATEGORY_STYLES = {
  placeholder:
    "bg-gray-100 text-gray-400 border border-gray-200 dark:bg-gray-800/30 dark:text-gray-500 dark:border-gray-600",
};

interface SnoozedEmailListState {
  emails: InboxEmail[];
  snoozed_items: SnoozedItem[];
  is_loading: boolean;
  error: string | null;
  total: number;
}

interface UseSnoozedEmailsReturn {
  state: SnoozedEmailListState;
  fetch_snoozed: () => Promise<void>;
  unsnooze: (mail_item_id: string) => Promise<void>;
  refresh: () => void;
}

function base64_to_array(base64: string): Uint8Array {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

async function decrypt_envelope(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as DecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

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
      { name: "AES-GCM", iv: new Uint8Array(base64_to_array(nonce)) },
      crypto_key,
      new Uint8Array(base64_to_array(encrypted)),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

function mail_to_email(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  format_options: FormatOptions,
  snoozed_until?: string,
): InboxEmail {
  const folders = item.labels?.map((label) => ({
    folder_token: label.token,
    name: label.name,
    color: label.color,
    icon: label.icon,
  }));

  if (!envelope) {
    return {
      id: item.id,
      item_type: item.item_type,
      sender_name: "•••••••",
      sender_email: "",
      subject: "••••••••••••••",
      preview: "•••••••••••••••••••••••••••",
      timestamp: format_email_list_timestamp(
        new Date(item.created_at),
        format_options,
      ),
      is_pinned: item.is_pinned ?? false,
      is_starred: item.is_starred ?? false,
      is_selected: false,
      is_read: item.is_read ?? false,
      is_trashed: item.is_trashed ?? false,
      is_archived: item.is_archived ?? false,
      is_spam: item.is_spam ?? false,
      has_attachment: item.has_attachments ?? false,
      category: "",
      category_color: CATEGORY_STYLES.placeholder,
      avatar_url: "",
      is_encrypted: true,
      folders,
      snoozed_until,
    };
  }

  const from_email = envelope.from?.email || "";
  const from_name = envelope.from?.name || "";
  const is_aster_sender = is_astermail_sender(from_name, from_email);

  return {
    id: item.id,
    item_type: item.item_type,
    sender_name: from_name || get_email_username(from_email) || "Unknown",
    sender_email: from_email,
    subject: envelope.subject || "(No subject)",
    preview: strip_html_tags(envelope.body_text).substring(0, 100),
    timestamp: format_email_list_timestamp(
      new Date(envelope.sent_at || item.created_at),
      format_options,
    ),
    is_pinned: item.is_pinned ?? false,
    is_starred: item.is_starred ?? false,
    is_selected: false,
    is_read: item.is_read ?? false,
    is_trashed: item.is_trashed ?? false,
    is_archived: item.is_archived ?? false,
    is_spam: item.is_spam ?? false,
    has_attachment: item.has_attachments ?? false,
    category: "",
    category_color: "",
    avatar_url: is_aster_sender ? "/mail_logo.png" : "",
    is_encrypted: false,
    folders,
    snoozed_until,
  };
}

export function use_snoozed_emails(): UseSnoozedEmailsReturn {
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const mounted_ref = useRef(true);
  const [state, set_state] = useState<SnoozedEmailListState>({
    emails: [],
    snoozed_items: [],
    is_loading: false,
    error: null,
    total: 0,
  });

  const fetch_snoozed = useCallback(async () => {
    if (!user) return;

    set_state((prev) => ({ ...prev, is_loading: true, error: null }));

    try {
      const snoozed_response = await list_snoozed_emails();

      if (snoozed_response.error) {
        if (mounted_ref.current) {
          set_state({
            emails: [],
            snoozed_items: [],
            is_loading: false,
            error: null,
            total: 0,
          });
        }

        return;
      }

      if (!snoozed_response.data || snoozed_response.data.length === 0) {
        if (mounted_ref.current) {
          set_state({
            emails: [],
            snoozed_items: [],
            is_loading: false,
            error: null,
            total: 0,
          });
        }

        return;
      }

      const snoozed_items = snoozed_response.data;
      const mail_item_ids = snoozed_items.map((s) => s.mail_item_id);

      const mail_response = await list_mail_items({ ids: mail_item_ids });

      if (!mail_response.data?.items) {
        if (mounted_ref.current) {
          set_state({
            emails: [],
            snoozed_items,
            is_loading: false,
            error: null,
            total: 0,
          });
        }

        return;
      }

      const mail_items = mail_response.data.items;
      const snoozed_map = new Map(
        snoozed_items.map((s) => [s.mail_item_id, s.snoozed_until]),
      );

      const format_options: FormatOptions = {
        date_format:
          (preferences.date_format as FormatOptions["date_format"]) ||
          "MM/DD/YYYY",
        time_format: preferences.time_format || "12h",
      };

      const results = await Promise.allSettled(
        mail_items.map(async (item) => {
          const envelope = await decrypt_envelope(
            item.encrypted_envelope,
            item.envelope_nonce,
          );

          const snooze_time = item.snoozed_until || snoozed_map.get(item.id);

          return mail_to_email(item, envelope, format_options, snooze_time);
        }),
      );

      const decrypted_emails = results
        .filter(
          (r): r is PromiseFulfilledResult<InboxEmail> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);

      decrypted_emails.sort((a, b) => {
        const date_a = a.snoozed_until
          ? new Date(a.snoozed_until).getTime()
          : Infinity;
        const date_b = b.snoozed_until
          ? new Date(b.snoozed_until).getTime()
          : Infinity;

        if (Number.isNaN(date_a)) return 1;
        if (Number.isNaN(date_b)) return -1;

        return date_a - date_b;
      });

      if (mounted_ref.current) {
        set_state({
          emails: decrypted_emails,
          snoozed_items,
          is_loading: false,
          error: null,
          total: decrypted_emails.length,
        });
      }
    } catch (err) {
      if (mounted_ref.current) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to load snoozed emails",
        }));
      }
    }
  }, [user, preferences.date_format, preferences.time_format]);

  const unsnooze = useCallback(async (mail_item_id: string) => {
    try {
      await unsnooze_by_mail_item(mail_item_id);
      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => e.id !== mail_item_id),
        snoozed_items: prev.snoozed_items.filter(
          (s) => s.mail_item_id !== mail_item_id,
        ),
        total: Math.max(0, prev.total - 1),
      }));
      emit_snoozed_changed();
    } catch {
      return;
    }
  }, []);

  const refresh = useCallback(() => {
    fetch_snoozed();
  }, [fetch_snoozed]);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  useEffect(() => {
    const handle_change = () => {
      fetch_snoozed();
    };

    window.addEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);

    return () => {
      window.removeEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
    };
  }, [fetch_snoozed]);

  return {
    state,
    fetch_snoozed,
    unsnooze,
    refresh,
  };
}
