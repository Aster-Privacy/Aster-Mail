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
import { build_list_preview } from "@/utils/preview_text";
import { is_astermail_sender, get_email_username } from "@/lib/utils";
import { list_mail_items, type MailItem } from "@/services/api/mail";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  list_snoozed_emails,
  unsnooze_by_mail_item,
  type SnoozedItem,
} from "@/services/api/snooze";
import {
  decrypt_mail_metadata,
  extract_metadata_from_server,
} from "@/services/crypto/mail_metadata";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { decrypt_body_text_with_bundle } from "@/utils/email_crypto";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import mail_logo_url from "@/assets/mail_logo.webp";

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

function mail_to_email(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
  no_subject_text: string,
  unknown_sender_text: string,
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
    is_starred: item.is_starred,
    is_pinned: item.is_pinned,
    is_trashed: item.is_trashed,
    is_archived: item.is_archived,
    is_spam: item.is_spam,
    has_attachments: item.has_attachments,
    attachment_count: item.attachment_count,
    size_bytes: item.size_bytes,
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
    sender_name:
      from_name || get_email_username(from_email) || unknown_sender_text,
    sender_email: from_email,
    subject: envelope.subject || no_subject_text,
    preview: build_list_preview(strip_html_tags(envelope.body_text)),
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
    avatar_url: is_aster_sender ? mail_logo_url : "",
    is_encrypted: false,
    folders,
    snoozed_until,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
  };
}

export const SNOOZED_IDS_CHUNK_SIZE = 100;

export function chunk_ids(ids: string[], chunk_size: number): string[][] {
  if (chunk_size <= 0) return ids.length > 0 ? [ids] : [];

  const chunks: string[][] = [];

  for (let i = 0; i < ids.length; i += chunk_size) {
    chunks.push(ids.slice(i, i + chunk_size));
  }

  return chunks;
}

export function use_snoozed_emails(): UseSnoozedEmailsReturn {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { preferences } = use_preferences();
  const mounted_ref = useRef(false);
  const fetch_seq_ref = useRef(0);
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

    const seq = ++fetch_seq_ref.current;
    const is_current = () =>
      mounted_ref.current && seq === fetch_seq_ref.current;

    set_state((prev) => ({ ...prev, is_loading: true, error: null }));

    try {
      const snoozed_response = await list_snoozed_emails();

      if (snoozed_response.error) {
        if (is_current()) {
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            has_loaded: true,
            error: t("common.failed_to_load_snoozed_emails"),
          }));
        }

        return;
      }

      if (!snoozed_response.data || snoozed_response.data.length === 0) {
        if (is_current()) {
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

      const mail_items: MailItem[] = [];
      let mail_request_failed = false;

      for (const chunk of chunk_ids(mail_item_ids, SNOOZED_IDS_CHUNK_SIZE)) {
        const mail_response = await list_mail_items({ ids: chunk });

        if (!mail_response.data?.items) {
          mail_request_failed = true;
          break;
        }

        mail_items.push(...mail_response.data.items);
      }

      if (mail_request_failed) {
        if (is_current()) {
          set_state((prev) => ({
            ...prev,
            snoozed_items,
            is_loading: false,
            has_loaded: true,
            error: t("common.failed_to_load_snoozed_emails"),
          }));
        }

        return;
      }

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
            decrypt_mail_envelope<DecryptedEnvelope>(
              item.encrypted_envelope,
              item.envelope_nonce,
              item.id,
            ),
            has_metadata
              ? decrypt_mail_metadata(
                  item.encrypted_metadata!,
                  item.metadata_nonce!,
                  item.metadata_version,
                )
              : Promise.resolve(null),
          ]);

          if (envelope?.body_text) {
            const bundle = await decrypt_body_text_with_bundle(
              envelope.body_text,
              user?.email || "",
              envelope.from?.email || "",
              item.id,
            );
            envelope.body_text = bundle.body;
            if (bundle.subject !== null && !envelope.subject) {
              envelope.subject = bundle.subject;
            }
          }

          const snooze_time = item.snoozed_until || snoozed_map.get(item.id);

          return mail_to_email(
            item,
            envelope,
            metadata,
            format_options,
            t("mail.no_subject"),
            t("common.unknown_sender"),
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

      if (is_current()) {
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
      if (is_current()) {
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

  return {
    state,
    fetch_snoozed,
    unsnooze,
    refresh,
  };
}
