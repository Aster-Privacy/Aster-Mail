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
import type { MailItemMetadata } from "@/types/email";
import type {
  QueuedEmailInternal,
  EmailParams,
  MailEnvelope,
  EncryptionResult,
  EnvelopeData,
  SendReadinessResult,
} from "./send_queue_types";

import { send_simple_email, send_external_email } from "./api/send";
import {
  get_recipient_public_key,
  extract_username_from_email,
  is_internal_email,
} from "./api/keys";
import { encrypt_message_multi } from "./crypto/key_manager";
import {
  get_vault_from_memory,
  get_passphrase_bytes,
  has_passphrase_in_memory,
} from "./crypto/memory_key_store";
import {
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
} from "./crypto/ratchet_manager";
import { get_current_account } from "./account_manager";
import {
  encrypt_envelope_with_bytes,
  array_to_base64,
} from "./crypto/envelope";
import { zero_uint8_array } from "./crypto/secure_memory";
import { encrypt_mail_metadata } from "./crypto/mail_metadata";
import { mark_thread_read } from "./api/mail";
import {
  encrypt_attachments_for_send,
  prepare_external_attachments,
} from "./crypto/attachment_crypto";
import { create_attachment } from "./api/attachments";
import {
  SendError,
  create_error,
  format_time_remaining,
} from "./send_queue_types";

import {
  extract_inline_images,
  type Attachment,
} from "@/components/compose/compose_shared";
import { format_bytes } from "@/lib/utils";
import {
  discover_external_recipient_keys,
  encrypt_for_external_recipients,
} from "@/utils/email_crypto";
import { is_ghost_email } from "@/stores/ghost_alias_store";
import { en } from "@/lib/i18n/translations/en";

const HASH_ALG = ["SHA", "256"].join("-");
const FIELD_ID_RECIPIENTS = 0x01;
const FIELD_ID_SUBJECT = 0x02;
const FIELD_ID_BODY = 0x03;

export async function resolve_username_for_key_lookup(
  email: string,
): Promise<string | null> {
  if (is_ghost_email(email)) {
    const account = await get_current_account();

    if (account?.user?.username) {
      return account.user.username;
    }
  }

  return extract_username_from_email(email);
}

function derive_field_nonce(
  base_nonce: Uint8Array,
  field_id: number,
): Uint8Array {
  const derived = new Uint8Array(12);

  derived.set(base_nonce.subarray(0, 11));
  derived[11] = base_nonce[11] ^ field_id;

  return derived;
}

export async function encrypt_with_ephemeral_key(
  recipients: { to: string[]; cc?: string[]; bcc?: string[] },
  subject: string,
  body: string,
): Promise<{
  encrypted_recipients: string;
  encrypted_subject: string;
  encrypted_body: string;
  ephemeral_key: string;
  nonce: string;
}> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );

  const base_nonce = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();

  const recipients_nonce = derive_field_nonce(base_nonce, FIELD_ID_RECIPIENTS);
  const recipients_data = encoder.encode(JSON.stringify(recipients));
  const encrypted_recipients_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: recipients_nonce },
    key,
    recipients_data,
  );

  const subject_nonce = derive_field_nonce(base_nonce, FIELD_ID_SUBJECT);
  const subject_data = encoder.encode(subject);
  const encrypted_subject_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: subject_nonce },
    key,
    subject_data,
  );

  const body_nonce = derive_field_nonce(base_nonce, FIELD_ID_BODY);
  const body_data = encoder.encode(body);
  const encrypted_body_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: body_nonce },
    key,
    body_data,
  );

  const raw_key = await crypto.subtle.exportKey("raw", key);

  return {
    encrypted_recipients: array_to_base64(
      new Uint8Array(encrypted_recipients_buffer),
    ),
    encrypted_subject: array_to_base64(
      new Uint8Array(encrypted_subject_buffer),
    ),
    encrypted_body: array_to_base64(new Uint8Array(encrypted_body_buffer)),
    ephemeral_key: array_to_base64(new Uint8Array(raw_key)),
    nonce: array_to_base64(base_nonce),
  };
}

