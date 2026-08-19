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
import type { Attachment } from "@/components/compose/compose_shared";
import { array_to_base64 } from "./crypto/base64";
import { is_internal_email } from "./api/keys";
import { sign_detached } from "./crypto/key_manager";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "./crypto/memory_key_store";
import {
  build_protected_mime_entity,
  type ProtectedMimeAttachment,
} from "./pgp_protected_mime";
import { select_published_signing_key } from "./crypto/published_signing_key";

export interface SignedMimePayload {
  signed_mime: string;
  signed_mime_signature: string;
  signed_mime_micalg: string;
}

export interface SignedMimeParams {
  subject: string;
  body: string;
  from: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  attachments?: Attachment[];
  obscure_subject?: boolean;
}

export function should_obscure_outer_subject(params: {
  obscure_subject_preference?: boolean;
  encryption_active: boolean;
  signed_mime_attached: boolean;
  secure_external?: boolean;
}): boolean {
  if (params.obscure_subject_preference !== true) return false;

  if (params.secure_external === true) return false;

  if (!params.encryption_active) return false;

  return params.signed_mime_attached;
}

const text_encoder = new TextEncoder();

export type SigningSkipReason =
  | "vault_identity_key_unavailable"
  | "vault_passphrase_unavailable"
  | "published_key_mismatch_unhealed"
  | "detached_signature_failed";

let last_signing_skip_reason: SigningSkipReason | undefined;

export function get_last_signing_skip_reason(): SigningSkipReason | undefined {
  return last_signing_skip_reason;
}

function report_signing_skipped(reason: SigningSkipReason): void {
  last_signing_skip_reason = reason;
  console.warn(`outbound pgp message left unsigned: ${reason}`);
}

const MAX_SIGNED_ATTACHMENT_BYTES = 11 * 1024 * 1024;

export function has_external_recipient(recipients: string[]): boolean {
  return recipients.some(
    (recipient) => recipient.trim().length > 0 && !is_internal_email(recipient),
  );
}

export function should_attach_signed_mime(params: {
  recipients: string[];
  encrypt_emails?: boolean;
  require_encryption?: boolean;
  attachments?: Attachment[];
  secure_external?: boolean;
}): boolean {
  if (params.secure_external) return false;

  if (!has_external_recipient(params.recipients)) return false;

  const attachment_bytes = (params.attachments ?? []).reduce(
    (total, att) => total + (att.size_bytes ?? att.data.byteLength ?? 0),
    0,
  );

  if (attachment_bytes > MAX_SIGNED_ATTACHMENT_BYTES) return false;

  if (params.encrypt_emails === true || params.require_encryption === true) {
    return true;
  }

  return attachment_bytes === 0;
}

export async function build_signed_mime_payload(
  params: SignedMimeParams,
): Promise<SignedMimePayload | undefined> {
  const all_recipients = [
    ...params.to,
    ...params.cc,
    ...(params.bcc ?? []),
  ];

  if (!has_external_recipient(all_recipients)) return undefined;

  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault?.identity_key || !passphrase) {
    report_signing_skipped(
      vault?.identity_key ? "vault_passphrase_unavailable" : "vault_identity_key_unavailable",
    );

    return undefined;
  }

  const attachments: ProtectedMimeAttachment[] = (params.attachments ?? []).map(
    (att) => ({
      filename: att.name,
      content_type: att.mime_type,
      data_base64: array_to_base64(new Uint8Array(att.data)),
      content_id: att.content_id,
    }),
  );

  const mime = build_protected_mime_entity({
    subject: params.subject,
    body: params.body,
    is_html: true,
    from: params.from,
    to: params.to,
    cc: params.cc,
    attachments,
    obscure_subject: params.obscure_subject === true,
  });

  const mime_bytes = text_encoder.encode(mime);
  const armored_secret_key = await select_published_signing_key(vault);

  if (!armored_secret_key) {
    report_signing_skipped("published_key_mismatch_unhealed");

    return undefined;
  }

  const signed = await sign_detached(mime_bytes, {
    armored_secret_key,
    passphrase,
  });

  if (!signed) {
    report_signing_skipped("detached_signature_failed");

    return undefined;
  }

  last_signing_skip_reason = undefined;

  return {
    signed_mime: array_to_base64(mime_bytes),
    signed_mime_signature: signed.signature,
    signed_mime_micalg: signed.micalg,
  };
}
