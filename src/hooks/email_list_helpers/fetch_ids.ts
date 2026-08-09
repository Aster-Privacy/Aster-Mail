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

import {
  list_mail_items,
} from "@/services/api/mail";
import {
  decrypt_mail_metadata,
} from "@/services/crypto/mail_metadata";
import {
  type FormatOptions,
} from "@/utils/date_format";
import { decrypt_body_text_with_bundle } from "@/utils/email_crypto";
import { decrypt_envelope } from "./decrypt";
import { mail_to_email_safe } from "./mapping";

export interface FetchByIdsResult {
  emails: InboxEmail[];
  missing_ids: string[];
  unrenderable_ids: string[];
  request_ok: boolean;
}

export async function fetch_mail_by_ids_reconciled(
  ids: string[],
  format_options: FormatOptions,
  user_email = "",
): Promise<FetchByIdsResult> {
  if (ids.length === 0) {
    return {
      emails: [],
      missing_ids: [],
      unrenderable_ids: [],
      request_ok: true,
    };
  }

  const response = await list_mail_items({ ids });

  if (!response.data) {
    return {
      emails: [],
      missing_ids: [],
      unrenderable_ids: [],
      request_ok: false,
    };
  }

  const server_ids = new Set(response.data.items.map((item) => item.id));
  const missing_ids = ids.filter((id) => !server_ids.has(id));

  const results = await Promise.allSettled(
    response.data.items.map(async (item) => {
      const has_metadata = !!(item.encrypted_metadata && item.metadata_nonce);

      let envelope: DecryptedEnvelope | null = null;
      let metadata: MailItemMetadata | null = null;

      try {
        [envelope, metadata] = await Promise.all([
          decrypt_envelope(item.encrypted_envelope, item.envelope_nonce, item.id),
          has_metadata
            ? decrypt_mail_metadata(
                item.encrypted_metadata!,
                item.metadata_nonce!,
                item.metadata_version,
              )
            : Promise.resolve(null),
        ]);
      } catch {
        envelope = null;
        metadata = null;
      }

      if (envelope?.body_text) {
        try {
          const bundle = await decrypt_body_text_with_bundle(
            envelope.body_text,
            user_email,
            envelope.from?.email || "",
            item.id,
          );

          envelope.body_text = bundle.body;
          if (bundle.subject !== null && !envelope.subject) {
            envelope.subject = bundle.subject;
          }
        } catch {
          envelope.body_text = "";
        }
      }

      const email = mail_to_email_safe(
        item,
        envelope,
        metadata,
        format_options,
      );

      if (!email) throw new Error("unconvertible mail item");

      return email;
    }),
  );

  const by_id = new Map<string, InboxEmail>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      by_id.set(result.value.id, result.value);
    }
  }

  const emails = ids
    .map((id) => by_id.get(id))
    .filter((email): email is InboxEmail => email !== undefined);

  const unrenderable_ids = ids.filter(
    (id) => server_ids.has(id) && !by_id.has(id),
  );

  return { emails, missing_ids, unrenderable_ids, request_ok: true };
}