export function check_send_readiness_internal(): SendReadinessResult {
  const vault = get_vault_from_memory();

  if (!vault || !vault.identity_key) {
    return {
      ready: false,
      error: create_error(
        "vault_unavailable",
        en.errors.encryption_keys_not_loaded,
      ),
    };
  }

  if (!has_passphrase_in_memory()) {
    return {
      ready: false,
      error: create_error(
        "vault_unavailable",
        en.errors.session_expired_reenter,
      ),
    };
  }

  return { ready: true };
}

export async function encrypt_for_recipients(
  body: string,
  recipients: string[],
  sender_email?: string,
): Promise<EncryptionResult> {
  const internal_recipients = recipients.filter(is_internal_email);

  if (internal_recipients.length === 0) {
    return { encrypted_body: body, is_encrypted: false };
  }

  const external_recipients = recipients.filter((r) => !is_internal_email(r));

  if (external_recipients.length > 0) {
    return { encrypted_body: body, is_encrypted: false };
  }

  const vault = get_vault_from_memory();

  if (
    sender_email &&
    vault?.ratchet_identity_key &&
    vault?.ratchet_identity_public
  ) {
    const ratchet_results: Record<
      string,
      Awaited<ReturnType<typeof encrypt_for_ratchet_recipient>>
    > = {};
    let all_ratchet_ok = true;

    for (const recipient of internal_recipients) {
      const username = await resolve_username_for_key_lookup(recipient);

      if (!username) {
        all_ratchet_ok = false;
        break;
      }

      const result = await encrypt_for_ratchet_recipient(
        sender_email,
        recipient,
        username,
        body,
        vault,
      );

      if (result) {
        ratchet_results[recipient.toLowerCase()] = result;
      } else {
        all_ratchet_ok = false;
        break;
      }
    }

    if (all_ratchet_ok && Object.keys(ratchet_results).length > 0) {
      const envelope = build_ratchet_envelope(
        vault.ratchet_identity_public,
        ratchet_results as Record<
          string,
          NonNullable<(typeof ratchet_results)[string]>
        >,
      );

      return { encrypted_body: envelope, is_encrypted: true };
    }
  }

  const public_keys: string[] = [];

  for (const recipient of internal_recipients) {
    const username = await resolve_username_for_key_lookup(recipient);

    if (!username) {
      return { encrypted_body: body, is_encrypted: false };
    }

    const key_response = await get_recipient_public_key(username, recipient);

    if (key_response.error || !key_response.data) {
      return { encrypted_body: body, is_encrypted: false };
    }

    public_keys.push(key_response.data.public_key);
  }

  if (public_keys.length === 0) {
    return { encrypted_body: body, is_encrypted: false };
  }

  try {
    const encrypted = await encrypt_message_multi(body, public_keys);

    return { encrypted_body: encrypted, is_encrypted: true };
  } catch (err) {
    throw create_error(
      "encryption_failed",
      `Encryption failed: ${err instanceof Error ? err.message : "unknown error"}. Cannot send unencrypted.`,
    );
  }
}

