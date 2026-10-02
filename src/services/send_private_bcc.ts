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

import { encrypt_for_recipients } from "./send_queue_body_encryption";
import { fetch_internal_public_keys } from "./send_queue_recipients";
import { is_internal_recipient } from "./recipient_classification";
import { create_error, type EncryptionResult } from "./send_queue_types";
import {
  encrypt_attachments_for_send,
  type EncryptedAttachmentForSend,
} from "./crypto/attachment_crypto";

import { derive_own_public_key } from "@/utils/email_crypto";
import { get_active_translations } from "@/lib/i18n/translations";

export interface PrivateBccEncryption extends EncryptionResult {
  recipient_bodies?: Record<string, string>;
}

export interface PrivateBccRecipients {
  to: string[];
  cc?: string[];
  bcc?: string[];
}

function unique_lower(addresses: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const address of addresses) {
    const key = address.trim().toLowerCase();

    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(address.trim());
  }

  return result;
}

export function hidden_internal_bcc(
  recipients: PrivateBccRecipients,
): string[] {
  const visible = new Set(
    [...recipients.to, ...(recipients.cc ?? [])].map((r) =>
      r.trim().toLowerCase(),
    ),
  );

  return unique_lower(recipients.bcc ?? []).filter(
    (r) => is_internal_recipient(r) && !visible.has(r.toLowerCase()),
  );
}

function shared_targets(recipients: PrivateBccRecipients): string[] {
  const hidden = new Set(
    hidden_internal_bcc(recipients).map((r) => r.toLowerCase()),
  );

  return [
    ...recipients.to,
    ...(recipients.cc ?? []),
    ...(recipients.bcc ?? []),
  ].filter((r) => !hidden.has(r.trim().toLowerCase()));
}

export async function encrypt_with_private_bcc(
  body: string,
  recipients: PrivateBccRecipients,
  sender_email: string,
  allow_non_post_quantum = false,
): Promise<PrivateBccEncryption> {
  const hidden = hidden_internal_bcc(recipients);
  const all = [
    ...recipients.to,
    ...(recipients.cc ?? []),
    ...(recipients.bcc ?? []),
  ];

  if (hidden.length === 0) {
    return encrypt_for_recipients(
      body,
      all,
      sender_email,
      allow_non_post_quantum,
    );
  }

  const targets = shared_targets(recipients);
  const has_external = targets.some((r) => !is_internal_recipient(r));
  const shared_internal = targets.filter(is_internal_recipient);

  const shared = await encrypt_for_recipients(
    body,
    shared_internal.length > 0 ? shared_internal : [sender_email],
    sender_email,
    allow_non_post_quantum,
  );

  const recipient_bodies: Record<string, string> = {};

  for (const recipient of hidden) {
    const own = await encrypt_for_recipients(
      body,
      [recipient],
      sender_email,
      allow_non_post_quantum,
    );

    if (!own.is_encrypted) {
      throw create_error(
        "encryption_failed",
        get_active_translations().errors.failed_encrypt_envelope,
      );
    }
    recipient_bodies[recipient] = own.encrypted_body;
  }

  if (!shared.is_encrypted) {
    throw create_error(
      "encryption_failed",
      get_active_translations().errors.failed_encrypt_envelope,
    );
  }

  return has_external
    ? {
        encrypted_body: body,
        is_encrypted: false,
        internal_encrypted_body: shared.encrypted_body,
        recipient_bodies,
      }
    : {
        encrypted_body: shared.encrypted_body,
        is_encrypted: true,
        recipient_bodies,
      };
}

export async function encrypt_attachments_with_private_bcc(
  attachments: Attachment[],
  recipients: PrivateBccRecipients,
  internal_copy_is_encrypted: boolean,
): Promise<EncryptedAttachmentForSend[]> {
  const hidden = hidden_internal_bcc(recipients);
  let shared_keys = await fetch_internal_public_keys(
    shared_targets(recipients),
  );

  if (shared_keys.length === 0 && hidden.length > 0) {
    const own_key = await derive_own_public_key();

    shared_keys = own_key ? [own_key] : [];
  }

  if (internal_copy_is_encrypted && shared_keys.length === 0) {
    throw create_error(
      "encryption_failed",
      get_active_translations().errors.cannot_send_no_recipient_keys,
    );
  }

  const private_keys: Record<string, string[]> = {};

  for (const recipient of hidden) {
    private_keys[recipient] = await fetch_internal_public_keys([recipient]);
  }

  return encrypt_attachments_for_send(
    attachments,
    shared_keys.length > 0 ? shared_keys : undefined,
    internal_copy_is_encrypted,
    private_keys,
  );
}
