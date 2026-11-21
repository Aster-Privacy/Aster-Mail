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
import type { SentEncryptionScope } from "@/services/crypto/sent_encryption_evidence";

import { has_sealed_attachment_manifest } from "@/services/crypto/inbound_attachment_keys";
import { shows_end_to_end } from "@/services/crypto/sent_encryption_evidence";

export type StoredAttachmentLabel = "outside" | "end_to_end" | "in_transit";

export interface StoredAttachmentEncryption {
  files_e2e_verified: boolean;
  files_outside_encrypted: boolean;
  label: StoredAttachmentLabel;
}

export function stored_attachment_encryption(options: {
  mail_item_id: string;
  is_external: boolean;
  has_recipient_key?: boolean;
  e2e_verified: boolean;
  sent_encryption_scope?: SentEncryptionScope;
}): StoredAttachmentEncryption {
  const files_e2e_verified =
    options.e2e_verified &&
    (options.sent_encryption_scope !== undefined ||
      has_sealed_attachment_manifest(options.mail_item_id));
  const files_outside_encrypted =
    options.e2e_verified && options.is_external && !files_e2e_verified;
  const end_to_end = shows_end_to_end({
    is_external: options.is_external,
    has_recipient_key: options.has_recipient_key,
    e2e_verified: files_e2e_verified,
    sent_encryption_scope: options.sent_encryption_scope,
  });

  return {
    files_e2e_verified,
    files_outside_encrypted,
    label: files_outside_encrypted
      ? "outside"
      : end_to_end
        ? "end_to_end"
        : "in_transit",
  };
}
