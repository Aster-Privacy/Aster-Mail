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
import type { DecryptedEnvelope, UnsubscribeInfo } from "@/types/email";
import type { DecryptedThreadMessage } from "@/types/thread";

import { get_email_username } from "@/lib/utils";
import {
  try_decrypt_ratchet_body,
  try_decrypt_pgp_body,
  try_extract_mime_body,
} from "@/utils/email_crypto";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";

export interface ProcessedEnvelope {
  body_text: string;
  safe_html: string | undefined;
  unsubscribe_info: UnsubscribeInfo | undefined;
}

export async function process_envelope_body(
  envelope: DecryptedEnvelope,
  user_email?: string,
): Promise<ProcessedEnvelope> {
  let resolved_html = envelope.body_html ?? envelope.html_body ?? undefined;

  if (resolved_html && /^content-type\s*:/im.test(resolved_html)) {
    resolved_html = try_extract_mime_body(resolved_html) || undefined;
  }
  const resolved_text = envelope.body_text ?? envelope.text_body ?? "";

  let body_text = user_email
    ? await try_decrypt_ratchet_body(
        resolved_text,
        user_email,
        envelope.from.email,
      )
    : resolved_text;

  const pre_pgp_text = body_text;

  body_text = await try_decrypt_pgp_body(body_text);
  const pre_mime_text = body_text;

  body_text = try_extract_mime_body(body_text);
  const mime_extracted = body_text !== pre_mime_text;

  const pgp_was_decrypted = body_text !== pre_pgp_text;
  const html_has_pgp =
    resolved_html?.includes("-----BEGIN PGP MESSAGE-----") ?? false;
  const text_had_pgp =
    pre_pgp_text.includes("-----BEGIN PGP MESSAGE-----") && pgp_was_decrypted;
  const content_is_html = /<[a-z][\s\S]*>/i.test(body_text);
  const decrypted_is_html =
    (html_has_pgp || text_had_pgp) && pgp_was_decrypted && content_is_html;
  const safe_html =
    mime_extracted && content_is_html
      ? body_text
      : html_has_pgp || text_had_pgp
        ? decrypted_is_html
          ? body_text
          : undefined
        : resolved_html;

  const unsubscribe = detect_unsubscribe_info(resolved_html || "", body_text, {
    list_unsubscribe: envelope.list_unsubscribe,
    list_unsubscribe_post: envelope.list_unsubscribe_post,
  });

  return {
    body_text,
    safe_html,
    unsubscribe_info: unsubscribe ?? undefined,
  };
}

export function build_preview_text(
  body_text: string,
  safe_html: string | undefined,
): string {
  return (
    body_text ||
    (safe_html
      ? safe_html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "")
  ).substring(0, 200);
}

export function build_single_thread_message(
  item: {
    id: string;
    item_type: string;
    message_ts?: string;
    created_at: string;
    is_external: boolean;
    has_recipient_key?: boolean;
    encrypted_metadata?: string;
    metadata_nonce?: string;
  },
  envelope: DecryptedEnvelope,
  body_text: string,
  safe_html: string | undefined,
  decrypted_metadata: { is_read?: boolean; is_starred?: boolean } | null,
): DecryptedThreadMessage {
  return {
    id: item.id,
    item_type: item.item_type as "received" | "sent" | "draft",
    sender_name:
      envelope.from.name ||
      get_email_username(envelope.from.email) ||
      "Unknown",
    sender_email: envelope.from.email || "",
    subject: envelope.subject || "",
    body: body_text || "",
    html_content: safe_html,
    timestamp: item.message_ts || item.created_at,
    is_read: decrypted_metadata?.is_read ?? false,
    is_starred: decrypted_metadata?.is_starred ?? false,
    is_deleted: false,
    is_external: item.is_external,
    has_recipient_key: item.has_recipient_key,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    to_recipients: envelope.to || [],
    raw_headers: envelope.raw_headers,
  };
}
