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

import type { InboxEmail } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { list_mail_items } from "@/services/api/mail";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";

export async function fetch_minimal_emails(
  ids: string[],
): Promise<{ emails: InboxEmail[]; failed: boolean }> {
  const FETCH_CHUNK_SIZE = 100;
  const items: MailItem[] = [];
  let failed = false;

  for (let i = 0; i < ids.length; i += FETCH_CHUNK_SIZE) {
    const slice = ids.slice(i, i + FETCH_CHUNK_SIZE);
    const res = await list_mail_items({ ids: slice });

    if (res.data) {
      items.push(...res.data.items);
    } else {
      failed = true;
    }
  }

  const loaded = await Promise.all(
    items.map(async (m) => {
      let metadata = m.metadata ?? null;

      if (!metadata && m.encrypted_metadata && m.metadata_nonce) {
        try {
          metadata = await decrypt_mail_metadata(
            m.encrypted_metadata,
            m.metadata_nonce,
            m.metadata_version,
          );
        } catch {
          metadata = null;
        }
      }

      return {
        id: m.id,
        item_type: m.item_type,
        thread_token: m.thread_token,
        thread_message_count: m.thread_message_count,
        encrypted_metadata: m.encrypted_metadata,
        metadata_nonce: m.metadata_nonce,
        metadata_version: m.metadata_version,
        is_read: m.is_read ?? metadata?.is_read ?? false,
        is_starred: metadata?.is_starred ?? false,
        is_trashed: m.is_trashed === true || (metadata?.is_trashed ?? false),
        is_archived: m.is_archived === true || (metadata?.is_archived ?? false),
        is_spam: m.is_spam === true || (metadata?.is_spam ?? false),
      } as unknown as InboxEmail;
    }),
  );

  return {
    emails: loaded.filter((x): x is InboxEmail => x !== null),
    failed,
  };
}
