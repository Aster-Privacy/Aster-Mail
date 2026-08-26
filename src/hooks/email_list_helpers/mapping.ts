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
import type {
  InboxEmail,
  DecryptedEnvelope,
  MailItemMetadata,
} from "@/types/email";

import { format_timestamp } from "./display";

import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
  is_ratchet_envelope,
} from "@/utils/email_crypto";
import { build_body_preview_cached } from "@/utils/preview_text";
import { classify } from "@/services/mail_categorizer";
import { get_email_username } from "@/lib/utils";
import { resolve_forwarding_display } from "@/utils/forwarding_alias";
import { extract_reply_to } from "@/utils/reply_to";
import { type MailItem } from "@/services/api/mail";
import { normalize_envelope_recipients } from "@/services/crypto/envelope";
import { extract_metadata_from_server } from "@/services/crypto/mail_metadata";
import { type FormatOptions } from "@/utils/date_format";
import { get_cached_profile } from "@/services/api/sender_profiles";

export function mail_to_email(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
): InboxEmail {
  const folders = item.labels?.map((label) => ({
    folder_token: label.token,
    name: label.name,
    color: label.color,
    icon: label.icon,
  }));

  const tags = item.tag_tokens?.map((token) => ({
    id: token,
    name: "",
    color: undefined as string | undefined,
    icon: undefined as string | undefined,
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
      item_type: effective_metadata.item_type as MailItem["item_type"],
      sender_name: "•••••••",
      sender_email: "",
      subject: "••••••••••••••",
      preview: "•••••••••••••••••••••••••••",
      timestamp: format_timestamp(new Date(item.created_at), format_options),
      raw_timestamp: item.created_at,
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
      is_external: item.is_external,
      system_origin: item.system_origin,
      folders,
      tags,
      snoozed_until: effective_metadata.snoozed_until,
      routing_token: item.routing_token,
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
      metadata_version: item.metadata_version,
      expires_at: item.expires_at,
      expiry_type: item.expiry_type,
      send_status: effective_metadata.send_status,
      send_error: item.send_error,
      size_bytes:
        effective_metadata.size_bytes ||
        Math.ceil((item.encrypted_envelope?.length || 0) * 0.75),
    };
  }

  const to_recipients = envelope.to
    ? normalize_envelope_recipients(envelope.to)
    : undefined;
  const recipient_addresses = to_recipients
    ?.map((r) => r.email)
    .filter(Boolean);
  const recipient_names = to_recipients
    ?.map((r) => r.name || get_email_username(r.email))
    .filter(Boolean);

  const resolved_text = envelope.body_text ?? envelope.text_body ?? "";
  const raw_html = envelope.body_html ?? envelope.html_body ?? "";
  const resolved_html = is_ratchet_envelope(raw_html) ? "" : raw_html;
  const is_undecryptable_body =
    resolved_text === RATCHET_UNDECRYPTABLE_SENTINEL ||
    resolved_html === RATCHET_UNDECRYPTABLE_SENTINEL ||
    resolved_text === PGP_UNDECRYPTABLE_SENTINEL ||
    resolved_html === PGP_UNDECRYPTABLE_SENTINEL ||
    is_ratchet_envelope(resolved_text) ||
    (!resolved_text && is_ratchet_envelope(raw_html));
  const preview_text = is_undecryptable_body
    ? RATCHET_UNDECRYPTABLE_SENTINEL
    : build_body_preview_cached(
        `${item.id}:${resolved_text.length}:${resolved_html.length}`,
        resolved_text,
        resolved_html,
      );
  const raw_ts =
    envelope.sent_at ||
    (envelope as unknown as Record<string, string>).date ||
    item.created_at;

  const from_email = envelope.from?.email || "";
  const from_name = envelope.from?.name || "";
  const sender_profile = get_cached_profile(from_email);
  const forwarding = resolve_forwarding_display(
    envelope.from,
    envelope.raw_headers,
  );

  return {
    id: item.id,
    item_type: effective_metadata.item_type as MailItem["item_type"],
    sender_name: from_name || get_email_username(from_email),
    sender_email: from_email,
    ...(forwarding ?? {}),
    subject: envelope.subject || "",
    preview: preview_text,
    body_html: is_undecryptable_body ? RATCHET_UNDECRYPTABLE_SENTINEL : "",
    timestamp: format_timestamp(new Date(raw_ts), format_options),
    raw_timestamp: raw_ts,
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
    mail_category: classify(envelope, metadata, {
      rule_category: item.rule_category,
      trust: item,
    }),
    avatar_url: sender_profile?.profile_picture || "",
    is_encrypted: false,
    is_external: item.is_external,
    system_origin: item.system_origin,
    sender_verification: envelope.sender_verification,
    folders,
    tags,
    snoozed_until: effective_metadata.snoozed_until,
    thread_token: item.thread_token,
    routing_token: item.routing_token,
    thread_message_count: item.thread_message_count,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
    expires_at: item.expires_at,
    expiry_type: item.expiry_type,
    recipient_addresses,
    recipient_names,
    reply_to: extract_reply_to(envelope.raw_headers),
    send_status: effective_metadata.send_status,
    send_error: item.send_error,
    size_bytes:
      effective_metadata.size_bytes ||
      Math.ceil((item.encrypted_envelope?.length || 0) * 0.75),
    phishing_level: item.phishing_level,
  };
}

export function mail_to_email_safe(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
): InboxEmail | null {
  try {
    return mail_to_email(item, envelope, metadata, format_options);
  } catch {
    try {
      return mail_to_email(item, null, null, format_options);
    } catch {
      return null;
    }
  }
}
