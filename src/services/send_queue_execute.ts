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
import { get_current_account } from "./account_manager";
import { create_attachment } from "./api/attachments";
import { mark_thread_read } from "./api/mail";
import { send_external_email, send_simple_email } from "./api/send";
import { describe_send_refusal } from "./send_refusal";
import {
  encrypt_attachments_for_send,
  prepare_external_attachments,
} from "./crypto/attachment_crypto";
import { array_to_base64 } from "./crypto/envelope";
import { encrypt_secure_message } from "./crypto/secure_message_crypto";
import {
  check_send_readiness_internal,
  encrypt_for_recipients,
} from "./send_queue_body_encryption";
import { create_sent_envelope } from "./send_queue_envelope";
import { encrypt_with_ephemeral_key } from "./send_queue_ephemeral";
import { fetch_internal_public_keys } from "./send_queue_recipients";
import { OBSCURED_SUBJECT_PLACEHOLDER } from "./pgp_protected_mime";
import {
  build_signed_mime_payload,
  should_attach_signed_mime,
  should_obscure_outer_subject,
} from "./send_queue_signed_mime";
import {
  SendError,
  create_error,
  type EmailParams,
  type QueuedEmailInternal,
} from "./send_queue_types";

import {
  build_subject_bundle,
  discover_external_recipient_keys,
} from "@/utils/email_crypto";
import { format_bytes } from "@/lib/utils";
import { get_active_translations } from "@/lib/i18n/translations";
import {
  extract_inline_images,
  type Attachment,
} from "@/components/compose/compose_shared";
import { ignore_error } from "@/lib/ignore_error";

export async function execute_send(email: QueuedEmailInternal): Promise<void> {
  const readiness = check_send_readiness_internal();

  if (readiness.ready === false) {
    throw readiness.error;
  }

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError(
      get_active_translations().errors.no_authenticated_account,
    );
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
    is_inline: true,
  }));

  const body_for_recipient =
    inline_images.length > 0 ? recipient_body : email.body;
  const all_attachments = [...(email.attachments || []), ...inline_attachments];

  const bundled_body_for_recipient = build_subject_bundle(
    email.subject || "",
    body_for_recipient,
  );

  const { encrypted_body, is_encrypted, internal_encrypted_body } =
    await encrypt_for_recipients(
      bundled_body_for_recipient,
      all_recipients,
      sender_email,
      email.allow_non_post_quantum === true,
    );

  const final_recipient_body = is_encrypted
    ? encrypted_body
    : body_for_recipient;
  const final_subject = is_encrypted ? "" : email.subject;
  const internal_copy_is_encrypted = is_encrypted || !!internal_encrypted_body;

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

    if (internal_copy_is_encrypted && recipient_public_keys.length === 0) {
      throw create_error(
        "encryption_failed",
        get_active_translations().errors.cannot_send_no_recipient_keys,
      );
    }

    encrypted_attachments = await encrypt_attachments_for_send(
      all_attachments,
      recipient_public_keys.length > 0 ? recipient_public_keys : undefined,
      internal_copy_is_encrypted,
    );
  }

  const request: Parameters<typeof send_simple_email>[0] = {
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: final_subject,
    body: final_recipient_body,
    is_e2e_encrypted: is_encrypted,
    internal_encrypted_body,
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
    in_reply_to: email.in_reply_to,
  };

  const result = await send_simple_email(request);

  if (!result.data?.success) {
    const refusal = describe_send_refusal(result);

    if (refusal) {
      throw create_error(refusal.kind, refusal.message);
    }
    throw create_error(
      "send_failed",
      result.error || get_active_translations().errors.failed_send_email,
    );
  }

  if (effective_thread_id) {
    mark_thread_read(effective_thread_id).catch((caught) =>
      ignore_error("services/send_queue_execute:execute_send", caught),
    );
  }
}

const SENT_COPY_ATTACHMENT_ATTEMPTS = 3;
const SENT_COPY_ATTACHMENT_RETRY_MS = 200;

