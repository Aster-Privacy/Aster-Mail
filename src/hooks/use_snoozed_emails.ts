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
import type { InboxEmail, DecryptedEnvelope } from "@/types/email";
import type { MailItemMetadata } from "@/types/email";

import { useState, useCallback, useEffect, useRef } from "react";

import {
  MAIL_EVENTS,
  emit_snoozed_changed,
  type MailItemsRemovedEventDetail,
} from "./mail_events";

import { filter_protected_folder_emails } from "@/hooks/use_folders";
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
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import { decrypt_message } from "@/services/crypto/key_manager";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  decrypt_mail_metadata,
  extract_metadata_from_server,
} from "@/services/crypto/mail_metadata";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { decrypt_body_text } from "@/utils/email_crypto";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";

const HASH_ALG = ["SHA", "256"].join("-");

interface SnoozedEmailListState {
  emails: InboxEmail[];
  snoozed_items: SnoozedItem[];
  is_loading: boolean;
  has_loaded: boolean;
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

const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  const encrypted_bytes = base64_to_array(encrypted);

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce_bytes },
        crypto_key,
        encrypted_bytes,
      );

      const parsed = JSON.parse(new TextDecoder().decode(decrypted));
      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

async function decrypt_envelope(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return JSON.parse(text) as DecryptedEnvelope;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_message(text, vault.identity_key, pass);

        return JSON.parse(decrypted) as DecryptedEnvelope;
      }

      return null;
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

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

function mail_to_email(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
  no_subject_text: string,
  snoozed_until?: string,
): InboxEmail {
  const folders = item.labels?.map((label) => ({
    folder_token: label.token,
    name: label.name,
    color: label.color,
    icon: label.icon,
  }));

  const effective_metadata = extract_metadata_from_server(metadata, {
    scheduled_at: item.scheduled_at,
    send_status: item.send_status,
    snoozed_until: item.snoozed_until,
    message_ts: item.message_ts,
    item_type: item.item_type,
    is_read: item.is_read,
  });

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
      is_pinned: effective_metadata.is_pinned,
      is_starred: effective_metadata.is_starred,
      is_selected: false,
      is_read: effective_metadata.is_read,
      is_trashed: effective_metadata.is_trashed,
      is_archived: effective_metadata.is_archived,
      is_spam: effective_metadata.is_spam,
      has_attachment: effective_metadata.has_attachments,
      category: "",
      category_color: "",
      avatar_url: "",
      is_encrypted: true,
      folders,
      snoozed_until,
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
      metadata_version: item.metadata_version,
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
    subject: envelope.subject || no_subject_text,
    preview: strip_html_tags(envelope.body_text).substring(0, 100),
    timestamp: format_email_list_timestamp(
      new Date(envelope.sent_at || item.created_at),
      format_options,
    ),
    is_pinned: effective_metadata.is_pinned,
    is_starred: effective_metadata.is_starred,
    is_selected: false,
    is_read: effective_metadata.is_read,
    is_trashed: effective_metadata.is_trashed,
    is_archived: effective_metadata.is_archived,
    is_spam: effective_metadata.is_spam,
    has_attachment: effective_metadata.has_attachments,
    category: "",
    category_color: "",
    avatar_url: is_aster_sender ? "/mail_logo.webp" : "",
    is_encrypted: false,
    folders,
    snoozed_until,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
  };
}

export function use_snoozed_emails(): UseSnoozedEmailsReturn {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const mounted_ref = useRef(false);
  const [state, set_state] = useState<SnoozedEmailListState>({
    emails: [],
    snoozed_items: [],
    is_loading: false,
    has_loaded: false,
    error: null,
    total: 0,
  });

  const fetch_snoozed = useCallback(async () => {
    if (!user) {
      set_state((prev) => ({ ...prev, has_loaded: true }));

      return;
    }

    set_state((prev) => ({ ...prev, is_loading: true, error: null }));

    try {
      const snoozed_response = await list_snoozed_emails();

      if (snoozed_response.error) {
        if (mounted_ref.current) {
          set_state({
            emails: [],
            snoozed_items: [],
            is_loading: false,
            has_loaded: true,
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
            has_loaded: true,
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
            has_loaded: true,
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
          const has_metadata = !!(
            item.encrypted_metadata && item.metadata_nonce
          );

          const [envelope, metadata] = await Promise.all([
            decrypt_envelope(item.encrypted_envelope, item.envelope_nonce),
            has_metadata
              ? decrypt_mail_metadata(
                  item.encrypted_metadata!,
                  item.metadata_nonce!,
                  item.metadata_version,
                )
              : Promise.resolve(null),
          ]);

          if (envelope?.body_text) {
            envelope.body_text = await decrypt_body_text(
              envelope.body_text,
              user?.email || "",
              envelope.from?.email || "",
            );
          }

          const snooze_time = item.snoozed_until || snoozed_map.get(item.id);

          return mail_to_email(
            item,
            envelope,
            metadata,
            format_options,
            t("mail.no_subject"),
            snooze_time,
          );
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

      const visible_emails = filter_protected_folder_emails(decrypted_emails);

      if (mounted_ref.current) {
        set_state({
          emails: visible_emails,
          snoozed_items,
          is_loading: false,
          has_loaded: true,
          error: null,
          total: visible_emails.length,
        });
      }
    } catch (err) {
      if (mounted_ref.current) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          has_loaded: true,
          error:
            err instanceof Error
              ? err.message
              : t("common.failed_to_load_snoozed_emails"),
        }));
      }
    }
  }, [user, preferences.date_format, preferences.time_format, t]);

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

    const handle_items_removed = (event: Event) => {
      const detail = (event as CustomEvent<MailItemsRemovedEventDetail>).detail;
      const id_set = new Set(detail.ids);

      set_state((prev) => ({
        ...prev,
        emails: prev.emails.filter((e) => !id_set.has(e.id)),
        snoozed_items: prev.snoozed_items.filter(
          (s) => !id_set.has(s.mail_item_id),
        ),
        total: Math.max(
          0,
          prev.total - prev.emails.filter((e) => id_set.has(e.id)).length,
        ),
      }));
    };

    window.addEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEMS_REMOVED,
      handle_items_removed,
    );
    window.addEventListener(MAIL_EVENTS.FOLDERS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.PROTECTED_FOLDERS_READY, handle_change);
    window.addEventListener("astermail:folder-locked", handle_change);

    return () => {
      window.removeEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEMS_REMOVED,
        handle_items_removed,
      );
      window.removeEventListener(MAIL_EVENTS.FOLDERS_CHANGED, handle_change);
      window.removeEventListener(
        MAIL_EVENTS.PROTECTED_FOLDERS_READY,
        handle_change,
      );
      window.removeEventListener("astermail:folder-locked", handle_change);
    };
  }, [fetch_snoozed]);

  useEffect(() => {
    if (!state.is_loading) return;
    const safety_timeout = setTimeout(() => {
      set_state((prev) =>
        prev.is_loading ? { ...prev, is_loading: false } : prev,
      );
    }, 10_000);

    return () => clearTimeout(safety_timeout);
  }, [state.is_loading]);

  return {
    state,
    fetch_snoozed,
    unsnooze,
    refresh,
  };
}
