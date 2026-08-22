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
import { en } from "@/lib/i18n/translations/en";
import { HASH_ALG } from "@/services/crypto/constants";
import { type MailItemMetadata } from "@/types/email";
import { list_encrypted_mail_items, update_mail_item } from "./api/mail";
import { array_to_base64, base64_to_array, decrypt_envelope_with_bytes, encrypt_envelope_with_bytes } from "./crypto/envelope";
import { encrypt_mail_metadata } from "./crypto/mail_metadata";
import { get_passphrase_bytes, get_vault_from_memory } from "./crypto/memory_key_store";
import { zero_uint8_array } from "./crypto/secure_memory";
import { plain_text_to_html } from "./send_queue_recipients";
import { SendError, create_error, type EnvelopeData, type MailEnvelope, type QueuedEmailInternal } from "./send_queue_types";
import { repair_comment_markup } from "@/lib/html_sanitizer_utils";

const HTML_TAG_PROBE = /<[a-z][\s\S]*>/i;

export async function create_sent_envelope(
  email: QueuedEmailInternal,
  sender_email: string,
): Promise<EnvelopeData> {
  const vault = get_vault_from_memory();
  const passphrase_bytes = get_passphrase_bytes();

  if (!vault || !vault.identity_key) {
    throw create_error(
      "vault_unavailable",
      en.errors.encryption_keys_unavailable,
    );
  }

  if (!passphrase_bytes) {
    throw create_error(
      "vault_unavailable",
      en.errors.session_expired_send,
    );
  }

  const body_is_plain_text = !HTML_TAG_PROBE.test(email.body);

  const plain_body_text = body_is_plain_text
    ? email.body
    : (() => {
        if (typeof DOMParser === "undefined") return "";

        let doc: Document;

        try {
          doc = new DOMParser().parseFromString(
            repair_comment_markup(email.body),
            "text/html",
          );
        } catch {
          return "";
        }

        doc
          .querySelectorAll("script, style, head, noscript, template, iframe, object, embed")
          .forEach((el) => el.remove());

        doc.querySelectorAll("br").forEach((el) => {
          el.replaceWith(doc.createTextNode("\n"));
        });

        doc.querySelectorAll("p, div, li, tr, h1, h2, h3, h4, h5, h6").forEach((el) => {
          el.append(doc.createTextNode("\n"));
        });

        const text = doc.body?.textContent || "";

        return text.replace(/\n{3,}/g, "\n\n").trim();
      })();

  const envelope: MailEnvelope = {
    version: 1,
    subject: email.envelope_subject || email.subject,
    body_text: plain_body_text,
    body_html: body_is_plain_text ? plain_text_to_html(email.body) : email.body,
    from: { name: "", email: sender_email },
    to: email.to.map((e) => ({ name: "", email: e })),
    cc: (email.cc || []).map((e) => ({ name: "", email: e })),
    bcc: (email.bcc || []).map((e) => ({ name: "", email: e })),
    sent_at: new Date().toISOString(),
  };

  try {
    const { encrypted, nonce } = await encrypt_envelope_with_bytes(
      envelope,
      passphrase_bytes,
    );

    zero_uint8_array(passphrase_bytes);

    const encoder = new TextEncoder();
    const folder_material = encoder.encode(vault.identity_key + "folder:sent");
    const folder_hash = await crypto.subtle.digest(HASH_ALG, folder_material);

    const metadata: MailItemMetadata = {
      is_read: true,
      is_starred: false,
      is_pinned: false,
      is_trashed: false,
      is_archived: false,
      is_spam: false,
      size_bytes: new TextEncoder().encode(email.body).length,
      has_attachments: (email.attachments?.length ?? 0) > 0,
      attachment_count: email.attachments?.length ?? 0,
      message_ts: new Date().toISOString(),
      item_type: "sent",
    };

    const encrypted_metadata_result = await encrypt_mail_metadata(metadata);

    return {
      encrypted_envelope: encrypted,
      envelope_nonce: nonce,
      folder_token: array_to_base64(new Uint8Array(folder_hash)),
      encrypted_metadata: encrypted_metadata_result?.encrypted_metadata,
      metadata_nonce: encrypted_metadata_result?.metadata_nonce,
    };
  } catch (err) {
    zero_uint8_array(passphrase_bytes);
    if ((err as SendError).type) {
      throw err;
    }
    throw create_error("encryption_failed", en.errors.failed_encrypt_envelope);
  }
}

export async function reencrypt_all_sent_mail(
  old_passphrase: string,
  new_passphrase: string,
): Promise<void> {
  const old_bytes = new TextEncoder().encode(old_passphrase);
  const new_bytes = new TextEncoder().encode(new_passphrase);

  try {
    let cursor: string | undefined;

    for (;;) {
      const response = await list_encrypted_mail_items({
        item_type: "sent",
        limit: 100,
        cursor,
        include_reactions: true,
      });

      const items = response.data?.items;

      if (!items || items.length === 0) break;

      for (const item of items) {
        if (!item.encrypted_envelope || !item.envelope_nonce) continue;

        const nonce_bytes = base64_to_array(item.envelope_nonce);

        if (!(nonce_bytes.length === 1 && nonce_bytes[0] === 1)) continue;

        try {
          const decrypted = await decrypt_envelope_with_bytes(
            item.encrypted_envelope,
            old_bytes,
          );

          if (!decrypted) continue;

          const { encrypted, nonce } = await encrypt_envelope_with_bytes(
            decrypted as object,
            new_bytes,
          );

          await update_mail_item(item.id, {
            encrypted_envelope: encrypted,
            envelope_nonce: nonce,
          });
        } catch {
          continue;
        }
      }

      cursor = response.data?.next_cursor ?? undefined;

      if (!cursor) break;
    }
  } finally {
    zero_uint8_array(old_bytes);
    zero_uint8_array(new_bytes);
  }
}
