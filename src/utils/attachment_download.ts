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
import type { TranslationKey } from "@/lib/i18n";

import { get_attachment } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
  download_decrypted_attachment,
  AttachmentKeyUnavailableError,
} from "@/services/crypto/attachment_crypto";

export function attachment_error_key(error: unknown): TranslationKey {
  return error instanceof AttachmentKeyUnavailableError
    ? "common.attachment_locked"
    : "common.download_failed";
}

export async function download_attachment_by_id(
  attachment_id: string,
  mail_item_id: string,
): Promise<void> {
  const response = await get_attachment(attachment_id, mail_item_id);
  const attachment = response.data;

  if (!attachment?.encrypted_data) {
    throw new Error("attachment_bytes_unavailable");
  }

  const meta = await decrypt_attachment_meta(
    attachment.encrypted_meta,
    attachment.meta_nonce,
    attachment.mail_item_id,
    attachment.seq_num,
  );

  const data = await decrypt_attachment_data(
    attachment.encrypted_data,
    attachment.data_nonce,
    meta.session_key,
    attachment.mail_item_id,
    attachment.seq_num,
  );

  download_decrypted_attachment(data, meta.filename, meta.content_type);
}