export async function fetch_internal_public_keys(
  recipients: string[],
): Promise<string[]> {
  const internal_recipients = recipients.filter(is_internal_email);
  const public_keys: string[] = [];

  for (const recipient of internal_recipients) {
    const username = await resolve_username_for_key_lookup(recipient);

    if (!username) continue;

    const key_response = await get_recipient_public_key(username, recipient);

    if (key_response.data) {
      public_keys.push(key_response.data.public_key);
    }
  }

  return public_keys;
}

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

  const envelope: MailEnvelope = {
    version: 1,
    subject: email.envelope_subject || email.subject,
    body_text: email.body,
    body_html: email.body,
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

export async function execute_send(email: QueuedEmailInternal): Promise<void> {
  const readiness = check_send_readiness_internal();

  if (readiness.ready === false) {
    throw readiness.error;
  }

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError(en.errors.no_authenticated_account);
  }
  const sender_email = email.sender_email || current_account.user.email;

  const all_recipients = [
    ...email.to,
    ...(email.cc || []),
    ...(email.bcc || []),
  ];

  const { processed_html: recipient_body, images: inline_images } =
    extract_inline_images(email.body);

  const inline_attachments: Attachment[] = inline_images.map((img) => ({
    id: img.id,
    name: img.filename,
    size: format_bytes(img.data.byteLength),
    size_bytes: img.data.byteLength,
    mime_type: img.mime_type,
    data: img.data,
    content_id: img.cid,
  }));

  const body_for_recipient =
    inline_images.length > 0 ? recipient_body : email.body;
  const all_attachments = [...(email.attachments || []), ...inline_attachments];

  const { encrypted_body, is_encrypted } = await encrypt_for_recipients(
    body_for_recipient,
    all_recipients,
    sender_email,
  );

  const envelope_data = await create_sent_envelope(email, sender_email);

  let effective_thread_id = email.thread_id;

  if (!effective_thread_id) {
    const random_bytes = crypto.getRandomValues(new Uint8Array(32));

    effective_thread_id = array_to_base64(random_bytes);
  }

  let encrypted_attachments;

  if (all_attachments.length > 0) {
    const recipient_public_keys =
      await fetch_internal_public_keys(all_recipients);

    encrypted_attachments = await encrypt_attachments_for_send(
      all_attachments,
      recipient_public_keys.length > 0 ? recipient_public_keys : undefined,
    );
  }

  const request: Parameters<typeof send_simple_email>[0] = {
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    body: encrypted_body,
    is_e2e_encrypted: is_encrypted,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
    sender_display_name: email.sender_display_name,
    expires_at: email.expires_at,
    thread_token: effective_thread_id,
    attachments: encrypted_attachments,
    forward_original_mail_id: email.forward_original_mail_id,
  };

  const result = await send_simple_email(request);

  if (!result.data?.success) {
    if (result.code === "RATE_LIMIT_EXCEEDED" && result.resets_at) {
      const time = format_time_remaining(result.resets_at);

      throw create_error(
        "rate_limited",
        en.errors.daily_limit_reached.replace("{{ time }}", time),
      );
    }
    throw create_error("send_failed", result.error || en.errors.failed_send_email);
  }

  if (effective_thread_id) {
    mark_thread_read(effective_thread_id).catch(() => {});
  }
}

