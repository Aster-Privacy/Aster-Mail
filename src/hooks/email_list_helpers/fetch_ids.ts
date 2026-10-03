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

import { decrypt_envelope } from "./decrypt";
import { decrypt_list_item_cached } from "./decrypt_cache";
import { mail_to_email_safe } from "./mapping";

import { list_mail_items } from "@/services/api/mail";
import { map_sync_in_chunks } from "@/lib/scheduling";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";
import { type FormatOptions } from "@/utils/date_format";
import { decrypt_body_text_with_bundle } from "@/utils/email_crypto";
import { apply_flag_intents } from "@/services/read_intent";

const MAP_CHUNK_SIZE = 25;

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

  const fetched_at = Date.now();
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
      const { envelope, metadata, body_summary } =
        await decrypt_list_item_cached(item, user_email, async () => {
          let cacheable = true;
          const has_metadata = !!(
            item.encrypted_metadata && item.metadata_nonce
          );

          let envelope: DecryptedEnvelope | null = null;
          let metadata: MailItemMetadata | null = null;

          try {
            [envelope, metadata] = await Promise.all([
              decrypt_envelope(
                item.encrypted_envelope,
                item.envelope_nonce,
                item.id,
              ),
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
              if (bundle.pgp_undecrypted) cacheable = false;
            } catch {
              envelope.body_text = "";
              cacheable = false;
            }
          }

          return { envelope, metadata, cacheable };
        });

      return { item, envelope, metadata, body_summary };
    }),
  );

  const decrypted = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const mapped = await map_sync_in_chunks(
    decrypted,
    ({ item, envelope, metadata, body_summary }) =>
      mail_to_email_safe(item, envelope, metadata, format_options, {
        body_summary,
      }),
    MAP_CHUNK_SIZE,
  );
  const by_id = new Map<string, InboxEmail>();

  for (const email of mapped) {
    if (email) by_id.set(email.id, email);
  }

  const emails = ids
    .map((id) => by_id.get(id))
    .filter((email): email is InboxEmail => email !== undefined);

  const unrenderable_ids = ids.filter(
    (id) => server_ids.has(id) && !by_id.has(id),
  );

  return {
    emails: apply_flag_intents(emails, fetched_at),
    missing_ids,
    unrenderable_ids,
    request_ok: true,
  };
}