async function create_attachment_with_retry(
  mail_item_id: string,
  payload: Parameters<typeof create_attachment>[1],
): Promise<void> {
  let last_error: unknown = null;

  for (let attempt = 0; attempt < SENT_COPY_ATTACHMENT_ATTEMPTS; attempt++) {
    try {
      await create_attachment(mail_item_id, payload);

      return;
    } catch (caught) {
      last_error = caught;

      if (attempt < SENT_COPY_ATTACHMENT_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, SENT_COPY_ATTACHMENT_RETRY_MS * (attempt + 1)),
        );
      }
    }
  }

  throw last_error;
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
    is_inline: true,
  }));

  const smtp_attachments = [
    ...(email.attachments || []),
    ...inline_attachments,
  ];

  let body_to_send = inline_images.length > 0 ? smtp_body : email.body;

  const encryption_opts = email.encryption_options;

  let every_recipient_has_a_key = false;

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
        const recipients_with_keys = new Set(
          recipient_keys.map((r) => r.email.toLowerCase()),
        );
        const recipients_without_keys = all_recipients.filter(
          (r) => !recipients_with_keys.has(r.toLowerCase()),
        );

        every_recipient_has_a_key = recipients_without_keys.length === 0;

        if (encryption_opts.require_encryption) {
          if (recipients_without_keys.length > 0) {
            throw create_error(
              "encryption_failed",
              `Cannot send: encryption is required but no keys found for: ${recipients_without_keys.join(", ")}`,
            );
          }
        }
      } else if (encryption_opts.require_encryption) {
        throw create_error(
          "encryption_failed",
          get_active_translations().errors.cannot_send_no_recipient_keys,
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
        every_recipient_has_a_key = false;
        body_to_send = inline_images.length > 0 ? smtp_body : email.body;
      } else {
        throw enc_err;
      }
    }
  }

  const is_secure_external = Boolean(
    email.secure_external && email.expiry_password,
  );

  let secure_message;

  if (is_secure_external && email.expiry_password) {
    const secure_attachments = smtp_attachments.map((a) => ({
      filename: a.name,
      content_type: a.mime_type,
      data: new Uint8Array(a.data),
    }));

    const secure_body = body_to_send.replace(
      /<br\s*\/?>\s*<br\s*\/?>\s*.*?<a\s[^>]*href="https:\/\/astermail\.org"[^>]*>.*?<\/a>/gi,
      "",
    );
    const encrypted_secure = await encrypt_secure_message(
      email.expiry_password,
      { subject: email.subject, body: secure_body },
      secure_attachments,
    );

    secure_message = {
      kdf_salt: encrypted_secure.kdf_salt,
      auth_proof: encrypted_secure.auth_proof,
      kem_ciphertext: encrypted_secure.kem_ciphertext,
      encrypted_kem_seed: encrypted_secure.encrypted_kem_seed,
      kem_seed_nonce: encrypted_secure.kem_seed_nonce,
      encrypted_subject: encrypted_secure.encrypted_subject,
      encrypted_body: encrypted_secure.encrypted_body,
      attachments_bundle:
        encrypted_secure.encrypted_attachments_bundle ?? undefined,
    };
  }

  const signed_mime_attached = should_attach_signed_mime({
    recipients: all_recipients,
    encrypt_emails: encryption_opts?.encrypt_emails,
    require_encryption: encryption_opts?.require_encryption,
    attachments: smtp_attachments,
    secure_external: is_secure_external,
  });

  const encryption_active =
    every_recipient_has_a_key &&
    (encryption_opts?.encrypt_emails === true ||
      encryption_opts?.require_encryption === true ||
      email.force_pgp === true);

  const obscure_outer_subject = should_obscure_outer_subject({
    obscure_subject_preference: encryption_opts?.obscure_subject,
    encryption_active,
    signed_mime_attached,
    secure_external: is_secure_external,
  });

  const ephemeral_subject = is_secure_external
    ? "[secure message]"
    : obscure_outer_subject
      ? OBSCURED_SUBJECT_PLACEHOLDER
      : email.subject;
  const ephemeral_body = is_secure_external ? "[secure message]" : body_to_send;

  const encrypted = await encrypt_with_ephemeral_key(
    { to: email.to, cc: email.cc, bcc: email.bcc },
    ephemeral_subject,
    ephemeral_body,
  );

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError(
      get_active_translations().errors.no_authenticated_account,
    );
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

  if (!is_secure_external && smtp_attachments.length > 0) {
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
    expiry_password: is_secure_external ? undefined : email.expiry_password,
    attachments: is_secure_external ? undefined : external_attachments,
    secure_message,
    force_pgp: is_secure_external ? undefined : email.force_pgp,
  };

  if (signed_mime_attached) {
    const signed = await build_signed_mime_payload({
      subject: email.subject || "",
      body: body_to_send,
      from: sender_email,
      to: email.to,
      cc: email.cc ?? [],
      bcc: email.bcc ?? [],
      attachments: smtp_attachments,
      obscure_subject: obscure_outer_subject,
    });

    if (signed) {
      external_request.signed_mime = signed.signed_mime;
      external_request.signed_mime_signature = signed.signed_mime_signature;
      external_request.signed_mime_micalg = signed.signed_mime_micalg;
    }
  }

  let effective_thread_id = email.thread_id;

  if (!effective_thread_id) {
    const random_bytes = crypto.getRandomValues(new Uint8Array(32));

    effective_thread_id = array_to_base64(random_bytes);
  }

  external_request.thread_token = effective_thread_id;

  const result = await send_external_email(external_request);

  if (!result.data?.success) {
    const refusal = describe_send_refusal(result);

    if (refusal) {
      throw create_error(refusal.kind, refusal.message);
    }
    throw create_error(
      "send_failed",
      result.error || get_active_translations().errors.failed_send_external,
    );
  }

  if (
    result.data.mail_item_id &&
    email.attachments &&
    email.attachments.length > 0
  ) {
    const sent_copy_mail_item_id = result.data.mail_item_id;

    try {
      const encrypted_sender_attachments = await encrypt_attachments_for_send(
        email.attachments,
      );

      for (let i = 0; i < encrypted_sender_attachments.length; i++) {
        const att = encrypted_sender_attachments[i];

        await create_attachment_with_retry(sent_copy_mail_item_id, {
          encrypted_data: att.encrypted_data,
          data_nonce: att.data_nonce,
          encrypted_meta: att.sender_encrypted_meta,
          meta_nonce: att.sender_meta_nonce,
          seq_num: i,
        });
      }
    } catch (caught) {
      ignore_error("services/send_queue_execute:execute_external_send", caught);
    }
  }

  if (effective_thread_id) {
    mark_thread_read(effective_thread_id).catch((caught) =>
      ignore_error("services/send_queue_execute:execute_external_send", caught),
    );
  }
}