export async function execute_external_send(
  email: EmailParams,
  acknowledge_server_readable: boolean = true,
): Promise<void> {
  const readiness = check_send_readiness_internal();

  if (readiness.ready === false) {
    throw readiness.error;
  }

  const all_recipients = [
    ...email.to,
    ...(email.cc || []),
    ...(email.bcc || []),
  ];
  const { processed_html: smtp_body, images: inline_images } =
    extract_inline_images(email.body);

  const inline_attachments: Attachment[] = inline_images.map((img) => ({
    id: img.id,
    name: img.filename,
    size: format_bytes(img.data.byteLength),
    size_bytes: img.data.byteLength,
    mime_type: img.mime_type,
    data: img.data,
    content_id: img.cid,
  }));

  const smtp_attachments = [
    ...(email.attachments || []),
    ...inline_attachments,
  ];

  let body_to_send = inline_images.length > 0 ? smtp_body : email.body;

  const encryption_opts = email.encryption_options;

  if (encryption_opts) {
    try {
      let recipient_keys = email.recipient_keys;

      if (!recipient_keys && encryption_opts.auto_discover_keys) {
        const discovery_result = await discover_external_recipient_keys(
          all_recipients,
          true,
        );

        recipient_keys = discovery_result.recipients_with_keys;
      }

      if (recipient_keys && recipient_keys.length > 0) {
        if (encryption_opts.require_encryption) {
          const recipients_with_keys = new Set(
            recipient_keys.map((r) => r.email.toLowerCase()),
          );
          const recipients_without_keys = all_recipients.filter(
            (r) => !recipients_with_keys.has(r.toLowerCase()),
          );

          if (recipients_without_keys.length > 0) {
            throw create_error(
              "encryption_failed",
              `Cannot send: encryption is required but no keys found for: ${recipients_without_keys.join(", ")}`,
            );
          }
        }

        if (encryption_opts.encrypt_emails && recipient_keys.length > 0) {
          body_to_send = await encrypt_for_external_recipients(
            body_to_send,
            recipient_keys,
          );
        }
      } else if (encryption_opts.require_encryption) {
        throw create_error(
          "encryption_failed",
          en.errors.cannot_send_no_recipient_keys,
        );
      }
    } catch (enc_err) {
      if (
        (enc_err as SendError).type === "encryption_failed" &&
        encryption_opts.require_encryption
      ) {
        throw enc_err;
      }
      if (!encryption_opts.require_encryption) {
        body_to_send = inline_images.length > 0 ? smtp_body : email.body;
      } else {
        throw enc_err;
      }
    }
  }

  const encrypted = await encrypt_with_ephemeral_key(
    { to: email.to, cc: email.cc, bcc: email.bcc },
    email.subject,
    body_to_send,
  );

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError(en.errors.no_authenticated_account);
  }
  const sender_email = email.sender_email || current_account.user.email;

  const internal_email: QueuedEmailInternal = {
    id: crypto.randomUUID(),
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    envelope_subject: email.envelope_subject,
    body: email.body,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
    sender_display_name: email.sender_display_name,
    scheduled_time: Date.now(),
    timeout_id: 0,
    callbacks: {
      on_complete: () => {},
      on_cancel: () => {},
    },
  };

  const envelope_data = await create_sent_envelope(
    internal_email,
    sender_email,
  );

  let external_attachments;

  if (smtp_attachments.length > 0) {
    external_attachments = prepare_external_attachments(smtp_attachments);
  }

  const external_request: Parameters<typeof send_external_email>[0] = {
    encrypted_recipients: encrypted.encrypted_recipients,
    encrypted_subject: encrypted.encrypted_subject,
    encrypted_body: encrypted.encrypted_body,
    ephemeral_key: encrypted.ephemeral_key,
    nonce: encrypted.nonce,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
    sender_display_name: email.sender_display_name,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
    acknowledge_server_readable,
    expires_at: email.expires_at,
    expiry_password: email.expiry_password,
    attachments: external_attachments,
  };

  let effective_thread_id = email.thread_id;

  if (!effective_thread_id) {
    const random_bytes = crypto.getRandomValues(new Uint8Array(32));

    effective_thread_id = array_to_base64(random_bytes);
  }

  external_request.thread_token = effective_thread_id;

  const result = await send_external_email(external_request);

  if (!result.data?.success) {
    if (result.code === "RATE_LIMIT_EXCEEDED" && result.resets_at) {
      const time = format_time_remaining(result.resets_at);

      throw create_error(
        "rate_limited",
        en.errors.daily_limit_reached.replace("{{ time }}", time),
      );
    }
    throw create_error(
      "send_failed",
      result.error || en.errors.failed_send_external,
    );
  }

  if (
    result.data.mail_item_id &&
    email.attachments &&
    email.attachments.length > 0
  ) {
    const encrypted_sender_attachments = await encrypt_attachments_for_send(
      email.attachments,
    );

    for (let i = 0; i < encrypted_sender_attachments.length; i++) {
      const att = encrypted_sender_attachments[i];

      await create_attachment(result.data.mail_item_id, {
        encrypted_data: att.encrypted_data,
        data_nonce: att.data_nonce,
        encrypted_meta: att.sender_encrypted_meta,
        meta_nonce: att.sender_meta_nonce,
        seq_num: i,
      });
    }
  }

  if (effective_thread_id) {
    mark_thread_read(effective_thread_id).catch(() => {});
  }
}
