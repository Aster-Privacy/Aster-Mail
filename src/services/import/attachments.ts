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
import type { ParsedAttachment, ParsedEmail } from "./types";
import type { Attachment } from "@/components/compose/compose_shared_core";
import type { ImportedAttachmentData } from "@/services/api/email_import";

import { encrypt_attachments_for_send } from "@/services/crypto/attachment_crypto";

export const MAX_IMPORT_BATCH_ATTACHMENT_BYTES = 48 * 1024 * 1024;

export function importable_attachments(email: ParsedEmail): ParsedAttachment[] {
  return email.attachments.filter(
    (attachment) => attachment.content.length > 0,
  );
}

function to_compose_attachment(
  attachment: ParsedAttachment,
  index: number,
): Attachment {
  const data = attachment.content.slice().buffer as ArrayBuffer;

  return {
    id: `import-${index}`,
    name: attachment.filename,
    size: String(attachment.content.length),
    size_bytes: attachment.content.length,
    mime_type: attachment.content_type || "application/octet-stream",
    data,
    ...(attachment.content_id ? { content_id: attachment.content_id } : {}),
    ...(attachment.is_inline ? { is_inline: true } : {}),
  };
}

export async function encrypt_import_attachments(
  email: ParsedEmail,
): Promise<ImportedAttachmentData[]> {
  const attachments = importable_attachments(email);

  if (attachments.length === 0) return [];

  const encrypted = await encrypt_attachments_for_send(
    attachments.map(to_compose_attachment),
  );

  return encrypted.map((item, seq_num) => ({
    encrypted_data: item.encrypted_data,
    data_nonce: item.data_nonce,
    encrypted_meta: item.sender_encrypted_meta,
    meta_nonce: item.sender_meta_nonce,
    seq_num,
  }));
}

export function encrypted_attachment_bytes(
  attachments: ImportedAttachmentData[] | undefined,
): number {
  if (!attachments) return 0;

  return attachments.reduce(
    (total, attachment) =>
      total +
      attachment.encrypted_data.length +
      attachment.encrypted_meta.length,
    0,
  );
}
